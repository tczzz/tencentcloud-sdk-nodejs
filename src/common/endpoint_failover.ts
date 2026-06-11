import { FetchError } from "node-fetch"
import { CircuitBreaker, CircuitBreakerToken } from "./circuit_breaker"

/**
 * Known Tencent Cloud API endpoint suffixes. Failover rotates among these while
 * preserving the host prefix (including family labels like "ai") verbatim.
 */
const KNOWN_API_SUFFIXES: readonly string[] = [
  "tencentcloudapi.com",
  "tencentcloudapi.cn",
  "tencentcloudapi.com.cn",
]

/** Prefixes that identify a regional label (e.g. "ap-shanghai"). */
const REGION_PREFIXES: string[] = ["ap-", "na-", "eu-", "sa-", "af-", "me-"]

/** Breaker Open -> HalfOpen timeout (ms). */
const BREAKER_TIMEOUT_MS = 60 * 1000

/** Node.js error codes indicating network / DNS / TLS failures eligible for failover. */
const FAILOVER_ERROR_CODES: Set<string> = new Set([
  // DNS resolution failures
  "ENOTFOUND",
  "EAI_AGAIN",
  // Connection failures
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  // TLS / certificate failures
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "SELF_SIGNED_CERT_IN_CHAIN",
])

/** Classification of a host against the known endpoint suffixes. */
export interface SuffixMatch {
  /** Index into KNOWN_API_SUFFIXES (0 = .com, 1 = .cn, 2 = .com.cn). */
  suffixIdx: number
  /** Whether the host carries a regional label (e.g. "ap-shanghai"). */
  hasRegion: boolean
  /** The host prefix preserved verbatim (e.g. "cvm", "hunyuan.ai"). */
  servicePrefix: string
}

/** One failover candidate host. */
interface Candidate {
  host: string
}

/** Per-originalHost failover state: one CircuitBreaker per candidate host. */
class FailoverState {
  /** One CircuitBreaker per candidate host. */
  private breakers: Map<string, CircuitBreaker> = new Map()
  private breakerTimeoutMs: number

  constructor(breakerTimeoutMs: number) {
    this.breakerTimeoutMs = breakerTimeoutMs
  }

  breakerFor(host: string): CircuitBreaker {
    let b = this.breakers.get(host)
    if (!b) {
      b = new CircuitBreaker({ timeoutMs: this.breakerTimeoutMs })
      this.breakers.set(host, b)
    }
    return b
  }
}

/**
 * Domain failover for Tencent Cloud API calls. Two modes share one pipeline:
 * backupEndpoint fallback, or suffix rotation (.com / .cn / .com.cn) preserving
 * the host prefix (region-pinned hosts opt out). Per-host CircuitBreakers
 * suppress repeated attempts; state is per AbstractClient instance.
 */
export class EndpointFailover {
  private backupEndpoint: string | null
  // Per-originHost state, created lazily; bounded by the client's fixed endpoint set.
  private state: Map<string, FailoverState> = new Map()

  constructor(options?: { backupEndpoint?: string }) {
    const bp = options && options.backupEndpoint
    this.backupEndpoint = bp && bp.length > 0 ? bp : null
  }

  /**
   * Execute a request with domain failover.
   *
   * Picks the first candidate whose circuit breaker is closed, sends a single
   * request to it, and returns/throws its outcome without trying the next one.
   * The breaker is updated on both success and network-level failure, so it
   * alone governs when an unhealthy host is reattempted.
   *
   * @param endpoint The original endpoint (e.g. "cvm.tencentcloudapi.com")
   * @param requestFn Sends the request to a given host and resolves with the raw response.
   * @param parseFn Parses the raw response and owns the health judgement: throw an
   *   error flagged `failover` (or a network error) for unhealthy responses, and a
   *   plain business error otherwise.
   * @returns The parsed result of the request
   */
  async execute<T>(
    endpoint: string,
    requestFn: (endpoint: string) => Promise<any>,
    parseFn: (res: any) => Promise<T>
  ): Promise<T> {
    const candidates = this.planFor(endpoint)
    if (!candidates) {
      return parseFn(await requestFn(endpoint))
    }

    const state = this.stateFor(endpoint)

    for (const c of candidates) {
      const token: CircuitBreakerToken = state.breakerFor(c.host).allow()
      if (!token.allowed) {
        continue
      }
      try {
        const raw = await requestFn(c.host)
        const result = await parseFn(raw)
        token.recordResult(true)
        return result
      } catch (e: any) {
        if (EndpointFailover.shouldFailover(e)) {
          token.recordResult(false)
        }
        throw e
      }
    }

    throw new Error(`skipped ${candidates[0].host}: circuit breaker open`)
  }

  /**
   * Builds the candidate list, or null when the request should pass through
   * unchanged (custom host without backupEndpoint, or a region-pinned host).
   */
  private planFor(endpoint: string): Candidate[] | null {
    if (this.backupEndpoint) {
      const backupHost = backupHostFor(serviceOf(endpoint), this.backupEndpoint)
      return [{ host: endpoint }, { host: backupHost }]
    }
    const m = suffixMatchOf(endpoint)
    if (!m || m.hasRegion) {
      return null
    }
    return suffixTryOrder(m.suffixIdx).map((s) => ({
      host: m.servicePrefix + "." + KNOWN_API_SUFFIXES[s],
    }))
  }

  private stateFor(originHost: string): FailoverState {
    let s = this.state.get(originHost)
    if (!s) {
      s = new FailoverState(BREAKER_TIMEOUT_MS)
      this.state.set(originHost, s)
    }
    return s
  }

  /**
   * Whether an error is eligible for failover: network-layer errors (DNS,
   * connection, TLS) or errors explicitly flagged `failover`. Business errors are not.
   */
  static shouldFailover(error: any): boolean {
    if (!error) {
      return false
    }
    // Explicitly flagged by the response parser
    if (error.failover) {
      return true
    }
    // Node.js network error code, directly or via node-fetch's nested cause
    if (error.code && FAILOVER_ERROR_CODES.has(error.code)) {
      return true
    }
    if (error.cause && error.cause.code && FAILOVER_ERROR_CODES.has(error.cause.code)) {
      return true
    }
    // node-fetch FetchError raised at the system level
    if ((error instanceof FetchError || error.name === "FetchError") && error.type === "system") {
      return true
    }
    // Fallback: a known network error code surfaced only in the message text
    if (typeof error.message === "string") {
      for (const code of FAILOVER_ERROR_CODES) {
        if (error.message.includes(code)) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Whether a host is a known Tencent Cloud API domain (region-pinned included).
   */
  static isKnownTencentCloudHost(host: string): boolean {
    return suffixMatchOf(host) != null
  }

  /**
   * Classify a host against the known endpoint suffixes. Returns null if none matches.
   */
  static suffixMatchOf(host: string): SuffixMatch | null {
    return suffixMatchOf(host)
  }
}

/**
 * Recognise host = "<prefix>.<suffix>". The prefix is preserved verbatim; only a
 * regional label sets hasRegion. Returns null if no known suffix matches.
 */
function suffixMatchOf(host: string): SuffixMatch | null {
  if (!host) {
    return null
  }
  const suffixIdx = matchSuffix(host)
  if (suffixIdx < 0) {
    return null
  }
  const prefix = host.substring(0, host.length - KNOWN_API_SUFFIXES[suffixIdx].length - 1)
  const hasRegion = prefix.split(".").some(looksLikeRegionLabel)
  return { suffixIdx, hasRegion, servicePrefix: prefix }
}

/** Index of the longest KNOWN_API_SUFFIXES entry suffixing host, or -1. */
function matchSuffix(host: string): number {
  let best = -1
  let bestLen = -1
  for (let i = 0; i < KNOWN_API_SUFFIXES.length; i++) {
    const suffix = "." + KNOWN_API_SUFFIXES[i]
    if (!host.endsWith(suffix) || suffix.length <= bestLen) {
      continue
    }
    const prefix = host.substring(0, host.length - suffix.length)
    if (!prefix || prefix.startsWith(".") || prefix.endsWith(".")) {
      continue
    }
    best = i
    bestLen = suffix.length
  }
  return best
}

function looksLikeRegionLabel(label: string): boolean {
  return !!label && REGION_PREFIXES.some((p) => label.startsWith(p))
}

function serviceOf(host: string): string {
  const dot = host.indexOf(".")
  return dot < 0 ? host : host.substring(0, dot)
}

/**
 * Resolve the backup host from backupEndpoint: prepend the service unless the
 * value already starts with it.
 */
function backupHostFor(service: string, backupEndpoint: string): string {
  if (service && backupEndpoint.startsWith(service + ".")) {
    return backupEndpoint
  }
  return service + "." + backupEndpoint
}

/** Try order: the original suffix first, then the remaining suffixes in order. */
function suffixTryOrder(originIdx: number): number[] {
  const order: number[] = [originIdx]
  for (let i = 0; i < KNOWN_API_SUFFIXES.length; i++) {
    if (i !== originIdx) {
      order.push(i)
    }
  }
  return order
}

// Export for testing and backward compatibility.
export { suffixMatchOf, KNOWN_API_SUFFIXES }

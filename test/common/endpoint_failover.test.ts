import { describe, it, expect, vi } from "vitest"
import {
  EndpointFailover,
  suffixMatchOf,
  KNOWN_API_SUFFIXES,
} from "common/endpoint_failover"

/** parseFn that returns the raw request result unchanged. */
const echo = async (r: any) => r

function makeNetErr(code: string, msg?: string): Error {
  const err = new Error(msg || code)
  ;(err as any).code = code
  return err
}

function makeFailoverable(msg = "hijacked"): Error {
  const err = new Error(msg)
  ;(err as any).failover = true
  return err
}

describe("EndpointFailover", () => {
  describe("isKnownTencentCloudHost", () => {
    it("recognizes plain family hosts", () => {
      expect(EndpointFailover.isKnownTencentCloudHost("cvm.tencentcloudapi.com")).toBe(true)
      expect(EndpointFailover.isKnownTencentCloudHost("cvm.tencentcloudapi.cn")).toBe(true)
      expect(EndpointFailover.isKnownTencentCloudHost("cvm.tencentcloudapi.com.cn")).toBe(true)
    })

    it("recognizes region-pinned hosts (still known, even if not eligible for rotation)", () => {
      expect(
        EndpointFailover.isKnownTencentCloudHost("cvm.ap-shanghai.tencentcloudapi.com")
      ).toBe(true)
    })

    it("recognizes ai. and internal. prefixes", () => {
      expect(EndpointFailover.isKnownTencentCloudHost("hunyuan.ai.tencentcloudapi.com")).toBe(true)
      expect(EndpointFailover.isKnownTencentCloudHost("cvm.internal.tencentcloudapi.com")).toBe(true)
      expect(
        EndpointFailover.isKnownTencentCloudHost("cvm.internal.ap-guangzhou.tencentcloudapi.com")
      ).toBe(true)
    })

    it("rejects non-tencentcloud hosts", () => {
      expect(EndpointFailover.isKnownTencentCloudHost("example.com")).toBe(false)
      expect(EndpointFailover.isKnownTencentCloudHost("cvm.tencentcloudapi.woa.com")).toBe(false)
      expect(EndpointFailover.isKnownTencentCloudHost("proxy.internal")).toBe(false)
      expect(EndpointFailover.isKnownTencentCloudHost("")).toBe(false)
      expect(EndpointFailover.isKnownTencentCloudHost(null as any)).toBe(false)
    })
  })

  describe("suffixMatchOf", () => {
    it("classifies plain host, no region", () => {
      const m = suffixMatchOf("cvm.tencentcloudapi.com")
      expect(m).not.toBeNull()
      expect(m!.suffixIdx).toBe(0)
      expect(m!.hasRegion).toBe(false)
      expect(m!.servicePrefix).toBe("cvm")
    })

    it("classifies region-pinned host", () => {
      const m = suffixMatchOf("cvm.ap-guangzhou.tencentcloudapi.com")
      expect(m).not.toBeNull()
      expect(m!.hasRegion).toBe(true)
    })

    it("preserves ai. prefix verbatim, no region", () => {
      const m = suffixMatchOf("hunyuan.ai.tencentcloudapi.cn")
      expect(m).not.toBeNull()
      expect(m!.suffixIdx).toBe(1)
      expect(m!.hasRegion).toBe(false)
      expect(m!.servicePrefix).toBe("hunyuan.ai")
    })

    it("flags region on an ai. host", () => {
      const m = suffixMatchOf("hunyuan.ai.ap-guangzhou.tencentcloudapi.com")
      expect(m).not.toBeNull()
      expect(m!.hasRegion).toBe(true)
      expect(m!.servicePrefix).toBe("hunyuan.ai.ap-guangzhou")
    })

    it("preserves internal. prefix and resolves .com.cn", () => {
      const m = suffixMatchOf("cvm.internal.tencentcloudapi.com.cn")
      expect(m).not.toBeNull()
      expect(m!.suffixIdx).toBe(2)
      expect(m!.servicePrefix).toBe("cvm.internal")
    })

    it("returns null for unknown hosts", () => {
      expect(suffixMatchOf("api.example.com")).toBeNull()
      expect(suffixMatchOf("")).toBeNull()
    })
  })

  describe("shouldFailover", () => {
    it("returns true for failoverable-flagged errors", () => {
      expect(EndpointFailover.shouldFailover(makeFailoverable())).toBe(true)
    })
    it("returns true for ENOTFOUND", () => {
      expect(EndpointFailover.shouldFailover(makeNetErr("ENOTFOUND"))).toBe(true)
    })
    it("returns true for EAI_AGAIN", () => {
      expect(EndpointFailover.shouldFailover(makeNetErr("EAI_AGAIN"))).toBe(true)
    })
    it("returns true for ECONNREFUSED / ETIMEDOUT", () => {
      expect(EndpointFailover.shouldFailover(makeNetErr("ECONNREFUSED"))).toBe(true)
      expect(EndpointFailover.shouldFailover(makeNetErr("ETIMEDOUT"))).toBe(true)
    })
    it("returns true for TLS cert errors", () => {
      expect(EndpointFailover.shouldFailover(makeNetErr("DEPTH_ZERO_SELF_SIGNED_CERT"))).toBe(true)
      expect(EndpointFailover.shouldFailover(makeNetErr("ERR_TLS_CERT_ALTNAME_INVALID"))).toBe(true)
    })
    it("returns true for node-fetch FetchError with type=system", () => {
      const err = new Error("request failed")
      ;(err as any).name = "FetchError"
      ;(err as any).type = "system"
      expect(EndpointFailover.shouldFailover(err)).toBe(true)
    })
    it("returns false for a plain error that merely carries type=system", () => {
      const err = new Error("request failed")
      ;(err as any).type = "system"
      expect(EndpointFailover.shouldFailover(err)).toBe(false)
    })
    it("returns true for errors with cause carrying a failover code", () => {
      const err = new Error("request failed")
      ;(err as any).cause = makeNetErr("ENOTFOUND")
      expect(EndpointFailover.shouldFailover(err)).toBe(true)
    })
    it("returns false for business errors", () => {
      expect(EndpointFailover.shouldFailover(new Error("AuthFailure.SignatureFailure"))).toBe(false)
    })
    it("returns false for null/undefined", () => {
      expect(EndpointFailover.shouldFailover(null)).toBe(false)
      expect(EndpointFailover.shouldFailover(undefined)).toBe(false)
    })
    it("returns true via message-based fallback", () => {
      const err = new Error(
        "request to https://cvm.tencentcloudapi.com/ failed, reason: getaddrinfo ENOTFOUND"
      )
      expect(EndpointFailover.shouldFailover(err)).toBe(true)
    })
  })

  // Default CircuitBreaker opens after 5 consecutive failures (maxFailNum=5, 100% > 0.75).
  const OPEN_THRESHOLD = 5

  /** Issues `n` calls that fail on `failingHost`, driving its breaker Open. */
  async function driveBreakerOpen(
    failover: EndpointFailover,
    endpoint: string,
    failingHost: string,
    n = OPEN_THRESHOLD
  ): Promise<void> {
    for (let i = 0; i < n; i++) {
      await failover
        .execute(
          endpoint,
          async (host) => {
            if (host === failingHost) {
              throw makeNetErr("ENOTFOUND")
            }
            return "ok"
          },
          echo
        )
        .catch((): void => undefined)
    }
  }

  describe("execute - suffix rotation", () => {
    it("passes through (and still parses) for custom hosts without backup", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      const result = await failover.execute(
        "api.example.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "raw"
        },
        async (r) => r + "-parsed"
      )
      expect(result).toBe("raw-parsed")
      expect(calls).toEqual(["api.example.com"])
    })

    it("returns directly on success without failover", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      const result = await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(result).toBe("ok")
      expect(calls).toEqual(["cvm.tencentcloudapi.com"])
    })

    it("attempts only one host per call and throws on network error (no in-call failover)", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            throw makeNetErr("ENOTFOUND")
          },
          echo
        )
      ).rejects.toThrow()
      expect(calls).toEqual(["cvm.tencentcloudapi.com"])
    })

    it("routes from .com to .cn only after the origin breaker opens", async () => {
      const failover = new EndpointFailover()
      await driveBreakerOpen(failover, "cvm.tencentcloudapi.com", "cvm.tencentcloudapi.com")

      const calls: string[] = []
      const result = await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(result).toBe("ok")
      expect(calls).toEqual(["cvm.tencentcloudapi.cn"])
    })

    it("stays within the ai. prefix when routing onward", async () => {
      const failover = new EndpointFailover()
      await driveBreakerOpen(
        failover,
        "hunyuan.ai.tencentcloudapi.com",
        "hunyuan.ai.tencentcloudapi.com"
      )

      const calls: string[] = []
      await failover.execute(
        "hunyuan.ai.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["hunyuan.ai.tencentcloudapi.cn"])
    })

    it("stays within the internal. prefix when routing onward", async () => {
      const failover = new EndpointFailover()
      await driveBreakerOpen(
        failover,
        "cvm.internal.tencentcloudapi.com",
        "cvm.internal.tencentcloudapi.com"
      )

      const calls: string[] = []
      await failover.execute(
        "cvm.internal.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["cvm.internal.tencentcloudapi.cn"])
    })

    it("does NOT fail over a region-pinned host (propagates, single attempt)", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.ap-guangzhou.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            throw makeNetErr("ENOTFOUND", "dns miss")
          },
          echo
        )
      ).rejects.toThrow("dns miss")
      expect(calls.length).toBe(1)
    })

    it("throws 'circuit breaker open' once every suffix breaker is open", async () => {
      const failover = new EndpointFailover()
      const alwaysFail = async () => {
        throw makeNetErr("ENOTFOUND")
      }
      // Open .com, then .cn, then .com.cn in turn.
      for (let i = 0; i < OPEN_THRESHOLD * 3; i++) {
        await failover.execute("cvm.tencentcloudapi.com", alwaysFail, echo).catch((): void => undefined)
      }

      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            return "ok"
          },
          echo
        )
      ).rejects.toThrow("skipped cvm.tencentcloudapi.com: circuit breaker open")
      expect(calls.length).toBe(0)
    })

    it("does not fail over on non-network errors", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            throw new Error("AuthFailure.SignatureFailure")
          },
          echo
        )
      ).rejects.toThrow("AuthFailure.SignatureFailure")
      expect(calls.length).toBe(1)
    })
  })

  describe("execute - breaker-driven recovery", () => {
    it("reprobes the origin once its breaker half-opens after the timeout", async () => {
      vi.useFakeTimers()
      try {
        const failover = new EndpointFailover()
        await driveBreakerOpen(failover, "cvm.tencentcloudapi.com", "cvm.tencentcloudapi.com")

        // Origin breaker is open: calls route to .cn.
        let calls: string[] = []
        await failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            return "ok"
          },
          echo
        )
        expect(calls).toEqual(["cvm.tencentcloudapi.cn"])

        // After the breaker timeout it half-opens; the origin is tried first again.
        vi.advanceTimersByTime(60 * 1000)
        calls = []
        await failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            return "ok"
          },
          echo
        )
        expect(calls).toEqual(["cvm.tencentcloudapi.com"])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("execute - parse-driven failover", () => {
    it("routes onward only after failoverable parse results open the breaker", async () => {
      const failover = new EndpointFailover()
      for (let i = 0; i < OPEN_THRESHOLD; i++) {
        await failover
          .execute(
            "cvm.tencentcloudapi.com",
            async (endpoint) => endpoint,
            async (host) => {
              if (host === "cvm.tencentcloudapi.com") {
                throw makeFailoverable("not a tencent reply")
              }
              return "ok"
            }
          )
          .catch((): void => undefined)
      }

      const calls: string[] = []
      const result = await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return endpoint
        },
        async () => "ok"
      )
      expect(result).toBe("ok")
      expect(calls).toEqual(["cvm.tencentcloudapi.cn"])
    })

    it("propagates a non-failoverable parse error (business error) without retry", async () => {
      const failover = new EndpointFailover()
      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            return endpoint
          },
          async () => {
            throw new Error("AuthFailure.SignatureFailure")
          }
        )
      ).rejects.toThrow("AuthFailure.SignatureFailure")
      expect(calls.length).toBe(1)
    })
  })

  describe("execute - backupEndpoint mode", () => {
    it("uses the origin when it succeeds", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "ap-shanghai.tencentcloudapi.com" })
      const calls: string[] = []
      await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["cvm.tencentcloudapi.com"])
    })

    it("routes to the backup host after the origin breaker opens", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "ap-shanghai.tencentcloudapi.com" })
      await driveBreakerOpen(failover, "cvm.tencentcloudapi.com", "cvm.tencentcloudapi.com")

      const calls: string[] = []
      await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["cvm.ap-shanghai.tencentcloudapi.com"])
    })

    it("uses the backupEndpoint verbatim when it already includes the service", async () => {
      const failover = new EndpointFailover({
        backupEndpoint: "cvm.ap-shanghai.tencentcloudapi.com",
      })
      await driveBreakerOpen(failover, "cvm.tencentcloudapi.com", "cvm.tencentcloudapi.com")

      const calls: string[] = []
      await failover.execute(
        "cvm.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["cvm.ap-shanghai.tencentcloudapi.com"])
    })

    it("routes a region-pinned host to the backup after its breaker opens", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "ap-shanghai.tencentcloudapi.com" })
      await driveBreakerOpen(
        failover,
        "cvm.ap-guangzhou.tencentcloudapi.com",
        "cvm.ap-guangzhou.tencentcloudapi.com"
      )

      const calls: string[] = []
      await failover.execute(
        "cvm.ap-guangzhou.tencentcloudapi.com",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["cvm.ap-shanghai.tencentcloudapi.com"])
    })

    it("applies to custom (non-tencentcloud) hosts too", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "backup.example.com" })
      await driveBreakerOpen(failover, "svc.example.org", "svc.example.org")

      const calls: string[] = []
      await failover.execute(
        "svc.example.org",
        async (endpoint) => {
          calls.push(endpoint)
          return "ok"
        },
        echo
      )
      expect(calls).toEqual(["svc.backup.example.com"])
    })

    it("throws 'circuit breaker open' once both origin and backup breakers are open", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "ap-shanghai.tencentcloudapi.com" })
      const alwaysFail = async () => {
        throw makeNetErr("ENOTFOUND")
      }
      // Open the origin, then the backup.
      for (let i = 0; i < OPEN_THRESHOLD * 2; i++) {
        await failover.execute("cvm.tencentcloudapi.com", alwaysFail, echo).catch((): void => undefined)
      }

      await expect(
        failover.execute("cvm.tencentcloudapi.com", alwaysFail, echo)
      ).rejects.toThrow("skipped cvm.tencentcloudapi.com: circuit breaker open")
    })

    it("propagates a non-failover error directly", async () => {
      const failover = new EndpointFailover({ backupEndpoint: "ap-shanghai.tencentcloudapi.com" })
      const calls: string[] = []
      await expect(
        failover.execute(
          "cvm.tencentcloudapi.com",
          async (endpoint) => {
            calls.push(endpoint)
            throw new Error("AuthFailure.SignatureFailure")
          },
          echo
        )
      ).rejects.toThrow("AuthFailure.SignatureFailure")
      expect(calls.length).toBe(1)
    })
  })

  describe("KNOWN_API_SUFFIXES", () => {
    it("exposes the three known endpoint suffixes", () => {
      expect(KNOWN_API_SUFFIXES).toEqual([
        "tencentcloudapi.com",
        "tencentcloudapi.cn",
        "tencentcloudapi.com.cn",
      ])
    })
  })
})

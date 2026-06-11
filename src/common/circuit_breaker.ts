/**
 * Settings for the circuit breaker that defines its behavior.
 */
export interface CircuitBreakerSetting {
  /**
   * Maximum number of failed requests before the circuit breaker opens.
   * @default 5
   */
  maxFailNum?: number
  /**
   * Maximum failure percentage before the circuit breaker opens.
   * @default 0.75
   */
  maxFailPercentage?: number
  /**
   * Window interval in milliseconds, used to reset the failure counter.
   * @default 300000
   */
  windowIntervalMs?: number
  /**
   * Timeout in milliseconds, after which the circuit breaker transitions from Open to HalfOpen.
   * @default 60000
   */
  timeoutMs?: number
  /**
   * Maximum number of requests before transitioning from HalfOpen to Closed.
   * @default 1
   */
  maxRequests?: number
  /**
   * The breaker opens once the number of consecutive failures exceeds this
   * value, regardless of the failure percentage.
   * @default 5
   */
  maxConsecutiveFailures?: number
}

/**
 * A token returned by the circuit breaker to indicate whether a request is allowed.
 */
export interface CircuitBreakerToken {
  allowed: boolean
  recordResult(success: boolean): void
}

enum State {
  Closed,
  HalfOpen,
  Open,
}

const DEFAULT_SETTING: Required<CircuitBreakerSetting> = {
  maxFailNum: 5,
  maxFailPercentage: 0.75,
  windowIntervalMs: 300 * 1000,
  timeoutMs: 60 * 1000,
  maxRequests: 1,
  maxConsecutiveFailures: 5,
}

/**
 * Circuit breaker that blocks requests after too many failures, using a
 * Closed / HalfOpen / Open state machine.
 */
export class CircuitBreaker {
  private setting: Required<CircuitBreakerSetting>
  /** Current state: Closed, HalfOpen, or Open. */
  private state: State = State.Closed
  /** Generation counter, bumped on every state change to invalidate stale tokens. */
  private generation: number = 0
  /** Timestamp (ms) when the current state expires. */
  private expiry: number = 0
  private totalRequests: number = 0
  private failures: number = 0
  private consecutiveSuccesses: number = 0
  private consecutiveFailures: number = 0

  constructor(setting?: CircuitBreakerSetting) {
    this.setting = Object.assign({}, DEFAULT_SETTING, setting)
  }

  /**
   * Attempt to allow a request based on the current state of the circuit breaker.
   */
  allow(): CircuitBreakerToken {
    const now = Date.now()
    const { state, generation } = this.currentState(now)

    if (state === State.Open) {
      return { allowed: false, recordResult() {} }
    }

    const gen = generation
    return {
      allowed: true,
      recordResult: (success: boolean) => {
        this.report(gen, success)
      },
    }
  }

  private currentState(now: number): { state: State; generation: number } {
    switch (this.state) {
      case State.Closed:
        if (this.expiry !== 0 && now >= this.expiry) {
          this.toNewGeneration(State.Closed, now)
        }
        break
      case State.Open:
        if (now >= this.expiry) {
          this.toNewGeneration(State.HalfOpen, now)
        }
        break
      case State.HalfOpen:
        break
    }
    return { state: this.state, generation: this.generation }
  }

  private report(generation: number, success: boolean): void {
    const now = Date.now()
    this.currentState(now)

    if (this.generation !== generation) {
      return
    }

    if (success) {
      this.onSuccess(now)
    } else {
      this.onFailure(now)
    }
  }

  private onSuccess(now: number): void {
    this.totalRequests++
    this.consecutiveSuccesses++
    this.consecutiveFailures = 0

    switch (this.state) {
      case State.Closed:
        break
      case State.HalfOpen:
        if (this.consecutiveSuccesses >= this.setting.maxRequests) {
          this.toNewGeneration(State.Closed, now)
        }
        break
      case State.Open:
        break
    }
  }

  private onFailure(now: number): void {
    this.totalRequests++
    this.failures++
    this.consecutiveFailures++
    this.consecutiveSuccesses = 0

    switch (this.state) {
      case State.Closed:
        if (this.readyToOpen()) {
          this.toNewGeneration(State.Open, now)
        }
        break
      case State.HalfOpen:
        this.toNewGeneration(State.Open, now)
        break
      case State.Open:
        break
    }
  }

  private readyToOpen(): boolean {
    const failPercentage = this.failures / this.totalRequests
    // maxFailNum uses >= (reach); maxConsecutiveFailures uses > (exceed).
    return (
      (this.failures >= this.setting.maxFailNum &&
        failPercentage >= this.setting.maxFailPercentage) ||
      this.consecutiveFailures > this.setting.maxConsecutiveFailures
    )
  }

  private toNewGeneration(newState: State, now: number): void {
    this.state = newState
    this.generation++
    this.totalRequests = 0
    this.failures = 0
    this.consecutiveSuccesses = 0
    this.consecutiveFailures = 0

    switch (newState) {
      case State.Closed:
        this.expiry = now + this.setting.windowIntervalMs
        break
      case State.Open:
        this.expiry = now + this.setting.timeoutMs
        break
      case State.HalfOpen:
        this.expiry = 0
        break
    }
  }
}

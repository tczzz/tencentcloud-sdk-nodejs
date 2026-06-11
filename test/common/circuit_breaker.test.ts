import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { CircuitBreaker } from "common/circuit_breaker"

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    breaker = new CircuitBreaker({
      maxFailNum: 3,
      maxFailPercentage: 0.5,
      windowIntervalMs: 10000,
      timeoutMs: 1000,
      maxRequests: 1,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("initial state (Closed)", () => {
    it("should allow requests in Closed state", () => {
      const token = breaker.allow()
      expect(token.allowed).toBe(true)
    })

    it("should remain Closed after successful reports", () => {
      for (let i = 0; i < 10; i++) {
        const token = breaker.allow()
        expect(token.allowed).toBe(true)
        token.recordResult(true)
      }
    })
  })

  describe("transition to Open", () => {
    it("should open after reaching maxFailNum and maxFailPercentage", () => {
      // Report 3 failures out of 3 total (100% > 50%, 3 >= maxFailNum)
      for (let i = 0; i < 3; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }

      // Now the breaker should be Open
      const token = breaker.allow()
      expect(token.allowed).toBe(false)
    })

    it("should not open if failure count is below maxFailNum", () => {
      // 2 failures out of 2 (below maxFailNum=3)
      for (let i = 0; i < 2; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }

      const token = breaker.allow()
      expect(token.allowed).toBe(true)
    })

    it("should not open if failure percentage is below threshold", () => {
      // 3 failures out of 10 requests (30% < 50%)
      for (let i = 0; i < 7; i++) {
        const token = breaker.allow()
        token.recordResult(true)
      }
      for (let i = 0; i < 3; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }

      const token = breaker.allow()
      expect(token.allowed).toBe(true)
    })

    it("should open after consecutive failures exceed maxConsecutiveFailures", () => {
      // Need more than 5 consecutive failures (default maxConsecutiveFailures)
      for (let i = 0; i < 6; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }

      const token = breaker.allow()
      expect(token.allowed).toBe(false)
    })

    it("honors a custom maxConsecutiveFailures", () => {
      const custom = new CircuitBreaker({
        maxFailNum: 100,
        maxFailPercentage: 1,
        maxConsecutiveFailures: 2,
      })
      // 3 consecutive failures (> 2) should open the breaker
      for (let i = 0; i < 3; i++) {
        custom.allow().recordResult(false)
      }
      expect(custom.allow().allowed).toBe(false)
    })
  })

  describe("transition from Open to HalfOpen", () => {
    it("should transition to HalfOpen after timeout", () => {
      // Open the breaker
      for (let i = 0; i < 3; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }
      expect(breaker.allow().allowed).toBe(false)

      // Advance past the timeout (1000ms)
      vi.advanceTimersByTime(1100)

      // Should now allow one request (HalfOpen)
      const token = breaker.allow()
      expect(token.allowed).toBe(true)
    })
  })

  describe("HalfOpen state", () => {
    function openAndWait() {
      for (let i = 0; i < 3; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }
      vi.advanceTimersByTime(1100)
    }

    it("should close on success in HalfOpen state", () => {
      openAndWait()

      // Success in HalfOpen → Closed
      const token = breaker.allow()
      token.recordResult(true)

      // Should be Closed now, allow requests
      const next = breaker.allow()
      expect(next.allowed).toBe(true)
    })

    it("should reopen on failure in HalfOpen state", () => {
      openAndWait()

      // Failure in HalfOpen → Open again
      const token = breaker.allow()
      token.recordResult(false)

      // Should be Open again
      const next = breaker.allow()
      expect(next.allowed).toBe(false)
    })
  })

  describe("default settings", () => {
    it("should work with default settings", () => {
      const defaultBreaker = new CircuitBreaker()
      const token = defaultBreaker.allow()
      expect(token.allowed).toBe(true)
    })
  })

  describe("concurrent access", () => {
    it("counts results from tokens issued before any report (same generation)", () => {
      // Simulate several in-flight requests grabbing tokens before any of them
      // reports back, as happens under concurrency.
      const tokens = [breaker.allow(), breaker.allow(), breaker.allow()]
      tokens.forEach((t) => expect(t.allowed).toBe(true))

      // All three fail (100% > 50%, 3 >= maxFailNum) → breaker opens.
      tokens.forEach((t) => t.recordResult(false))

      expect(breaker.allow().allowed).toBe(false)
    })

    it("ignores stale tokens after the breaker recycles its generation", () => {
      // Open, then move to HalfOpen and close again so the generation advances.
      for (let i = 0; i < 3; i++) {
        breaker.allow().recordResult(false)
      }
      vi.advanceTimersByTime(1100)
      breaker.allow().recordResult(true) // HalfOpen → Closed (new generation)

      // A token captured in an earlier generation must not affect the breaker.
      const stale = breaker.allow()
      for (let i = 0; i < 3; i++) {
        breaker.allow().recordResult(false)
      }
      vi.advanceTimersByTime(1100)
      breaker.allow().recordResult(true)
      stale.recordResult(false)

      expect(breaker.allow().allowed).toBe(true)
    })
  })

  describe("generation handling", () => {
    it("should ignore reports from old generations", () => {
      // Get a token in Closed state
      const oldToken = breaker.allow()

      // Open the breaker
      for (let i = 0; i < 3; i++) {
        const token = breaker.allow()
        token.recordResult(false)
      }

      // Advance to HalfOpen
      vi.advanceTimersByTime(1100)

      // Get a new token in HalfOpen
      const newToken = breaker.allow()
      newToken.recordResult(true)

      // Report the old token — should be ignored since generation changed
      oldToken.recordResult(false)

      // Breaker should still be Closed (not affected by old token report)
      const token = breaker.allow()
      expect(token.allowed).toBe(true)
    })
  })
})

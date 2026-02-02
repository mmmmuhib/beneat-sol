---
purpose: Documents oracle integration strategy including staleness checks, confidence intervals, and P&L calculation
related:
  - technical/specs/overview
  - technical/integrations/pyth
  - technical/architecture/trade-execution-flow
source_of_truth: false
code_files:
  - programs/beneat/src/utils/pyth.rs
  - programs/beneat/src/utils/pnl.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Execution-based P&L using Pyth with 30s staleness limit, 2% confidence threshold, and 2.5% slippage buffer to prevent false lockouts during volatile markets.

### Oracle & Price Feed Handling

**Purpose:** Accurate P&L calculation for auto-lockout enforcement, even during volatile market conditions.

**The Challenge:**
- Solana DeFi moves fast (memecoins can move 50%+ in minutes)
- Oracle prices may lag actual execution prices
- Stale prices could cause incorrect lockouts (false positives) or missed lockouts (false negatives)

**Our Approach: Execution-Based P&L**

We use **actual swap results** as the source of truth, not oracle predictions:

```
TRADE EXECUTION FLOW:

1. PRE-SWAP: Record portfolio value
   └─ Use Pyth oracle for current token prices
   └─ Staleness check: Reject if price > 30 seconds old

2. EXECUTE SWAP via Jupiter
   └─ Jupiter handles routing and slippage
   └─ Returns actual amount_out

3. POST-SWAP: Calculate ACTUAL P&L
   └─ P&L = (tokens_received × price) - (tokens_sent × price)
   └─ This is the REAL result, not an estimate

4. COMPARE to limits
   └─ Use slippage buffer (2.5%) to avoid false lockouts
   └─ Lock at -$205 if limit is -$200
```

**Price Feed Specifications:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Oracle Provider | Pyth Network | Fastest updates on Solana |
| Max Staleness | 30 seconds | Balance freshness vs availability |
| Confidence Interval | Use if < 2% | Reject uncertain prices |
| Fallback | Swap execution price | Ground truth from actual trade |
| Slippage Buffer | 2.5% of limit | Prevent volatility-triggered false locks |

**Handling Edge Cases:**

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Oracle unavailable | Block trade, don't lock | Fail safe - user can retry |
| Price stale (>30s) | Use swap execution price | Trade already happened |
| Price confidence low | Block trade | Don't risk wrong P&L calc |
| Extreme slippage (>10%) | Warn but allow | User chose to execute |
| P&L near limit (within 5%) | Show warning | "You're close to lockout" |

**Code Implementation:**
```rust
pub fn calculate_pnl(
    pre_swap_value: u64,
    post_swap_value: u64,
    oracle_confidence: u64,
    slippage_buffer_bps: u16,
) -> Result<PnlResult> {
    // Check oracle confidence
    require!(
        oracle_confidence < 200, // 2% max confidence interval
        BeneatError::PriceFeedUnreliable
    );

    // Calculate raw P&L
    let pnl_delta = post_swap_value as i64 - pre_swap_value as i64;

    // Apply slippage buffer for lockout comparison
    // If limit is -$200, we lock at -$205 (2.5% buffer)
    let buffered_limit = loss_limit + (loss_limit * slippage_buffer_bps / 10000);

    Ok(PnlResult {
        raw_pnl: pnl_delta,
        should_lock: session_pnl < -buffered_limit,
        confidence: oracle_confidence,
    })
}
```

**Monitoring & Alerts:**
- Log all P&L calculations with oracle data
- Alert if oracle staleness > 10s frequently
- Track false lockout rate (user complaints)
- Dashboard showing oracle health

---

---
purpose: Combined technical specifications overview including instructions, errors, account sizes, API, and oracle handling
related:
  - technical/specs/anchor-program-instructions
  - technical/specs/error-codes
  - technical/specs/account-sizes
  - technical/specs/api-endpoints-frontend
  - technical/specs/oracle-and-price-feed-handling
  - technical/architecture/overview
source_of_truth: false
code_files:
  - programs/beneat/src/lib.rs
  - programs/beneat/src/errors.rs
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/utils/pnl.rs
  - programs/beneat/src/utils/pyth.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Complete technical specs: 10 Anchor instructions (including split swap pattern), 16 error codes, ~289 bytes for vault accounts, 6 REST API endpoints, and execution-based P&L with Pyth oracle.

## Technical Specifications

### Anchor Program Instructions

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `initialize_vault` | `lockout_duration` | Anyone | Create new vault PDA |
| `set_rules` | `loss_limit, max_position, cooldown, max_trades` | Owner only | Configure risk rules (private) |
| `deposit` | `amount, token` | Owner only | Fund vault |
| `withdraw` | `amount, token` | Owner only, not locked | Remove funds |
| `pre_swap_check` | `source_mint, dest_mint, amount_in, min_out` | Owner only, not locked | Validate and prepare for swap |
| `swap` | `amount_in, min_out, route` | Owner only, not locked | Trade via Jupiter (legacy) |
| `post_swap_update` | none | Owner only | Finalize swap and calculate P&L |
| `manual_lock` | `duration, reason` | Owner only | Self-imposed lockout |
| `unlock` | none | Owner only, after timeout | Remove lockout |
| `reset_session` | none | Owner only, not locked | Reset daily counters |

**Note:** `pre_swap_check` and `post_swap_update` implement the split instruction pattern for Jupiter integration. See [[technical/integrations/jupiter]] for details.

### Error Codes

```rust
#[error_code]
pub enum BeneatError {
    #[msg("Vault is currently locked")]
    VaultLocked,                    // 6000

    #[msg("Position size exceeds maximum allowed")]
    ExceedsMaxPosition,             // 6001

    #[msg("Daily trade limit reached")]
    TradeLimitReached,              // 6002

    #[msg("Cooldown period not elapsed")]
    CooldownActive,                 // 6003

    #[msg("Insufficient vault balance")]
    InsufficientBalance,            // 6004

    #[msg("Lockout period not expired")]
    LockoutNotExpired,              // 6005

    #[msg("Unauthorized access")]
    Unauthorized,                   // 6006

    #[msg("Invalid token")]
    InvalidToken,                   // 6007

    #[msg("Jupiter swap failed")]
    SwapFailed,                     // 6008

    #[msg("Price feed unavailable")]
    PriceFeedError,                 // 6009

    #[msg("Price feed unreliable")]
    PriceFeedUnreliable,            // 6010

    #[msg("Invalid loss limit")]
    InvalidLossLimit,               // 6011

    #[msg("Invalid cooldown")]
    InvalidCooldown,                // 6012

    #[msg("Invalid trade limit")]
    InvalidTradeLimit,              // 6013

    #[msg("Swap already in progress")]
    SwapAlreadyInProgress,          // 6014

    #[msg("No swap in progress")]
    NoSwapInProgress,               // 6015
}
```

### Account Sizes

| Account | Size (bytes) | Rent (SOL) |
|---------|--------------|------------|
| Vault (public) | 289 | ~0.003 |
| PrivateRiskState (compressed) | ~100 | Minimal (ZK compressed) |
| Token accounts (2x) | 165 each | ~0.002 each |

**Note:** Vault size increased from 200 to 289 bytes (+89 bytes) to accommodate pending swap tracking fields.

### API Endpoints (Frontend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Analyze wallet trading history |
| `/api/recommendations` | POST | Generate rule recommendations |
| `/api/vault/status` | GET | Get vault state |
| `/api/vault/history` | GET | Get trade history |
| `/api/card/generate` | POST | Generate Trader Spec Card |
| `/api/card/share` | POST | Generate shareable card image |

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

---
purpose: Describes Light Protocol integration for zero-knowledge privacy of sensitive trading data
related:
  - product/features/vault-system
  - product/hackathon-strategy
  - technical/integrations/light-protocol
source_of_truth: false
code_files:
  - programs/beneat/src/state/private_risk_state.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Light Protocol compressed accounts encrypt sensitive data (P&L, rules, lockout reasons) while keeping lockout status public, enabling accountability without exposing embarrassing trading failures.

### 7. Privacy Layer

**Purpose:** Hide sensitive trading data while maintaining verifiable lockout state

**Implementation:**
- Light Protocol compressed accounts for private state
- Public account for lockout status only
- ZK proofs for rule compliance (future)

**Private State Structure:**
```rust
#[derive(LightAccount)]
pub struct PrivateRiskState {
    pub owner: Pubkey,

    // All fields encrypted via Light Protocol
    pub session_pnl: i64,
    pub daily_loss_limit: i64,
    pub max_position_size: u64,
    pub max_trades_per_day: u8,
    pub cooldown_minutes: u8,
    pub lockout_reason: LockoutReason,
    pub starting_balance: u64,
}

pub enum LockoutReason {
    None,
    DailyLossLimit,
    LosingStreak,
    TradeLimit,
    Manual,
    TimeRestriction,
}
```

---

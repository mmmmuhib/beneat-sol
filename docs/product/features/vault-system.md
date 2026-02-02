---
purpose: Describes the Anchor-based vault program that holds funds for rule enforcement
related:
  - product/features/auto-lockout-system
  - product/features/emergency-unlock-system
  - product/solution-overview
  - technical/anchor-program/vault
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** PDA-based Anchor vault program holds trader funds under program control, tracking lockout state, session data, and trade history while blocking withdrawals during enforced lockouts.

### 3. Vault System

**Purpose:** Hold funds under program control for enforcement

**Implementation:**
- Anchor program with PDA-based vault
- Deposit/withdraw instructions
- Withdrawal blocked during lockout

**Vault Structure:**
```rust
#[account]
pub struct Vault {
    // Owner
    pub owner: Pubkey,
    pub bump: u8,

    // Balances (token accounts held by PDA)
    pub sol_balance: u64,
    pub usdc_balance: u64,

    // Lockout State (PUBLIC)
    pub is_locked: bool,
    pub lockout_until: i64,
    pub lockout_count: u32,
    pub last_lockout: i64,

    // Session tracking
    pub session_start: i64,
    pub trades_today: u32,
    pub last_trade_time: i64,
    pub last_trade_pnl: i64,  // For cooldown logic

    // Settings (can be public - not sensitive)
    pub lockout_duration_hours: u8,
}
```

---
purpose: Documents all custom error codes returned by the Beneat Anchor program
related:
  - technical/specs/overview
  - technical/specs/anchor-program-instructions
source_of_truth: false
code_files:
  - programs/beneat/src/errors.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Twelve error codes covering lock state, position limits, trade limits, cooldowns, balances, authorization, token validation, swap failures, swap state tracking, and price feed issues.

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

### Error Reference

| Error | Code | When Thrown |
|-------|------|-------------|
| `VaultLocked` | 6000 | Attempting trade/withdraw while vault is locked |
| `ExceedsMaxPosition` | 6001 | Trade amount exceeds configured max_position_size |
| `TradeLimitReached` | 6002 | Daily trade count at max_trades_per_day limit |
| `CooldownActive` | 6003 | Trading before cooldown period has elapsed |
| `InsufficientBalance` | 6004 | Withdrawal/trade amount exceeds vault balance |
| `LockoutNotExpired` | 6005 | Unlock attempted before lockout_until timestamp |
| `Unauthorized` | 6006 | Non-owner attempting owner-only instruction |
| `InvalidToken` | 6007 | Token mint not supported or invalid |
| `SwapFailed` | 6008 | Jupiter CPI returned error during swap |
| `PriceFeedError` | 6009 | Pyth oracle unavailable or stale |
| `PriceFeedUnreliable` | 6010 | Pyth confidence interval too wide (>2%) |
| `InvalidLossLimit` | 6011 | Loss limit parameter out of valid range |
| `InvalidCooldown` | 6012 | Cooldown parameter out of valid range |
| `InvalidTradeLimit` | 6013 | Trade limit parameter out of valid range |
| `SwapAlreadyInProgress` | 6014 | `pre_swap_check` called while swap_in_progress is true |
| `NoSwapInProgress` | 6015 | `post_swap_update` called while swap_in_progress is false |

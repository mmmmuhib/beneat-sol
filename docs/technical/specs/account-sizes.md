---
purpose: Documents on-chain account sizes and rent costs for vault, private state, and token accounts
related:
  - technical/specs/overview
  - technical/architecture/account-structure
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Vault costs ~0.003 SOL (289 bytes including pending swap fields), private state is minimal (ZK compressed ~100 bytes), token accounts ~0.002 SOL each (165 bytes).

### Account Sizes

| Account | Size (bytes) | Rent (SOL) |
|---------|--------------|------------|
| Vault (public) | 289 | ~0.003 |
| PrivateRiskState (compressed) | ~100 | Minimal (ZK compressed) |
| Token accounts (2x) | 165 each | ~0.002 each |

### Vault Account Breakdown

The Vault account (289 bytes) consists of:

| Field | Type | Size (bytes) |
|-------|------|--------------|
| discriminator | [u8; 8] | 8 |
| owner | Pubkey | 32 |
| bump | u8 | 1 |
| **Public State** | | |
| is_locked | bool | 1 |
| lockout_until | i64 | 8 |
| lockout_count | u32 | 4 |
| last_lockout | i64 | 8 |
| trades_today | u32 | 4 |
| last_trade_time | i64 | 8 |
| session_start | i64 | 8 |
| **Pending Swap State** | | |
| swap_in_progress | bool | 1 |
| pending_swap_source_mint | Pubkey | 32 |
| pending_swap_dest_mint | Pubkey | 32 |
| pending_swap_amount_in | u64 | 8 |
| pending_swap_min_out | u64 | 8 |
| balance_before_swap | u64 | 8 |
| **Settings** | | |
| lockout_duration | u32 | 4 |
| **Padding/Reserved** | | ~124 |
| **Total** | | **289** |

**Note:** The 89-byte increase from the original 200 bytes accommodates the 6 new pending swap tracking fields required for the split instruction pattern.

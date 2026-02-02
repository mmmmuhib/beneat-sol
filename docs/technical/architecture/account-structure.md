---
purpose: Documents PDA account relationships including vault, private state, and token accounts
related:
  - technical/architecture/overview
  - technical/specs/account-sizes
  - technical/privacy/model
  - technical/security-model
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** Three-tier account structure: user-owned vault PDA with public state, Light Protocol compressed account for private risk state, and PDA-controlled token accounts for funds.

## Account Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCOUNT RELATIONSHIPS                         │
└─────────────────────────────────────────────────────────────────┘

                        User Wallet
                        (Authority)
                             │
                             │ owns
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VAULT ACCOUNT (PDA)                         │
│               seeds: ["vault", user_pubkey]                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  owner: Pubkey              ─── User's wallet address           │
│  bump: u8                   ─── PDA bump seed                   │
│                                                                  │
│  ─── PUBLIC STATE ───                                           │
│  is_locked: bool            ─── Anyone can see                  │
│  lockout_until: i64         ─── Unix timestamp                  │
│  lockout_count: u32         ─── Total lockouts                  │
│  last_lockout: i64          ─── Last lockout time               │
│  trades_today: u32          ─── Daily counter                   │
│  last_trade_time: i64       ─── For cooldown                    │
│  session_start: i64         ─── When session began              │
│                                                                  │
│  ─── PENDING SWAP STATE ───                                     │
│  swap_in_progress: bool           ─── Swap atomicity flag       │
│  pending_swap_source_mint: Pubkey ─── Token being sold          │
│  pending_swap_dest_mint: Pubkey   ─── Token being bought        │
│  pending_swap_amount_in: u64      ─── Amount being swapped      │
│  pending_swap_min_out: u64        ─── Minimum expected output   │
│  balance_before_swap: u64         ─── Pre-swap dest balance     │
│                                                                  │
│  ─── SETTINGS ───                                               │
│  lockout_duration: u32      ─── Seconds                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ references
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              PRIVATE RISK STATE (Light Protocol)                 │
│                    Compressed Account                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ─── ENCRYPTED (Only owner can decrypt) ───                     │
│                                                                  │
│  session_pnl: i64           ─── Current P&L                     │
│  starting_balance: u64      ─── Session start value             │
│  daily_loss_limit: i64      ─── Max loss before lock            │
│  max_position_size: u64     ─── Per-trade limit                 │
│  max_trades_per_day: u8     ─── Trade count limit               │
│  cooldown_seconds: u32      ─── Cooldown after loss             │
│  max_losing_streak: u8      ─── Consecutive losses              │
│  lockout_reason: u8         ─── Why locked (enum)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ PDA controls
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TOKEN ACCOUNTS (PDAs)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │  SOL Token Account  │  │ USDC Token Account  │              │
│  │                     │  │                     │              │
│  │  seeds: ["sol",     │  │  seeds: ["usdc",    │              │
│  │          vault_pda] │  │          vault_pda] │              │
│  │                     │  │                     │              │
│  │  Authority: Vault   │  │  Authority: Vault   │              │
│  │  PDA                │  │  PDA                │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  (Additional token accounts created as needed)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

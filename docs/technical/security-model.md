---
purpose: Documents access control, fund safety, lockout guarantees, and private state security
related:
  - technical/architecture/account-structure
  - technical/privacy/model
  - technical/privacy/architecture
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
  - programs/beneat/src/instructions/withdraw.rs
  - programs/beneat/src/instructions/swap.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** PDA-controlled funds with owner-only access for deposits, withdrawals, and swaps; lockout enforcement at the program level; private state encrypted via Light Protocol.

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY CONSIDERATIONS                      │
└─────────────────────────────────────────────────────────────────┘

ACCESS CONTROL
──────────────
• Vault owner = only signer who can:
  - Deposit funds
  - Withdraw funds (when unlocked)
  - Execute swaps
  - Change rules (when unlocked)
  - Trigger manual lock

• Program PDA = only authority that can:
  - Move tokens from vault
  - Sign Jupiter swaps
  - Update state

• Anyone can:
  - Read public state (is_locked, lockout_until)
  - Cannot read private state


FUND SAFETY
───────────
• Funds held in PDA-controlled token accounts
• No admin keys or upgrade authority (immutable)
• User can always withdraw when unlocked
• No way for program to "steal" funds


LOCKOUT GUARANTEES
──────────────────
• Lockout enforced at program level
• Cannot bypass via direct token transfer
  (tokens are PDA-controlled)
• Unlock only possible when:
  - current_time >= lockout_until
  - Signed by owner


PRIVATE STATE
─────────────
• Encrypted via Light Protocol
• Only owner's wallet can decrypt
• Program can read for enforcement
• Observers see encrypted blob only
```

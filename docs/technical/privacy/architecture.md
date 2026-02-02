---
purpose: Visual diagram of privacy architecture showing public vs encrypted data from an observer perspective
related:
  - technical/privacy/model
  - technical/privacy/detailed-analysis
  - technical/architecture/system-diagram
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** Observers see lock status, unlock time, lockout count, and vault balance; they cannot see P&L, loss limits, position limits, lockout reasons, or trading rules.

## Privacy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRIVACY MODEL                                │
└─────────────────────────────────────────────────────────────────┘

                    BLOCKCHAIN OBSERVER VIEW
                    ────────────────────────

What they CAN see:                What they CANNOT see:

┌─────────────────────┐          ┌─────────────────────┐
│ PUBLIC DATA         │          │ PRIVATE DATA        │
│                     │          │ (Encrypted)         │
│ • Wallet uses       │          │                     │
│   Beneat            │          │ • Session P&L       │
│                     │          │ • Loss limit        │
│ • Currently locked  │          │ • Position limit    │
│   (yes/no)          │          │ • Why they locked   │
│                     │          │ • Trading rules     │
│ • Unlock time       │          │ • Starting balance  │
│                     │          │                     │
│ • Lockout count     │          │                     │
│   (3 total)         │          │                     │
│                     │          │                     │
│ • Vault balance     │          │ • Whether balance   │
│   (visible on       │          │   represents gain   │
│    token account)   │          │   or loss           │
│                     │          │                     │
└─────────────────────┘          └─────────────────────┘


                    EXAMPLE EXPLORER VIEW
                    ─────────────────────

┌─────────────────────────────────────────────────────────────────┐
│  Account: 7xK9...3mF                                            │
│                                                                  │
│  Type: Beneat Vault                                             │
│  Status: LOCKED                                                  │
│  Unlocks: 2026-01-23 17:00 UTC                                  │
│  Lockout Count: 3                                                │
│                                                                  │
│  Token Balances:                                                │
│  • SOL: 2.5                                                      │
│  • USDC: 150.00                                                  │
│                                                                  │
│  Private State: [ENCRYPTED - 256 bytes]                         │
│  └─ Decryptable only by owner                                   │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  What we know:                                                  │
│  ✓ This trader uses risk management                             │
│  ✓ They are currently locked out                                │
│  ✓ They have ~$400 in their vault                               │
│                                                                  │
│  What we don't know:                                            │
│  ✗ Did they hit a loss limit or lock manually?                  │
│  ✗ How much have they lost this session?                        │
│  ✗ What are their personal risk rules?                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

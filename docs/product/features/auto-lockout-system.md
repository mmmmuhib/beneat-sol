---
purpose: Describes automatic vault lockout triggers and enforcement behavior
related:
  - product/features/vault-system
  - product/features/emergency-unlock-system
  - product/features/personalized-rule-recommendations
  - product/user-flows
source_of_truth: false
code_files:
  - programs/beneat/src/instructions/lockout.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Vault automatically locks when rules are breached (daily loss limit, losing streak, trade limit), blocking new swaps and withdrawals while allowing deposits and balance viewing until the configurable timeout expires.

### 5. Auto-Lockout System

**Purpose:** Automatically lock vault when rules are breached

**Implementation:**
- Check conditions after each trade
- Immediate lockout on breach
- Configurable duration
- Optional unlock friction

**Lockout Triggers:**

| Trigger | Condition | Default Response |
|---------|-----------|------------------|
| Daily Loss Limit | session_pnl < -daily_loss_limit | Lock for 4 hours |
| Losing Streak | consecutive_losses >= 3 | Lock for 1 hour |
| Trade Limit | trades_today >= max_trades | Lock until midnight UTC |
| Cooldown Violation | Attempt trade during cooldown | Reject trade (no lock) |
| Position Size Violation | amount > max_position | Reject trade (no lock) |
| Manual Lock | User triggers lock | Lock for preset duration |

**Lockout Behavior:**
```
WHEN LOCKED:
├─ New swaps: BLOCKED
├─ Withdrawals: BLOCKED (standard)
├─ Emergency withdrawal: AVAILABLE (with friction)
├─ Deposits: ALLOWED (for averaging down if desired)
├─ View balance: ALLOWED
└─ Check unlock time: ALLOWED

UNLOCK CONDITIONS:
├─ Current time >= lockout_until
└─ Optional: Answer reflection prompts
```

---
purpose: Documents the privacy model including what data is public vs private and why
related:
  - technical/privacy/architecture
  - technical/privacy/detailed-analysis
  - technical/security-model
  - technical/integrations/light-protocol
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Public state (lock status, count, expiration) proves accountability; private state via Light Protocol hides P&L, limits, and lockout reasons to prevent humiliation.

## Privacy Model

### Design Philosophy

> "Prove you're disciplined without proving you're a loser."

Traders want accountability and enforcement, but don't want public humiliation when they fail.

### What's Visible On-Chain

| Data Point | Visibility | Rationale |
|------------|------------|-----------|
| Wallet uses Beneat | Public | Signals responsible trading |
| Currently locked | Public | Verifiable enforcement |
| Lockout expiration | Public | Transparency on timeline |
| Lockout count | Public | Track record (optional) |
| Vault balance | Public* | Standard token account |

*Note: Vault balance is visible but without private state, no one knows if it represents gains or losses.

### What's Hidden (Light Protocol)

| Data Point | Why It's Private |
|------------|------------------|
| Session P&L | Don't expose losses |
| Daily loss limit | Personal risk tolerance |
| Max position size | Trading strategy info |
| Lockout reason | Could be embarrassing |
| Trading rules | Competitive info |
| Starting balance | Don't expose position size |

### Privacy Implementation

```rust
// Public state - anyone can read
#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub is_locked: bool,
    pub lockout_until: i64,
    pub lockout_count: u32,
}

// Private state - encrypted via Light Protocol
#[derive(LightAccount)]
pub struct PrivateRiskState {
    pub session_pnl: i64,           // Hidden
    pub daily_loss_limit: i64,      // Hidden
    pub lockout_reason: u8,         // Hidden
    // ... all sensitive fields
}
```

### Explorer View

What someone sees looking up a Beneat user:

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLANA EXPLORER - Account 7xK9...3mF                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Beneat Vault:                                                  │
│  ├─ Status: LOCKED                                              │
│  ├─ Locked until: Jan 23, 2026 5:00 PM UTC                     │
│  ├─ Total lockouts: 3                                           │
│  │                                                              │
│  │  Private State (Encrypted):                                  │
│  ├─ P&L: [ENCRYPTED]                                           │
│  ├─ Loss Limit: [ENCRYPTED]                                    │
│  └─ Reason: [ENCRYPTED]                                        │
│                                                                  │
│  Interpretation:                                                │
│  "This trader uses risk management and is currently locked      │
│   out. We don't know if they're up or down, or why they         │
│   locked. We just know they're being disciplined."              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

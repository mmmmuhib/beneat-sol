---
purpose: Describes emergency exit options to ensure users are never trapped while maintaining discipline
related:
  - product/features/auto-lockout-system
  - product/features/vault-system
  - product/risk-assessment
source_of_truth: false
code_files:
  - programs/beneat/src/instructions/emergency_unlock.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Multiple emergency exit paths ensure users are never trapped: 24-hour time-delayed withdrawal (medium friction), instant 5% penalty exit (high friction), social recovery via trusted contact, or opt-in full lockout mode with no emergency exit.

### 6. Emergency Unlock System

**Purpose:** Ensure users never feel "trapped" while maintaining discipline enforcement. Addresses judge concerns about "honey pot" risk.

**Philosophy:**
> "The goal is discipline, not imprisonment. Emergency exits exist but are deliberately inconvenient."

**Emergency Unlock Options:**

| Option | Friction Level | How It Works | Use Case |
|--------|---------------|--------------|----------|
| **Time-Delayed Exit** | Medium | 24-hour waiting period before withdrawal | "I need my funds but can wait" |
| **Penalty Exit** | High | Instant unlock with 5% fee (burned or to DAO) | "I need funds urgently" |
| **Social Recovery** | Medium | Pre-designated trusted contact can authorize | "My friend can vouch I'm not tilting" |
| **Full Lockout Mode** | Maximum | No emergency exit (user opts in) | "I want maximum enforcement" |

**Implementation:**
```rust
pub enum EmergencyUnlockMode {
    TimeDelayed {
        delay_hours: u32,        // Default: 24 hours
        request_time: Option<i64>, // When user requested
    },
    PenaltyExit {
        penalty_bps: u16,        // Default: 500 (5%)
        penalty_recipient: Pubkey, // Burn address or DAO
    },
    SocialRecovery {
        trusted_contact: Pubkey, // Friend/mentor wallet
        requires_signature: bool,
    },
    NoEmergencyExit,             // Hardcore mode
}
```

**Time-Delayed Exit Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│  EMERGENCY WITHDRAWAL REQUEST                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚠️  You are currently locked out.                              │
│                                                                  │
│  Standard unlock in: 2h 34m                                     │
│                                                                  │
│  If you need emergency access to your funds:                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ OPTION 1: WAIT IT OUT (Recommended)                        │ │
│  │ Your lockout expires in 2h 34m. This is what you signed    │ │
│  │ up for. Your future self will thank you.                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ OPTION 2: TIME-DELAYED EXIT                                │ │
│  │ Request emergency withdrawal. Funds available in 24 hours. │ │
│  │ You can cancel anytime during the 24h if you cool down.    │ │
│  │                                                            │ │
│  │ [ Request 24h Delayed Withdrawal ]                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ OPTION 3: PENALTY EXIT                                     │ │
│  │ Instant withdrawal with 5% penalty fee.                    │ │
│  │ Fee is burned (removed from circulation).                  │ │
│  │                                                            │ │
│  │ Your balance: $500.00                                      │ │
│  │ Penalty (5%): -$25.00                                      │ │
│  │ You receive:  $475.00                                      │ │
│  │                                                            │ │
│  │ [ Pay Penalty & Withdraw Now ]                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ℹ️  Most users who wait out the lockout report being glad      │
│     they didn't have access to their funds.                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Design Works:**

| Concern | How We Address It |
|---------|-------------------|
| "Funds are trapped" | Multiple exit paths always available |
| "Smart contract risk" | User can always get funds within 24h max |
| "What if real emergency?" | Penalty exit is instant |
| "Too easy to bypass" | 5% penalty is painful enough to deter impulse |
| "Judge concerns" | Clear documentation of user agency |

**Pitch to Judges:**
> "Users are never trapped. They can always exit - it just costs them either time or money. The friction is calibrated to stop impulsive decisions, not to hold funds hostage."

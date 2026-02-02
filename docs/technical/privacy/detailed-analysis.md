---
purpose: Honest analysis of current privacy limitations and roadmap from MVP (40%) to full privacy (95%)
related:
  - technical/privacy/model
  - technical/privacy/architecture
  - technical/integrations/light-protocol
  - product/roadmap
source_of_truth: false
code_files:
  - programs/beneat/src/state/vault.rs
  - programs/beneat/src/state/private_state.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** MVP achieves 40% privacy (lockout reason hidden, but P&L inferrable from swaps); V2 adds shielded deposits (60%); V3 with compressed tokens reaches 95% full privacy.

## Privacy Model - Detailed Analysis

### Current MVP Privacy (Honest Assessment)

**What's Actually Private:**
- Risk rules (loss limits, position limits)
- Lockout reason
- Session P&L tracking variable
- Internal enforcement state

**What's Still Observable (The Leak):**

| Observable Data | How It Leaks | Impact |
|-----------------|--------------|--------|
| Vault token balances | Standard SPL token accounts | Can see total holdings |
| Individual swaps | Jupiter transactions visible | Can see each trade |
| Deposit/withdraw amounts | Transaction history | Can see capital flow |
| **Calculated P&L** | Balance changes over time | Can infer losses |

**The Reality:**
```
WHAT AN OBSERVER CAN DO:

Day 1: See vault has 10 SOL
Day 1: See user swaps 1 SOL → BONK
Day 1: See user swaps BONK → 0.8 SOL (lost 0.2 SOL)
Day 1: See vault now has 9.8 SOL

Conclusion: User lost 0.2 SOL (~$20)

Our "private P&L" variable is technically hidden,
but the ACTUAL P&L is inferrable from on-chain data.
```

### Privacy Roadmap

**MVP (Hackathon) - Partial Privacy:**
```
┌─────────────────────────────────────────────────────────────────┐
│  MVP PRIVACY LEVEL                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIVATE (Light Protocol):          OBSERVABLE:                 │
│  ├─ Lockout reason                  ├─ Vault balance            │
│  ├─ Risk rule parameters            ├─ Individual swaps         │
│  ├─ Internal P&L variable           ├─ Transaction history      │
│  └─ Enforcement thresholds          └─ Implied P&L (calculated) │
│                                                                  │
│  PRIVACY SCORE: 40%                                             │
│  "Reason is hidden, but losses are inferrable"                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**V2 (Post-Hackathon) - Shielded Deposits:**
```
┌─────────────────────────────────────────────────────────────────┐
│  V2 PRIVACY LEVEL                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADDITION: ShadowWire for deposits/withdrawals                  │
│                                                                  │
│  PRIVATE:                           OBSERVABLE:                 │
│  ├─ All MVP private data            ├─ Individual swaps         │
│  ├─ Deposit amounts                 ├─ Swap sizes               │
│  └─ Withdrawal amounts              └─ Trade frequency          │
│                                                                  │
│  PRIVACY SCORE: 60%                                             │
│  "Don't know starting capital or exit amounts"                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**V3 (Future) - Full Shielded Trading:**
```
┌─────────────────────────────────────────────────────────────────┐
│  V3 PRIVACY LEVEL                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADDITION: Light Protocol compressed tokens in vault            │
│            + Privacy DEX integration (future roadmap)           │
│                                                                  │
│  PRIVATE:                           OBSERVABLE:                 │
│  ├─ All V2 private data             ├─ Wallet uses Beneat       │
│  ├─ Vault balance (compressed)      ├─ Is locked (yes/no)       │
│  ├─ Individual swap amounts         └─ Lockout count            │
│  └─ P&L (truly hidden)                                          │
│                                                                  │
│  PRIVACY SCORE: 95%                                             │
│  "Only know they're locked, nothing else"                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pitch for Judges (Honest Framing)

**Don't Overclaim:**
> "Our MVP demonstrates the enforcement mechanism with partial privacy. The lockout reason is truly private - you can see someone is locked but not why they locked (hit limit vs manual vs tilt). Full balance privacy requires shielded assets, which is our V2 roadmap using Light Protocol's compressed tokens."

**What We DO Achieve:**
1. ✅ Unbypassable on-chain enforcement
2. ✅ Private lockout reasons (embarrassment protection)
3. ✅ Private risk parameters
4. ⚠️ Partial balance privacy (visible but context hidden)
5. ❌ Full P&L privacy (roadmap item)

**Why Partial Privacy Still Matters:**
- Most observers won't manually calculate P&L
- The REASON for locking is the embarrassing part
- "I'm locked" is accountability; "I lost $500 chasing memecoins" is humiliation
- We protect the narrative, not the numbers

---

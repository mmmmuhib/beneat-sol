---
purpose: Describes data-driven rule recommendations based on detected behavioral patterns
related:
  - product/features/wallet-behavior-analysis
  - product/features/auto-lockout-system
  - product/user-flows
source_of_truth: false
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Generates personalized risk rules (loss limits, cooldowns, position sizes, trade limits) calculated from actual trading history, showing "would have saved" projections to demonstrate the real dollar impact of each rule.

### 3. Personalized Rule Recommendations

**Purpose:** Generate risk rules based on actual behavior, not arbitrary numbers

**Implementation:**
- Analyze behavioral patterns
- Calculate optimal thresholds from historical data
- Show "would have saved" projections

**Rule Types:**

| Rule | How It's Calculated | Example Output |
|------|---------------------|----------------|
| Daily Loss Limit | Based on average daily P&L volatility | "Limit: $200 (would have saved $847)" |
| Cooldown Period | Based on revenge trading frequency | "30 min cooldown (would have blocked 23 bad trades)" |
| Max Position Size | Based on normal vs tilt sizing | "Max $50 per trade (you lose at $100+)" |
| Trade Limit | Based on overtrading correlation | "Max 10 trades/day (you lose on 15+ days)" |
| Time Restrictions | Based on performance by hour | "No trading 11pm-7am (you lose 3x more)" |

**Output:**
```
┌────────────────────────────────────────────────────────────────┐
│ RECOMMENDED RULES                                              │
│ Based on your patterns, these rules would have saved ~$2,847   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ 1. DAILY LOSS LIMIT                              [Recommended] │
│    Stop trading after $200 loss                                │
│    → Would have prevented 8 blown sessions                     │
│                                                                │
│ 2. COOLDOWN AFTER LOSS                           [Recommended] │
│    Wait 30 minutes after any losing trade                      │
│    → Would have blocked 23 revenge trades                      │
│                                                                │
│ 3. MAX POSITION SIZE                             [Recommended] │
│    Maximum $50 per trade                                       │
│    → Your win rate drops 40% above this size                   │
│                                                                │
│ 4. DAILY TRADE LIMIT                                [Optional] │
│    Maximum 10 trades per day                                   │
│    → Your P&L goes negative on 15+ trade days                  │
│                                                                │
│ [ Accept All ]  [ Customize ]  [ Skip for Now ]                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

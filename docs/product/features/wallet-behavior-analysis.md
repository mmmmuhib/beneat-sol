---
purpose: Describes on-chain trading pattern detection and behavioral analysis feature
related:
  - product/features/personalized-rule-recommendations
  - product/features/trader-spec-cards
  - product/user-flows
  - technical/integrations/helius
source_of_truth: false
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Scans 90 days of Jupiter/Raydium swap history via Helius API to detect destructive patterns like revenge trading (73% of traders), overtrading, and tilt sizing, then calculates estimated preventable losses.

### 1. Wallet Behavior Analysis

**Purpose:** Show traders their actual on-chain behavior patterns

**Implementation:**
- Scan Jupiter/Raydium swap history via Helius API
- Analyze 90 days of trading data
- Detect specific behavioral patterns

**Patterns Detected:**

| Pattern | Detection Method | Insight Provided |
|---------|------------------|------------------|
| Revenge Trading | Trade within 10 min of loss | "You trade within 10 min of losses 73% of the time" |
| Loss Rate After Loss | Win rate on follow-up trades | "These follow-up trades lose 68% of the time" |
| Overtrading | Trades per day vs P&L correlation | "Days with 15+ trades have negative P&L 81% of the time" |
| Tilt Sizing | Position size after losses | "You increase size by 2.3x after losses" |
| Bad Hours | P&L by time of day | "You lose 3x more between 11pm-2am" |
| Losing Streaks | Consecutive losses without stopping | "You averaged 5 trades after hitting 3 losses" |

**Output:**
```
┌────────────────────────────────────────────────────────────────┐
│ YOUR TRADING PATTERNS (Last 90 Days)                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Transactions Analyzed: 847                                     │
│                                                                │
│ REVENGE TRADING                                    [DETECTED]  │
│ You trade again within 10 min of a loss 73% of the time.      │
│ These revenge trades lose money 68% of the time.              │
│ Estimated cost: ~$1,204                                        │
│                                                                │
│ OVERTRADING                                        [DETECTED]  │
│ Days with 15+ trades have negative P&L 81% of the time.       │
│ Your sweet spot: 5-8 trades per day                           │
│                                                                │
│ TILT SIZING                                        [DETECTED]  │
│ Average position after loss: 2.3x normal size                 │
│ Win rate at 2x+ size: 31% (vs 52% normal)                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

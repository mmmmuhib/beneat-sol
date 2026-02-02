---
purpose: Describes gamified FIFA-style trader cards with behavioral stats and viral sharing
related:
  - product/features/wallet-behavior-analysis
  - product/features/personalized-rule-recommendations
  - product/user-flows
source_of_truth: false
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** FIFA Ultimate Team-inspired trader cards visualize 6 behavioral stats (Discipline, Patience, Consistency, Timing, Risk Control, Endurance) with overall ratings, rarity tiers, and social sharing for viral potential and gamified improvement tracking.

### 2. Trader Spec Cards (FIFA Ultimate Team Style)

**Purpose:** Gamify wallet analysis with collectible-style trader profile cards that visualize trading behavior stats.

**Inspiration:** FIFA Ultimate Team player cards that show stats like PAC, SHO, PAS, DRI, DEF, PHY with an overall rating.

**Implementation:**
- Generate a visual "Trader Card" after wallet analysis
- Calculate 6 core trading stats from on-chain data
- Assign overall rating (0-99)
- Card rarity based on discipline level
- Shareable on social media (viral potential)

**Trader Stats (0-99 Scale):**

| Stat | Abbreviation | What It Measures | Calculation |
|------|--------------|------------------|-------------|
| **Discipline** | DIS | Following loss limits | % of sessions stopped at reasonable loss |
| **Patience** | PAT | Avoiding revenge trades | Avg time between trades after loss |
| **Consistency** | CON | Stable position sizing | Std deviation of position sizes |
| **Timing** | TIM | Trading at good hours | % of trades during profitable hours |
| **Risk Control** | RSK | Appropriate sizing | Avg position size vs portfolio % |
| **Endurance** | END | Avoiding overtrading | P&L correlation with trade count |

**Overall Rating Calculation:**
```
OVERALL = (DIS × 0.25) + (PAT × 0.20) + (CON × 0.15) +
          (TIM × 0.15) + (RSK × 0.15) + (END × 0.10)
```

**Card Rarity Tiers:**

| Rating | Rarity | Card Color | Description |
|--------|--------|------------|-------------|
| 90-99 | Legendary | Gold Holographic | Elite discipline |
| 80-89 | Epic | Purple | Strong trader |
| 70-79 | Rare | Blue | Above average |
| 60-69 | Uncommon | Green | Room to improve |
| 40-59 | Common | Silver | Needs work |
| 0-39 | Bronze | Bronze | Degen status |

**Card Visual Design:**
```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────┐    │
│  │         TRADER CARD             │    │
│  │    ═══════════════════════      │    │
│  │                                 │    │
│  │           ╔═══════╗             │    │
│  │           ║  72   ║  RARE       │    │
│  │           ╚═══════╝             │    │
│  │                                 │    │
│  │      7xK9...3mF                 │    │
│  │      ─────────────              │    │
│  │      "The Revenge Trader"       │    │
│  │                                 │    │
│  │   ┌─────┬─────┬─────┐          │    │
│  │   │ DIS │ PAT │ CON │          │    │
│  │   │  45 │  32 │  78 │          │    │
│  │   ├─────┼─────┼─────┤          │    │
│  │   │ TIM │ RSK │ END │          │    │
│  │   │  81 │  67 │  89 │          │    │
│  │   └─────┴─────┴─────┘          │    │
│  │                                 │    │
│  │   Weakness: PATIENCE            │    │
│  │   "Revenge trades 73% of time"  │    │
│  │                                 │    │
│  │   Strength: ENDURANCE           │    │
│  │   "Knows when to stop"          │    │
│  │                                 │    │
│  │   💰 Could have saved: $2,847   │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [ Share Card ]  [ Improve Stats ]      │
│                                         │
└─────────────────────────────────────────┘
```

**Stat Improvement Hooks:**
- Low PAT (Patience) → Recommend cooldown rules
- Low DIS (Discipline) → Recommend daily loss limits
- Low CON (Consistency) → Recommend position size limits
- Low TIM (Timing) → Recommend time-based restrictions
- Low RSK (Risk Control) → Recommend max position rules
- Low END (Endurance) → Recommend trade count limits

**Viral Features:**
- "Share Your Card" button → Twitter/X post with card image
- Compare cards with friends
- Leaderboard of highest-rated traders (opt-in)
- Card evolution: Re-analyze after using Beneat to show improvement
- Achievement badges: "Survived 5 lockouts", "30-day streak", etc.

**Card Evolution Example:**
```
BEFORE BENEAT              AFTER 30 DAYS
┌───────────────┐          ┌───────────────┐
│     47        │          │     72        │
│   COMMON      │   ───►   │    RARE       │
│               │          │               │
│ DIS: 45       │          │ DIS: 78 (+33) │
│ PAT: 32       │          │ PAT: 71 (+39) │
│ CON: 78       │          │ CON: 82 (+4)  │
│               │          │               │
│ "Degen"       │          │ "Reformed"    │
└───────────────┘          └───────────────┘

"Your discipline improved 73% with Beneat enforcement!"
```

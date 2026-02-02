---
purpose: Step-by-step trade execution flow using split instruction pattern for Jupiter integration
related:
  - technical/architecture/overview
  - technical/specs/anchor-program-instructions
  - technical/specs/oracle-and-price-feed-handling
  - technical/integrations/jupiter
source_of_truth: false
code_files:
  - programs/beneat/src/instructions/swap.rs
  - programs/beneat/src/utils/pnl.rs
  - programs/beneat/src/utils/jupiter.rs
  - programs/beneat/src/utils/pyth.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** Three-phase trade flow using split instruction pattern: `pre_swap_check` validates and records state, Jupiter executes swap, `post_swap_update` calculates P&L and finalizes. All three run in a single atomic transaction.

## Data Flow: Trade Execution (Split Instruction Pattern)

The split instruction pattern enables atomic rule enforcement around external Jupiter swaps:

```
User clicks "Swap 1 SOL → BONK"
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE ATOMIC TRANSACTION                     │
├─────────────────────────────────────────────────────────────────┤

┌─────────────────────────────────────────────────────────────────┐
│ INSTRUCTION 1: pre_swap_check                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VALIDATION PHASE:                                              │
│                                                                  │
│  Check: is_locked?                                              │
│  └─ YES → Return Error: VaultLocked (6000)                      │
│  └─ NO  → Continue                                              │
│                                                                  │
│  Check: swap_in_progress?                                       │
│  └─ YES → Return Error: SwapAlreadyInProgress (6014)            │
│  └─ NO  → Continue                                              │
│                                                                  │
│  Check: trades_today < max_trades?                              │
│  └─ NO  → Return Error: TradeLimitReached (6002)                │
│  └─ YES → Continue                                              │
│                                                                  │
│  Check: cooldown_elapsed?                                       │
│  └─ NO  → Return Error: CooldownActive (6003)                   │
│  └─ YES → Continue                                              │
│                                                                  │
│  STATE RECORDING PHASE:                                         │
│                                                                  │
│  Record pending swap details:                                   │
│  ├─ swap_in_progress = true                                     │
│  ├─ pending_swap_source_mint = SOL                              │
│  ├─ pending_swap_dest_mint = BONK                               │
│  ├─ pending_swap_amount_in = 1_000_000_000 (1 SOL)              │
│  ├─ pending_swap_min_out = 49_000_000 BONK                      │
│  └─ balance_before_swap = [current BONK balance]                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
              │
              │ Validation passed, state recorded
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ INSTRUCTION 2: Jupiter Swap (External Program)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Jupiter Aggregator executes optimal route:                     │
│  ├─ input_mint: SOL                                             │
│  ├─ output_mint: BONK                                           │
│  ├─ amount: 1 SOL                                               │
│  ├─ slippage: 1%                                                │
│  └─ route: [Raydium → Orca → ...optimal path]                   │
│                                                                  │
│  Result: 50,000,000 BONK received                               │
│                                                                  │
│  Note: If Jupiter fails, entire transaction reverts             │
│  including pre_swap_check state changes.                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
              │
              │ Swap executed, tokens transferred
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ INSTRUCTION 3: post_swap_update                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VALIDATION:                                                    │
│                                                                  │
│  Check: swap_in_progress?                                       │
│  └─ NO  → Return Error: NoSwapInProgress (6015)                 │
│  └─ YES → Continue                                              │
│                                                                  │
│  P&L CALCULATION:                                               │
│                                                                  │
│  Read current destination balance:                              │
│  └─ balance_after = 50,000,000 BONK                             │
│                                                                  │
│  Calculate output received:                                     │
│  └─ actual_out = balance_after - balance_before_swap            │
│  └─ actual_out = 50,000,000 - 0 = 50,000,000 BONK               │
│                                                                  │
│  Evaluate against minimum:                                      │
│  └─ actual_out (50M) >= pending_swap_min_out (49M) → SUCCESS    │
│                                                                  │
│  STATE FINALIZATION:                                            │
│                                                                  │
│  Update trading counters:                                       │
│  ├─ trades_today++                                              │
│  └─ last_trade_time = Clock::get().unix_timestamp               │
│                                                                  │
│  Clear pending swap state:                                      │
│  ├─ swap_in_progress = false                                    │
│  ├─ pending_swap_source_mint = Pubkey::default()                │
│  ├─ pending_swap_dest_mint = Pubkey::default()                  │
│  ├─ pending_swap_amount_in = 0                                  │
│  ├─ pending_swap_min_out = 0                                    │
│  └─ balance_before_swap = 0                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
         Trade Complete
└─────────────────────────────────────────────────────────────────┘
```

## Atomicity Guarantees

The split instruction pattern ensures atomic execution:

| Failure Point | Result |
|---------------|--------|
| `pre_swap_check` fails | Transaction reverts, no state changes |
| Jupiter swap fails | Transaction reverts, pre_swap_check changes undone |
| `post_swap_update` fails | Transaction reverts, swap is undone |
| All three succeed | Trade completes, state is consistent |

## Security Properties

```
┌─────────────────────────────────────────────────────────────────┐
│ CANNOT bypass pre_swap_check:                                   │
│ └─ Jupiter instruction has no access to vault account           │
│ └─ Without pre_swap_check, no enforcement occurs                │
├─────────────────────────────────────────────────────────────────┤
│ CANNOT skip post_swap_update:                                   │
│ └─ swap_in_progress = true blocks next pre_swap_check           │
│ └─ User must complete the flow to trade again                   │
├─────────────────────────────────────────────────────────────────┤
│ CANNOT call post without pre:                                   │
│ └─ NoSwapInProgress error (6015) if swap_in_progress = false    │
├─────────────────────────────────────────────────────────────────┤
│ CANNOT double-call pre:                                         │
│ └─ SwapAlreadyInProgress error (6014)                           │
└─────────────────────────────────────────────────────────────────┘
```

## Error Recovery

If a transaction fails partway through, no cleanup is needed:

- **Pre-check fails:** No state modified
- **Jupiter fails:** Solana runtime reverts all instruction effects
- **Post-update fails:** Solana runtime reverts all instruction effects

The only edge case is a stuck `swap_in_progress = true` from a client bug (e.g., sending only pre_swap_check). This requires an admin clear or timeout mechanism (future enhancement).

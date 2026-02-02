---
purpose: Documents Jupiter DEX integration including split instruction pattern and trade execution
related:
  - technical/integrations/overview
  - technical/architecture/trade-execution-flow
  - technical/specs/anchor-program-instructions
source_of_truth: false
code_files:
  - programs/beneat/src/utils/jupiter.rs
  - programs/beneat/src/instructions/swap.rs
last_verified: 2026-01-22
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Jupiter integration uses a split instruction pattern: `pre_swap_check` → Jupiter swap → `post_swap_update`, all within a single atomic transaction. This enables rule enforcement around external swap execution.

### Jupiter DEX Integration

**Purpose:** Route all trades through vault for enforcement while leveraging Jupiter's aggregated liquidity.

**Implementation:**
- Split instruction pattern (3-phase flow)
- Support any token pair Jupiter supports
- Calculate P&L from actual swap results

**Supported Trading:**
- Any SPL token swap (memecoins, majors, stables)
- Market orders via Jupiter aggregation
- Best price across all Solana DEXs

---

### Split Instruction Pattern

Jupiter swaps cannot be wrapped in a single CPI call from Beneat due to:
1. **Compute limits:** Jupiter routes may exceed remaining compute budget
2. **Account constraints:** Jupiter requires specific account ordering
3. **Route flexibility:** Routes are built client-side with fresh quotes

**Solution:** Three instructions composed in a single atomic transaction:

```
Single Transaction (atomic):
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  INSTRUCTION 1: pre_swap_check                                  │
│  ├─ Validate vault not locked                                   │
│  ├─ Validate not in cooldown                                    │
│  ├─ Validate under trade limit                                  │
│  ├─ Record balance_before_swap                                  │
│  └─ Set swap_in_progress = true                                 │
│                                                                  │
│  INSTRUCTION 2: Jupiter swap (external program)                 │
│  ├─ Execute actual DEX swap                                     │
│  ├─ Route through optimal path                                  │
│  └─ Tokens transferred to destination account                   │
│                                                                  │
│  INSTRUCTION 3: post_swap_update                                │
│  ├─ Read destination balance (balance_after)                    │
│  ├─ Calculate actual_out = balance_after - balance_before       │
│  ├─ Determine if loss: actual_out < min_out                     │
│  ├─ Increment trades_today                                      │
│  └─ Set swap_in_progress = false                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
   All succeed → Trade Complete
   Any fails → Entire TX reverts
```

---

### Why Split Instructions?

**Atomicity Guarantee:**
If Jupiter swap fails, `post_swap_update` never runs, and `pre_swap_check` changes are reverted. The `swap_in_progress` flag ensures the pattern is followed correctly:

| Scenario | Result |
|----------|--------|
| `pre_swap_check` alone | Swap stuck, must be cleared |
| Jupiter alone | Works but no enforcement |
| `post_swap_update` alone | Fails: NoSwapInProgress error |
| Full 3-instruction TX | Atomic enforcement |

**Security Properties:**
- Cannot skip pre-checks (Jupiter instruction alone has no vault access)
- Cannot skip post-update (swap_in_progress blocks next trade)
- Cannot call post without pre (NoSwapInProgress error)
- Cannot double-call pre (SwapAlreadyInProgress error)

---

### Trade Flow (Detailed)

```
User Request: "Swap 1 SOL for $FARTCOIN"
        │
        ▼
┌─────────────────────────────────────────┐
│ pre_swap_check                          │
│                                         │
│ Validations:                            │
│ ├─ is_locked? → NO ✓                    │
│ ├─ swap_in_progress? → NO ✓             │
│ ├─ trades_today < max_trades? → YES ✓   │
│ ├─ cooldown_elapsed? → YES ✓            │
│ └─ All checks pass → PROCEED            │
│                                         │
│ State Updates:                          │
│ ├─ swap_in_progress = true              │
│ ├─ pending_swap_source_mint = SOL       │
│ ├─ pending_swap_dest_mint = FARTCOIN    │
│ ├─ pending_swap_amount_in = 1 SOL       │
│ ├─ pending_swap_min_out = 950,000       │
│ └─ balance_before_swap = 0              │
│                                         │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ Jupiter Swap (external)                 │
│                                         │
│ ├─ input_mint: SOL                      │
│ ├─ output_mint: FARTCOIN                │
│ ├─ amount: 1 SOL                        │
│ ├─ slippage: 1%                         │
│ └─ Result: 1,000,000 $FARTCOIN          │
│                                         │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ post_swap_update                        │
│                                         │
│ Calculations:                           │
│ ├─ balance_after = 1,000,000            │
│ ├─ actual_out = 1,000,000 - 0           │
│ └─ loss? 1,000,000 >= 950,000 → NO      │
│                                         │
│ State Updates:                          │
│ ├─ trades_today++                       │
│ ├─ last_trade_time = now                │
│ └─ swap_in_progress = false             │
│                                         │
└─────────────────────────────────────────┘
        │
        ▼
   Trade Complete
```

---

### Client Integration

The frontend/SDK must compose all three instructions in a single transaction:

```typescript
const tx = new Transaction();

// 1. Add pre_swap_check instruction
tx.add(await program.methods
  .preSwapCheck(sourceMint, destMint, amountIn, minOut)
  .accounts({ owner, vault, destinationTokenAccount })
  .instruction()
);

// 2. Add Jupiter swap instruction (from Jupiter SDK)
tx.add(jupiterSwapInstruction);

// 3. Add post_swap_update instruction
tx.add(await program.methods
  .postSwapUpdate()
  .accounts({ owner, vault, destinationTokenAccount })
  .instruction()
);

// Send as single atomic transaction
await sendTransaction(tx);
```

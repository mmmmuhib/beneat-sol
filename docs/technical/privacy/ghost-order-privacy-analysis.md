---
purpose: Comprehensive analysis of "Dual-Enclave" architecture combining Light Protocol ZK state + MagicBlock TEE execution for truly hidden ghost orders
related:
  - technical/privacy/index
  - technical/privacy/model
  - technical/privacy/architecture
  - technical/integrations/light-protocol
  - technical/integrations/magicblock
source_of_truth: true
code_files:
  - app/anchor/programs/ghost-crank/src/lib.rs
  - app/anchor/programs/ghost-crank/src/state/ghost_order.rs
  - app/app/hooks/use-light-protocol.ts
  - app/app/hooks/use-magicblock.ts
last_verified: 2026-01-31
---

# Ghost Order Privacy Analysis

> **TL;DR:** The "Dual-Enclave" architecture combining Light Protocol (ZK-compressed state) + MagicBlock (TEE execution) IS technically viable for truly hidden ghost orders. Stop-losses become invisible until triggered - a novel privacy primitive for Solana DeFi.

## Executive Summary

Current ghost order implementation uses MagicBlock Ephemeral Rollups for mempool privacy, but order parameters remain visible on-chain in the `GhostOrder` account. This analysis documents a verified upgrade path: storing order data as Light Protocol Compressed PDAs, making orders invisible until execution.

**Key Finding:** Context7 verification confirmed that Light Protocol Compressed PDAs support arbitrary Rust structs - not just token amounts. This unlocks the ability to store trigger prices, order sides, and sizes as Merkle tree leaves that are cryptographically hidden from chain observers.

## The Privacy Stack

| Layer | Technology | What It Hides | Status |
|-------|------------|---------------|--------|
| **Mempool** | MagicBlock ER | Transaction contents during submission | ✅ Implemented |
| **Intent** | MagicBlock ER + Delegation | Order trigger monitoring in TEE | ✅ Implemented |
| **State** | Light Protocol Compressed PDAs | Order parameters (trigger, side, size) | 📋 Planned |
| **Execution** | MagicBlock + Delegation Authority | Who can consume the order | 📋 Planned |
| **Settlement** | Light Protocol Tokens | Post-trade P&L | ✅ Implemented |

## Architecture Deep-Dive

### Current Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                  CURRENT: VISIBLE GHOST ORDERS                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GhostOrder PDA (on-chain, VISIBLE to observers):               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ owner: Pubkey          ← visible                           │ │
│  │ trigger_price: i64     ← visible (they know your stop!)    │ │
│  │ order_side: OrderSide  ← visible                           │ │
│  │ base_asset_amount: u64 ← visible                           │ │
│  │ status: OrderStatus    ← visible                           │ │
│  │ ...                                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Privacy:                                                        │
│  ✓ Mempool hidden (submitted via MagicBlock ER)                 │
│  ✓ Trigger monitoring in TEE (execution timing hidden)          │
│  ✗ Stop-loss price visible on-chain                             │
│  ✗ Order size visible on-chain                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (Phase 2: Dual-Enclave)

```
┌─────────────────────────────────────────────────────────────────┐
│               HIDDEN-UNTIL-TRIGGER ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE A: Order Creation (User → Light Protocol)                │
│  ─────────────────────────────────────────────────              │
│  1. User creates CompressedGhostOrder via bridge program        │
│  2. Order data (trigger_price, side, size) stored as ZK leaf    │
│  3. Only Merkle root visible on-chain - data is HIDDEN          │
│  4. Order "address" derived from [user, order_id, program_id]   │
│                                                                  │
│  What observers see:                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Merkle Root: 0x7a8b...  ← just a hash, reveals nothing     │ │
│  │ Account exists: yes     ← they know you have an order      │ │
│  │ Parameters: ???         ← HIDDEN in ZK state               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  PHASE B: Delegation (User → MagicBlock)                        │
│  ─────────────────────────────────────────────                  │
│  1. User creates "ExecutorPDA" - authority account              │
│  2. ExecutorPDA delegated to MagicBlock ER                      │
│  3. ER now controls ExecutorPDA (can sign on its behalf)        │
│                                                                  │
│  PHASE C: Execution (MagicBlock ER → Light Protocol)            │
│  ───────────────────────────────────────────────────            │
│  1. ER monitors Pyth oracle (fast, private)                     │
│  2. When trigger hit, ER signs as ExecutorPDA                   │
│  3. Bridge program verifies: signer == ExecutorPDA              │
│  4. Bridge program consumes compressed order (nullifies)        │
│  5. CPI to Drift to place the actual trade                      │
│  6. Order revealed ONLY at execution moment                     │
│                                                                  │
│  RESULT: Stop-loss invisible until it fires!                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Works: Technical Verification

### Light Protocol Compressed PDAs

Context7 documentation confirms that Compressed PDAs store arbitrary Rust structs:

```rust
use light_sdk::light_account;

#[light_account]
#[derive(Clone, Debug, Default)]
pub struct CompressedGhostOrder {
    #[truncate]
    pub owner: Pubkey,                  // HIDDEN in Merkle tree
    pub order_id: u64,                  // HIDDEN
    pub trigger_price: i64,             // HIDDEN - the key secret!
    pub trigger_condition: u8,          // HIDDEN (0=Above, 1=Below)
    pub order_side: u8,                 // HIDDEN (0=Long, 1=Short)
    pub base_asset_amount: u64,         // HIDDEN
    pub market_index: u16,              // HIDDEN
    pub reduce_only: bool,              // HIDDEN
    pub expiry: i64,                    // HIDDEN
    pub executor_pda: Pubkey,           // Who can consume this order
}
```

**Key insight:** The `#[light_account]` macro compiles structs to Merkle tree leaves. Only the tree root is stored on-chain. To read or modify the data, you need:
1. The original leaf data
2. A valid Merkle proof
3. Program-defined authorization

### MagicBlock Delegation Authority

The delegation model creates a trusted executor:

```rust
// User delegates ExecutorPDA to MagicBlock ER
// After delegation, account.owner == DELEGATION_PROGRAM_ID

// Only the ER can sign transactions as ExecutorPDA
// This creates "proof of TEE execution" without hardware attestation
```

**Authority chain:**
1. User creates ExecutorPDA → User owns it initially
2. User delegates to MagicBlock ER → DELEGATION_PROGRAM_ID owns it
3. ER can now sign as ExecutorPDA → Only ER can trigger execution
4. After undelegation → User regains ownership

### The Bridge Program

The bridge program links both systems with authority verification:

```rust
use anchor_lang::prelude::*;
use light_sdk::merkle_context::PackedMerkleContext;
use light_sdk::light_account;

#[derive(Accounts)]
pub struct ExecuteCompressedOrder<'info> {
    /// The executor PDA - must be delegated to MagicBlock ER
    /// Constraint: Only the delegated authority can sign
    #[account(
        constraint = executor_pda.owner == DELEGATION_PROGRAM_ID
            @ BridgeError::NotDelegated
    )]
    pub executor_pda: Signer<'info>,

    /// The compressed order data (provided as input, verified via proof)
    /// Light Protocol will verify the Merkle proof
    #[account(mut)]
    pub merkle_tree: AccountInfo<'info>,

    /// Drift accounts for trade execution
    #[account(mut)]
    pub drift_user: AccountInfo<'info>,
    #[account(mut)]
    pub drift_state: AccountInfo<'info>,
    // ... other Drift accounts

    pub light_system_program: Program<'info, LightSystemProgram>,
    pub drift_program: Program<'info, DriftProgram>,
}

pub fn execute_compressed_order(
    ctx: Context<ExecuteCompressedOrder>,
    compressed_order: CompressedGhostOrder,
    merkle_context: PackedMerkleContext,
    root_index: u16,
) -> Result<()> {
    // 1. Verify executor_pda matches order.executor_pda
    require!(
        ctx.accounts.executor_pda.key() == compressed_order.executor_pda,
        BridgeError::UnauthorizedExecutor
    );

    // 2. Verify the compressed order exists and proof is valid
    //    Light SDK handles Merkle proof verification automatically

    // 3. Nullify the compressed order (UTXO-style consumption)
    //    This prevents replay - order can only be executed once

    // 4. Build Drift place_perp_order instruction
    let order_params = build_drift_order(
        compressed_order.market_index,
        compressed_order.order_side,
        compressed_order.base_asset_amount,
        compressed_order.reduce_only,
    );

    // 5. CPI to Drift
    drift_cpi::place_perp_order(ctx.accounts.into(), order_params)?;

    // 6. Order is now revealed on-chain (in the Drift trade)
    //    But the trigger price was NEVER visible until this moment!

    Ok(())
}
```

## Data Flow: Step-by-Step

### 1. Order Creation (Client-Side)

```typescript
// User creates a compressed ghost order
const compressedOrder: CompressedGhostOrder = {
  owner: wallet.publicKey,
  orderId: Date.now(),
  triggerPrice: 180_000_000,      // $180.00 scaled by 1e6
  triggerCondition: TriggerCondition.Below,  // Stop-loss
  orderSide: OrderSide.Short,     // Close long position
  baseAssetAmount: 1_000_000_000, // 1 SOL in base units
  marketIndex: 0,                 // SOL-PERP
  reduceOnly: true,
  expiry: Date.now() + 86400000,  // 24 hours
  executorPda: executorPdaAddress,
};

// Submit via Light Protocol SDK
const { signature, leafIndex } = await lightRpc.createCompressedAccount(
  compressedOrder,
  merkleTreeAddress
);

// Store leafIndex locally for later execution proof
localStorage.setItem(`order_${orderId}_leaf`, leafIndex.toString());
```

### 2. Delegation Setup

```typescript
// Create and delegate ExecutorPDA to MagicBlock ER
const executorPda = findExecutorPda(wallet.publicKey, orderId);

// Delegate to MagicBlock
await magicblock.delegateAccount(executorPda, {
  commitFrequency: 30_000, // 30 seconds
});

// ExecutorPDA now controlled by MagicBlock ER
```

### 3. Price Monitoring (In MagicBlock ER)

```typescript
// Running inside MagicBlock Ephemeral Rollup
// This code is PRIVATE - observers cannot see the monitoring

async function monitorTrigger(
  orderId: bigint,
  triggerPrice: number,
  triggerCondition: TriggerCondition
) {
  const priceStream = await pythLazer.subscribe("SOL/USD");

  for await (const price of priceStream) {
    const triggered =
      (triggerCondition === TriggerCondition.Below && price <= triggerPrice) ||
      (triggerCondition === TriggerCondition.Above && price >= triggerPrice);

    if (triggered) {
      // Trigger hit! Execute the order
      await executeOrder(orderId, price);
      break;
    }
  }
}
```

### 4. Order Execution (ER → L1)

```typescript
// ER builds execution transaction
// Signs as ExecutorPDA (delegated authority)

async function executeOrder(orderId: bigint, executionPrice: number) {
  // 1. Retrieve compressed order data (stored locally in ER)
  const compressedOrder = orderCache.get(orderId);

  // 2. Get Merkle proof from Light Protocol indexer
  const merkleProof = await lightRpc.getProof(
    compressedOrder.leafIndex,
    merkleTreeAddress
  );

  // 3. Build execution instruction
  const ix = await bridgeProgram.methods
    .executeCompressedOrder(
      compressedOrder,
      merkleProof.context,
      merkleProof.rootIndex
    )
    .accounts({
      executorPda: executorPdaAddress,
      merkleTree: merkleTreeAddress,
      driftUser: driftUserAddress,
      driftState: driftStateAddress,
      // ... other accounts
    })
    .instruction();

  // 4. Sign with ExecutorPDA (delegated to ER)
  const tx = new Transaction().add(ix);
  tx.sign(executorPdaKeypair);  // ER has signing authority

  // 5. Submit to Solana L1 (order becomes visible NOW)
  const signature = await connection.sendTransaction(tx);
}
```

## Transaction Constraints

### Size Limits

The 1232-byte transaction MTU is a concern when combining:
- Light Protocol proof (~600-800 bytes)
- Drift order accounts (~400 bytes)
- Instruction data (~200 bytes)

**Solutions:**

1. **Address Lookup Tables (ALTs)**: Reduce account address overhead
2. **Jito Bundles**: Split into multiple transactions, execute atomically
3. **Proof Compression**: Use compressed proof format where available

### Recommended Approach: Jito Bundle

```typescript
// Bundle: [verify_proof_tx, execute_drift_tx]
// Both transactions succeed or both fail (atomic)

const bundle = [
  {
    // TX 1: Verify Light Protocol proof and mark order as executing
    instructions: [verifyProofIx, markExecutingIx],
  },
  {
    // TX 2: Execute Drift trade
    instructions: [placePerpOrderIx],
  },
];

await jitoClient.sendBundle(bundle, {
  tip: 10_000, // 0.00001 SOL tip
});
```

## Implementation Complexity

| Component | Difficulty | Estimate | Notes |
|-----------|------------|----------|-------|
| CompressedGhostOrder struct | Easy | 1 day | Light SDK handles serialization |
| Bridge program skeleton | Medium | 2 days | Authority verification, account layout |
| Light Protocol CPI | Hard | 3-4 days | Proof verification, nullification |
| ER order cache | Medium | 1-2 days | Store order data for execution |
| Drift CPI from bridge | Medium | 2 days | Account derivation, order params |
| Jito bundle integration | Medium | 1-2 days | Transaction splitting, atomic execution |
| **Total MVP** | | **10-12 days** | Functional hidden orders |

## Implementation Roadmap

### MVP (Hackathon Target)

**Goal:** Demonstrate hidden stop-loss that reveals only at execution

- [ ] Define `CompressedGhostOrder` struct with Light SDK
- [ ] Create bridge program with executor authority verification
- [ ] Implement order creation via Light Protocol
- [ ] Implement order consumption (nullification) via bridge
- [ ] Basic Drift CPI for order execution
- [ ] Frontend integration for creating compressed orders

### V2 (Post-Hackathon)

**Goal:** Production-ready with full privacy guarantees

- [ ] Jito bundle integration for atomic execution
- [ ] Multi-order batch processing
- [ ] Settlement privacy via Light compressed tokens
- [ ] Order modification/cancellation in compressed state
- [ ] Merkle proof caching for faster execution
- [ ] Mainnet deployment with auditing

### V3 (Future)

**Goal:** Full "Dark Pool" capability

- [ ] Order matching in MagicBlock ER (internal liquidity)
- [ ] Cross-margin support with hidden collateral
- [ ] Light Protocol compressed PDAs for order state
- [ ] Privacy-preserving liquidation monitoring

## Competitive Positioning

This architecture enables **"First truly 'Dark' perpetual adapter on Solana"**:

| Feature | Traditional Perps | Current Beneat | Dual-Enclave Beneat |
|---------|-------------------|----------------|---------------------|
| Stop-loss visible | ✓ On-chain | ✓ On-chain | ✗ Hidden until triggered |
| Order size visible | ✓ On-chain | ✓ On-chain | ✗ Hidden until triggered |
| Mempool privacy | ✗ Public | ✓ Via MagicBlock | ✓ Via MagicBlock |
| Settlement privacy | ✗ Public | ✓ Via Light Protocol | ✓ Via Light Protocol |
| Execution timing | ✓ Visible | ✓ Visible | ✓ Visible (at trigger) |

**Value Proposition:**
- Whale traders can set stop-losses without revealing exit prices
- Reduces stop-hunting by MEV bots and market makers
- Preserves settlement privacy (P&L hidden after close)
- First implementation combining ZK state + TEE execution on Solana

## Technical Constraints & Mitigations

### 1. Transaction Size (1232 bytes)

**Issue:** Light proof + Drift order may exceed MTU

**Mitigation:**
- Use Address Lookup Tables (reduce ~100 bytes)
- Split into Jito bundle if necessary
- Compression-aware proof format

### 2. Latency

**Issue:** ZK proof verification adds 500ms-2s

**Mitigation:**
- Acceptable for stop-loss orders (not HFT)
- Pre-fetch proofs when trigger approaches
- Cache proofs in ER for faster access

### 3. No Direct TEE Attestation

**Issue:** Cannot cryptographically verify MagicBlock TEE identity

**Mitigation:**
- Trust delegation authority chain (industry-standard)
- ExecutorPDA ownership proves ER control
- User explicitly consents to delegation

### 4. Merkle State Sync Delay

**Issue:** Light Protocol indexer may lag behind chain state

**Mitigation:**
- Use `waitForMerkleSync()` pattern (existing implementation)
- Buffer between trigger detection and execution
- Retry logic for stale proofs

## Security Considerations

### Trust Assumptions

1. **MagicBlock ER**: Trusted to execute orders correctly when triggered
2. **Light Protocol Indexer**: Trusted to provide valid Merkle proofs
3. **Pyth Oracle**: Trusted for price data
4. **Bridge Program**: Must be audited for authority verification bugs

### Attack Vectors

| Attack | Risk | Mitigation |
|--------|------|------------|
| ER reveals order data | Medium | ER runs in TEE; data encrypted at rest |
| Fake trigger execution | Low | Bridge verifies executor_pda delegation |
| Replay attack | None | UTXO-style nullification prevents reuse |
| Front-running at execution | Low | Jito bundle + MEV protection |
| Merkle proof forgery | None | Cryptographically impossible |

### Audit Checklist

- [ ] Authority verification in bridge program
- [ ] Nullification cannot be bypassed
- [ ] No information leakage in error messages
- [ ] Delegation state correctly validated
- [ ] CPI to Drift uses correct accounts

## References

- [Light Protocol Documentation](https://www.zkcompression.com/) - ZK Compression and Compressed PDAs
- [MagicBlock Documentation](https://docs.magicblock.gg/) - Ephemeral Rollups and Delegation
- [Drift Protocol Documentation](https://docs.drift.trade/) - Perpetuals trading
- [Jito Documentation](https://jito-labs.gitbook.io/) - Bundle submission

## Related Documentation

- [[technical/integrations/light-protocol]] - Settlement privacy implementation
- [[technical/integrations/magicblock]] - Ephemeral Rollup integration
- [[technical/privacy/model]] - Overall privacy model
- [[technical/privacy/architecture]] - Privacy architecture diagrams

---
purpose: Documents MagicBlock Ephemeral Rollup integration for private trading execution
related:
  - technical/integrations/overview
  - technical/integrations/drift
  - technical/integrations/jito
  - technical/specs/anchor-program-instructions
  - technical/privacy/model
  - technical/privacy/ghost-order-privacy-analysis
  - technical/integrations/light-protocol
source_of_truth: false
code_files:
  - app/app/hooks/use-magicblock.ts
  - app/app/hooks/use-ghost-crank.ts
  - app/anchor/programs/ghost-crank/src/lib.rs
  - app/anchor/programs/ghost-crank/src/instructions/create_ghost_order.rs
  - app/anchor/programs/ghost-crank/src/instructions/execute_trigger.rs
  - app/anchor/programs/vault/src/instructions/delegate.rs
  - app/anchor/programs/vault/src/instructions/undelegate.rs
last_verified: 2026-01-31
---

# MagicBlock Integration

> **TL;DR:** MagicBlock Ephemeral Rollup (ER) provides low-latency intent coordination and mempool privacy. It acts as a **private intent queue**, NOT a trade execution engine. Trades still settle on Drift (L1), so individual trade history is visible post-confirmation. The ER hides pending intents until execution.

## ⚠️ Build Requirements

The MagicBlock SDK (`ephemeral-rollups-sdk`) requires specific toolchain configuration. See [Build & Deploy Guide](../../development/build-and-deploy.md) for details.

**Quick Reference:**
```bash
# Build ghost-crank program
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml

# Generate IDL (requires Rust 1.89+)
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_crank -o target/idl/ghost_crank.json
```

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Session keypair generation | **Done** | Real @solana/web3.js Keypair |
| Session persistence | **Done** | localStorage with secret key recovery |
| Delegation PDA derivation | **Done** | Proper seeds for buffer/record/metadata |
| ER connection | **Done** | Points to devnet.magicblock.app |
| Delegation transaction | **Done** | Uses wallet adapter for base layer signing |
| ER execution | **Done** | Session keypair signs, sends to ER with skipPreflight |
| Commit/undelegate | **Done** | Session keypair signs, includes state propagation delay |
| On-chain delegation check | **Done** | Verifies account.owner equals DELEGATION_PROGRAM_ID |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                MagicBlock as Intent Coordinator                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User                          MagicBlock ER (TEE)              │
│   ────                          ────────────────                 │
│                                                                  │
│   1. Submit Intent ────────────► Intent queued privately         │
│      (encrypted trade params)    (not visible to mempool)        │
│                                                                  │
│   2. [Wait for batch            Collect N intents OR timeout     │
│       OR timeout]                                                │
│                                                                  │
│   3.                            Build Jito Bundle with N         │
│                                 distinct Drift::OpenPosition     │
│                                 instructions (NOT netted)        │
│                                                                  │
│   4.                   ◄─────── Submit to Jito Block Engine      │
│                                                                  │
│   Solana L1                                                      │
│   ─────────                                                      │
│   5. Atomic execution in one block                               │
│      - All N trades visible post-confirmation                    │
│      - Observer sees N trades from same executor                 │
│      - Cannot easily link which input → which trade              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

⚠️  IMPORTANT: Trade settlement happens on L1, NOT inside the ER.
    The ER is a private queue, not an execution environment for Drift.
```

## Key Files

### Frontend
- `app/app/hooks/use-magicblock.ts` - Primary MagicBlock hook (~1100 LOC)
- `app/app/hooks/use-ghost-crank.ts` - Simplified ghost order interface
- `app/app/types/ghost-order.ts` - Ghost order types and helpers
- `app/app/lib/ghost-crank-idl.json` - Ghost Crank program IDL

### Anchor Programs
- `anchor/programs/vault/src/instructions/delegate.rs` - Vault delegation
- `anchor/programs/vault/src/instructions/undelegate.rs` - Vault undelegation
- `anchor/programs/ghost-crank/src/state/ghost_order.rs` - GhostOrder account struct
- `anchor/programs/ghost-crank/src/instructions/execute_trigger.rs` - Magic Action CPI to Drift
- `anchor/programs/ghost-crank/src/instructions/check_trigger.rs` - Price monitoring

## Constants

```typescript
import {
  DELEGATION_PROGRAM_ID as SDK_DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID as SDK_MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID as SDK_MAGIC_CONTEXT_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";

export const MAGICBLOCK_ER_RPC = "https://devnet.magicblock.app";
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const MAGIC_PROGRAM_ID = SDK_MAGIC_PROGRAM_ID.toBase58();
export const MAGIC_CONTEXT_ID = SDK_MAGIC_CONTEXT_ID.toBase58();
export const DELEGATION_PROGRAM_ID = SDK_DELEGATION_PROGRAM_ID.toBase58();

const GHOST_CRANK_PROGRAM_ID = "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv"; // Deployed on devnet
const DRIFT_PROGRAM_ID = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";
```

## Session Management

### Creating a Session

```typescript
const { createSession } = useMagicBlock();

// Creates real keypair, stores in localStorage
await createSession();
// Returns session with:
// - id: unique session identifier
// - publicKey: session keypair public key
// - expiresAt: session expiration timestamp
// - status: "connected"
```

### Session Persistence

Sessions are stored in-memory using React refs (ephemeral keypairs):
```typescript
// Session keypair stored in ref (lost on page reload)
const sessionKeypairRef = useRef<Keypair | null>(null);

// Creating a new session generates a fresh keypair
const keypair = Keypair.generate();
sessionKeypairRef.current = keypair;
```

> **Note:** Sessions do NOT survive page reloads. Each page load requires creating a new session. This is by design for security - ephemeral keypairs should not be persisted to localStorage.

## Delegation Flow

### 1. Derive PDAs

```typescript
const deriveDelegationPDAs = async (accountPubkey: PublicKey, ownerProgram: PublicKey) => {
  const [delegationBuffer] = await PublicKey.findProgramAddress(
    [Buffer.from("buffer"), accountPubkey.toBuffer(), ownerProgram.toBuffer()],
    new PublicKey(DELEGATION_PROGRAM_ID)
  );
  const [delegationRecord] = await PublicKey.findProgramAddress(
    [Buffer.from("delegation"), accountPubkey.toBuffer()],
    new PublicKey(DELEGATION_PROGRAM_ID)
  );
  const [delegationMetadata] = await PublicKey.findProgramAddress(
    [Buffer.from("delegation-metadata"), accountPubkey.toBuffer()],
    new PublicKey(DELEGATION_PROGRAM_ID)
  );
  return { delegationBuffer, delegationRecord, delegationMetadata };
};
```

### 2. Delegate Account

```typescript
const delegateVaultToER = async () => {
  // Transaction accounts:
  // - payer (signer, writable)
  // - systemProgram
  // - targetAccount (vault PDA)
  // - ownerProgram (vault program)
  // - delegationBuffer
  // - delegationRecord
  // - delegationMetadata
  // - delegationProgram

  // Instruction data includes commit frequency (30 seconds)
};
```

### 3. Execute in ER

```typescript
const executeInER = async (instruction: TransactionInstruction) => {
  // Build transaction with:
  // - Session keypair as signer
  // - Target account as writable
  // Send to ER RPC instead of base layer
};
```

### 4. Commit and Undelegate

```typescript
const commitAndUndelegate = async () => {
  // Build undelegate transaction
  // Commits final state to Solana mainnet
  // Releases account control back to owner
};
```

## Privacy Guarantees (Corrected)

**What MagicBlock DOES protect:**

1. **Mempool privacy** - Pending intents are hidden from searchers/MEV bots
2. **Intent aggregation** - Multiple intents can be batched before execution
3. **Pre-confirmation secrecy** - Nobody sees your trade until it hits the block

**What MagicBlock DOES NOT protect:**

1. **Post-confirmation visibility** - Executed trades are visible on block explorers
2. **Trade history** - Each Drift::OpenPosition is recorded on L1 ledger
3. **Amount correlation** - Without batching, decompress→trade amounts are linkable

**Critical Constraint:** MagicBlock cannot delegate Drift's shared market accounts (orderbook, AMM) to a single user's ER. Therefore, trade settlement MUST happen on L1 where Drift's state lives. The ER role is "Intent Coordinator", not "Execution Engine".

## Current Limitations

1. **Devnet only** - MagicBlock mainnet not yet available
2. **Single account delegation** - Only one account can be delegated per session
3. **Price feed placeholder** - Frontend currently uses `PublicKey.default` as placeholder; real Pyth Lazer feed addresses need to be passed via `CreateGhostOrderParams.feedId`
4. **Session not persistent** - Sessions are in-memory only and lost on page reload

## Transaction Signing Architecture

The implementation uses a dual-signing approach:

```typescript
// Base layer transactions (delegation)
// Uses wallet adapter via useWalletActions().sendTransaction()
const base64Tx = serializeTransactionBase64(transaction);
const signature = await walletActions.sendTransaction(base64Tx, "confirmed");

// ER transactions (operations, commit/undelegate)
// Uses session keypair directly
tx.sign(sessionKeypair);
const signature = await erConnection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,  // Required for ER
});
```

## Ghost-Crank Program Integration

The Ghost-Crank program enables private trigger orders that execute via the Ephemeral Rollup:

### Program Overview

```typescript
const GHOST_CRANK_PROGRAM_ID = "7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv";  // Deployed on devnet (2026-01-30)
```

### Order Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  Ghost Order Lifecycle                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. create_ghost_order (Base Layer)                        │
│      - Creates GhostOrder PDA with status: Pending          │
│      ↓                                                      │
│   2. delegate_order (Base Layer)                            │
│      - Delegates order account to ER                        │
│      ↓                                                      │
│   3. activate_order (ER)                                    │
│      - Sets status: Active                                  │
│      ↓                                                      │
│   4. schedule_monitoring (ER)                               │
│      - Registers with MagicBlock crank scheduler            │
│      ↓                                                      │
│   5. check_trigger (ER, by crank)                           │
│      - Checks price against trigger condition               │
│      - If triggered, sets status: Triggered                 │
│      ↓                                                      │
│   6. execute_trigger (ER, by crank)                         │
│      - CPI to Drift place_perp_order                        │
│      - Sets status: Executed                                │
│      ↓                                                      │
│   7. commit_and_undelegate (ER → Base Layer)                │
│      - State committed to L1                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### GhostOrder State

```rust
#[account]
pub struct GhostOrder {
    pub owner: Pubkey,               // Order creator
    pub order_id: u64,               // Unique order identifier
    pub market_index: u16,           // Drift perp market index (0=SOL, 1=BTC, 2=ETH)
    pub trigger_price: i64,          // Price scaled by 1e6 (e.g., $200.50 = 200_500_000)
    pub trigger_condition: TriggerCondition,  // Above = 0, Below = 1
    pub order_side: OrderSide,       // Long = 0, Short = 1
    pub base_asset_amount: u64,      // Size in base asset units
    pub reduce_only: bool,           // Close-only order flag
    pub status: OrderStatus,         // Current order status
    pub created_at: i64,             // Unix timestamp
    pub triggered_at: i64,           // When trigger condition was met
    pub executed_at: i64,            // When Drift order was placed
    pub expiry: i64,                 // Order expiration timestamp
    pub feed_id: [u8; 32],           // Pyth Lazer price feed ID
    pub crank_task_id: u64,          // Magic Program scheduler task ID
    pub execution_price: i64,        // Price at trigger (scaled by 1e6)
    pub bump: u8,                    // PDA bump seed
}

impl GhostOrder {
    pub const SEED_PREFIX: &'static [u8] = b"ghost_order";
    pub const LEN: usize = 159;  // Total account size including discriminator
}
```

### Order Status Values

| Status | Value | Description |
|--------|-------|-------------|
| Pending | 0 | Created, awaiting delegation |
| Active | 1 | Delegated and monitoring |
| Triggered | 2 | Condition met, awaiting execution |
| Executed | 3 | Trade executed on Drift |
| Cancelled | 4 | Manually cancelled |
| Expired | 5 | Past expiry timestamp |

### Execute Trigger CPI

The `execute_trigger` instruction performs a CPI to Drift's `place_perp_order` via Magic Actions:

```rust
#[commit]
#[derive(Accounts)]
pub struct ExecuteTrigger<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.status == OrderStatus::Triggered
    )]
    pub ghost_order: Account<'info, GhostOrder>,

    /// CHECK: Drift program state
    pub drift_state: AccountInfo<'info>,

    /// CHECK: Drift user account
    #[account(mut)]
    pub drift_user: AccountInfo<'info>,

    /// CHECK: Drift user stats
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,

    /// CHECK: Authority for Drift user
    pub drift_authority: AccountInfo<'info>,

    /// CHECK: Perp market account
    #[account(mut)]
    pub perp_market: AccountInfo<'info>,

    /// CHECK: Oracle for the market
    pub oracle: AccountInfo<'info>,

    // Added by #[commit] macro:
    // pub magic_context: AccountInfo<'info>,
    // pub magic_program: AccountInfo<'info>,
}
```

---

## Anchor Macros for Ephemeral Rollups

Both the Vault and Ghost-Crank programs use MagicBlock's SDK macros:

### `#[delegate]` Macro

Used for delegation instructions that transfer account ownership to the ER:

```rust
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: The PDA to delegate
    #[account(
        mut,
        del,  // Marks this account for delegation
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
}

pub fn handler(ctx: Context<DelegateInput>) -> Result<()> {
    let owner_key = ctx.accounts.owner.key();
    let seeds = &[Vault::SEED_PREFIX, owner_key.as_ref()];

    ctx.accounts.delegate_vault(
        &ctx.accounts.owner,
        seeds,
        DelegateConfig::default(),
    )?;

    Ok(())
}
```

**Effects:**
- Adds delegation-related accounts automatically
- Enables the `del` attribute on accounts being delegated
- Provides `delegate_*` helper methods on the context

### `#[commit]` Macro

Used for undelegation and Magic Action instructions:

```rust
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

#[commit]
#[derive(Accounts)]
pub struct Undelegate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    // magic_context and magic_program accounts added automatically
}

pub fn handler(ctx: Context<Undelegate>) -> Result<()> {
    commit_and_undelegate_accounts(
        &ctx.accounts.owner,
        vec![&ctx.accounts.vault.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}
```

**Effects:**
- Automatically adds `magic_context` and `magic_program` accounts
- Enables state commitment back to L1
- Supports Magic Actions (CPI calls during undelegation)

---

## Frontend Integration

### useMagicBlock Hook

Primary hook for ER session management and ghost order operations:

```typescript
const {
  // Session State
  isSessionActive,
  sessionExpiry,
  sessionPublicKey,
  status,        // "disconnected" | "connecting" | "connected" | "expired" | "error"
  error,

  // Session Management
  createSession,
  endSession,

  // Privacy Mode
  isPrivacyModeEnabled,
  enablePrivacyMode,
  disablePrivacyMode,

  // Delegation
  delegationStatus,  // "undelegated" | "delegating" | "delegated" | "committing" | "error"
  delegatedAccount,
  delegateVaultToER,
  commitAndUndelegate,

  // Session Funding (for ER transaction fees)
  sessionBalance,
  fundSession,
  getSessionBalance,

  // Ghost Orders
  ghostOrders,
  isLoadingOrders,
  createGhostOrder,
  cancelGhostOrder,
  activateAndMonitor,  // Combined activate + schedule_monitoring
  executeTrigger,
  fetchGhostOrders,

  // Raw Connections
  erConnection,    // Connection to MagicBlock ER RPC
  baseConnection,  // Connection to Solana base layer
} = useMagicBlock();
```

### Session Funding

Before executing transactions on the ER, fund the session escrow:

```typescript
// Fund session with 0.01 SOL for ER transaction fees
const signature = await fundSession(10_000_000); // lamports

// Check current session balance
const balance = await getSessionBalance();
```

### Activate and Monitor Combined

The `activateAndMonitor` method combines activation and crank scheduling:

```typescript
// Activate order and schedule price monitoring
await activateAndMonitor(
  orderId,
  500,   // checkIntervalMs - check price every 500ms
  1000   // maxIterations - max 1000 checks (~8.3 minutes)
);
```

### useGhostCrank Hook

Simplified hook for ghost order management:

```typescript
const {
  ghostOrders,
  isLoading,
  createGhostOrder,
  cancelGhostOrder,
  refreshGhostOrders,
} = useGhostCrank();
```

---

## Future Improvements

- [ ] Add session timeout handling with automatic commit
- [ ] Implement automatic commit on disconnect
- [ ] Add multi-account delegation support
- [ ] Mainnet deployment when MagicBlock launches
- [ ] Add GetCommitmentSignature for commit verification on base layer

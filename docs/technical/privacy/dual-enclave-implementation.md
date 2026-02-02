---
purpose: Documents the Dual-Enclave architecture implementation combining Light Protocol and MagicBlock
related: [technical/integrations/light-protocol, technical/integrations/magicblock]
source_of_truth: true
code_files:
  - app/anchor/programs/ghost-bridge/src/lib.rs
  - app/app/hooks/use-private-ghost-orders.ts
  - app/app/lib/tee-encryption.ts
  - app/app/lib/ghost-bridge-instructions.ts
last_verified: 2026-01-31
---

# Dual-Enclave Architecture Implementation

## Overview

The Dual-Enclave architecture combines Light Protocol (ZK-compressed state) with MagicBlock (TEE execution) to create truly hidden ghost orders. Stop-losses become invisible until triggered.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DUAL-ENCLAVE GHOST ORDER FLOW                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE A: Order Creation (User → Light Protocol)                         │
│  1. Frontend encrypts order data with TEE public key (ECIES)            │
│  2. Encrypted data stored in backend API                                 │
│  3. Order hash stored on-chain in ExecutorAuthority                     │
│                                                                          │
│  PHASE B: Authority Setup (User → MagicBlock)                            │
│  1. Create ExecutorAuthority PDA (one per user)                         │
│  2. Delegate ExecutorAuthority to MagicBlock ER                         │
│  3. Store order_hash in ExecutorAuthority for verification              │
│                                                                          │
│  PHASE C: Execution (MagicBlock ER → Drift)                             │
│  1. ER monitors Pyth, detects trigger condition                         │
│  2. ER fetches ENCRYPTED order data from API, decrypts in TEE           │
│  3. ER signs as ExecutorAuthority (delegated)                           │
│  4. ghost-bridge: consume_and_execute()                                 │
│     - Verify hash(order_data) == stored hash                            │
│     - CPI to Drift: place_perp_order                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Program Instructions

### ghost-bridge (Rust/Anchor)

| Instruction | Description |
|-------------|-------------|
| `init_executor` | Creates ExecutorAuthority PDA for user (one per user, max 16 orders) |
| `delegate_executor` | Delegates ExecutorAuthority to MagicBlock ER |
| `create_compressed_order` | Stores order hash in ExecutorAuthority |
| `consume_and_execute` | Verifies hash, executes Drift CPI via Magic Actions |
| `undelegate_executor` | Returns control from ER to user |

### Account Structures

**ExecutorAuthority** (565 bytes):
```rust
pub struct ExecutorAuthority {
    pub owner: Pubkey,            // 32 bytes
    pub order_count: u64,         // 8 bytes
    pub is_delegated: bool,       // 1 byte
    pub bump: u8,                 // 1 byte
    pub order_hashes: [[u8; 32]; 16], // 512 bytes
    pub order_hash_count: u8,     // 1 byte
}
```

**CompressedGhostOrder** (off-chain, encrypted):
```typescript
interface CompressedGhostOrderData {
  owner: string;
  orderId: string;
  marketIndex: number;
  triggerPrice: string;
  triggerCondition: "above" | "below";
  orderSide: "long" | "short";
  baseAssetAmount: string;
  reduceOnly: boolean;
  expiry: number;
  feedId: string;
}
```

## Frontend Integration

### React Hook

```typescript
import { usePrivateGhostOrders } from "@/app/hooks";

function GhostOrderUI() {
  const {
    isInitialized,
    isDelegated,
    orders,
    initializeExecutor,
    delegateExecutor,
    createPrivateOrder,
  } = usePrivateGhostOrders();

  // Initialize executor (one-time)
  await initializeExecutor();

  // Delegate to MagicBlock (one-time)
  await delegateExecutor();

  // Create private order
  await createPrivateOrder({
    marketIndex: 0,
    triggerPrice: "50000000000", // $50,000 scaled
    triggerCondition: "below",
    orderSide: "short",
    baseAssetAmount: "1000000", // 1.0 SOL
    reduceOnly: true,
    expirySeconds: 86400, // 24 hours
    feedId: "0xff61491a...", // Pyth feed ID
  });
}
```

### TEE Encryption

Order data is encrypted with the TEE's public key using ECIES:

```typescript
import { encryptOrderForTEE } from "@/app/lib/tee-encryption";

const encrypted = await encryptOrderForTEE(orderData, TEE_PUBLIC_KEY);
// encrypted.encryptedData - Base64 ECIES ciphertext
// encrypted.orderHash - Blake3 hash of order data
```

## API Endpoints

### `GET /api/ghost-orders/[hash]`
Fetches encrypted order data for TEE execution.

### `POST /api/ghost-orders/[hash]`
Stores encrypted order data after order creation.

### `DELETE /api/ghost-orders/[hash]`
Removes encrypted order data after execution.

## Security Properties

1. **Order Privacy**: Order parameters (trigger price, side, size) are encrypted and only the TEE can decrypt
2. **Hash Verification**: TEE verifies `hash(decrypted_data) == on-chain_hash` before execution
3. **Delegation Security**: ExecutorAuthority can only be modified by delegated ER or owner
4. **Atomic Execution**: Magic Actions ensure Drift CPI + state update happen atomically

## Build Commands

```bash
# Build program
cargo-build-sbf --manifest-path app/anchor/programs/ghost-bridge/Cargo.toml

# Generate IDL
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_bridge -o target/idl/ghost_bridge.json

# Deploy (after generating keypair)
solana program deploy target/deploy/ghost_bridge.so
```

## Dependencies

### Rust
- `anchor-lang = "0.32.1"`
- `ephemeral-rollups-sdk = "0.6.5"`
- `magicblock-magic-program-api = "0.6"`
- `blake3 = "1.5.5"`

### TypeScript
- `@magicblock-labs/ephemeral-rollups-sdk`
- `@noble/hashes` (blake3)
- `eciesjs` (ECIES encryption)
- `bn.js` (big number handling)

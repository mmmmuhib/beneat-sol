---
purpose: Documents Light Protocol integration for ZK-compressed private P&L storage
related:
  - technical/integrations/overview
  - technical/privacy/model
  - technical/privacy/ghost-order-privacy-analysis
  - technical/integrations/magicblock
  - technical/integrations/helius
source_of_truth: false
code_files:
  - app/app/hooks/use-light-protocol.ts
  - app/app/hooks/use-shield.ts
  - app/app/lib/light-wallet-adapter.ts
  - app/app/lib/light-instructions.ts
  - app/app/lib/solana-adapter.ts
last_verified: 2026-01-31
---

# Light Protocol

> **TL;DR:** Light Protocol provides ZK-compressed accounts for settlement privacy. After a trade closes, realized P&L is compressed into a hidden balance. This hides *what you walked away with*, not *what you traded*. Trade execution on Drift L1 is always visible.

## SDK Version & Dependencies

```json
{
  "@lightprotocol/compressed-token": "^0.22.0",
  "@lightprotocol/stateless.js": "^0.22.0"
}
```

## Program IDs

| Program | Address | Description |
|---------|---------|-------------|
| Light System Program | `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7` | Core system program |
| Compressed Token Program | `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m` | Compressed token operations |

## Privacy Model: Settlement Privacy

Beneat uses a **three-layer privacy architecture**. Each layer protects a different aspect of trading:

| Layer | Technology | Protects | Limitation |
|-------|-----------|----------|------------|
| Intent Privacy | MagicBlock Ephemeral Rollups | **When/what** you plan to trade (ghost orders in TEE) | Only hides intent, not execution |
| Execution | Drift on Solana L1 | N/A — trades always public | Drift state lives on L1; ERs cannot execute Drift trades |
| Settlement Privacy | Light Protocol ZK Compression | **Final balance** and realized P&L | Only hides resting balance, not trade instructions |

### What IS Private

- **Resting balance** in compressed pool — observers cannot see how much you hold
- **Realized P&L** after position close — the amount withdrawn and compressed is hidden
- **Compressed transfers** between accounts

### What IS NOT Private

- **Trade execution** — Drift instructions are visible on Solana block explorers
- **Position size** while open — Drift tracks this internally on L1
- **Deposit amount** when pre-funding from compressed balance (decompress → deposit visible on-chain)

### Why MagicBlock ER Cannot Execute Drift Trades

Drift protocol state (markets, AMM, oracles, insurance fund) lives on Solana L1. MagicBlock ERs can only delegate user-owned accounts (vault PDA, ghost order PDA). The correct design:

1. **ER** processes ghost order logic (intent privacy in TEE)
2. **Ghost crank** `#[commit]` pushes trigger STATUS to L1
3. **Drift instruction** executes on L1 (always visible)

This is a constraint of the architecture, not a bug.

## Settlement Flow

The decoupled settlement flow separates funding, trading, and privacy compression:

```
┌──────────────────────────────────────────────────────────────────┐
│                    Settlement Privacy Flow                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. PRE-FUND (separate tx)                                       │
│     Compressed Pool ──decompress──► ATA ──deposit──► Drift       │
│     (private balance)                      (visible on L1)       │
│                                                                   │
│  2. TRADE (simple tx, no Light Protocol needed)                  │
│     Drift: Open/Manage Position                                  │
│     (always visible on L1)                                       │
│                                                                   │
│  3. SETTLE (close bundle)                                        │
│     Drift: Close ──withdraw──► ATA ──compress──► Compressed Pool │
│                                                  (RESULT hidden) │
│                                                                   │
│  Fallback: If compress fails, funds sit in ATA                   │
│            settlePending() retries compression separately         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Why Decoupled Flow (Not Atomic)

The old `decompress → deposit → trade → compress` atomic bundle leaked inner instruction amounts on-chain after confirmation. Observers could trivially correlate decompress amounts to trade sizes. The decoupled flow eliminates this false sense of privacy.

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| RPC connection | **Done** | Helius with compression support, cluster-aware config via `getLightConfig()` |
| Compressed balance query | **Done** | `getCompressedTokenAccountsByOwner()` with balance aggregation |
| Compressed token accounts | **Done** | Full account listing with mint, amount, owner extraction |
| Token pool validation | **Done** | `getTokenPoolInfos()` + `selectTokenPoolInfo()` |
| Indexer health check | **Done** | `getIndexerHealth()` returns status and current slot |
| Merkle state sync | **Done** | `waitForMerkleSync()` polls for state updates (20 attempts max) |
| Settlement (compress) | **Done** | `CompressedTokenProgram.compress()` via wallet adapter bridge |
| Transfer compressed | **Done** | `CompressedTokenProgram.transfer()` with validity proof |
| Decompress tokens | **Done** | `CompressedTokenProgram.decompress()` with pool info selection |
| Delegate approval | **Done** | `CompressedTokenProgram.approve()` for ghost order authorization |
| Delegate revocation | **Done** | `CompressedTokenProgram.revoke()` for delegated accounts |
| Dev mode fallbacks | **Done** | All operations simulated with realistic delays |
| Decoupled settlement | **Done** | `prefundFromCompressed` + `executeSimpleTrade` + `executeShieldedClose` |
| Loss-aware close | **Done** | Handles total loss (skip withdraw/compress), partial loss, and profit |
| Fallback settlement | **Done** | `settlePending()` retries compression for funds stuck in ATA |
| Instruction builders | **Done** | `buildDecompressInstruction()` / `buildCompressInstruction()` for bundles |
| Jito bundle integration | **Done** | `submitAtomicBundleWithRetry()` for MEV-protected settlement |

### Simulated Features (Awaiting MagicBlock TEE)

| Feature | Status | Notes |
|---------|--------|-------|
| Compress with delegate | **Simulated** | Pool info lookup works, custom instruction not built |
| Decompress via delegate | **Simulated** | Requires MagicBlock TEE session key to sign |

## Architecture

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `app/hooks/use-light-protocol.ts` | Main ZK settlement hook, delegation management | ~1400 |
| `app/hooks/use-shield.ts` | Shielded trading orchestration, Jito bundling | ~860 |
| `app/lib/light-wallet-adapter.ts` | Bridges wallet-standard to Light SDK Signer interface | ~360 |
| `app/lib/light-instructions.ts` | SDK-based instruction builders for bundles | ~280 |
| `app/lib/solana-adapter.ts` | Cluster-aware config, type boundary for web3.js | ~340 |

### Type Boundary Pattern

The codebase uses a clean separation between `@solana/kit` types (app code) and `@solana/web3.js` types (external SDKs):

```typescript
// solana-adapter.ts provides conversion at the boundary
import { toPublicKey, toAddress } from "../lib/solana-adapter";

// App code uses Kit Address
const walletAddress: Address = wallet?.account?.address;

// Convert when calling Light Protocol SDK
const ownerPubkey = await toPublicKey(walletAddress);
const accounts = await rpc.getCompressedTokenAccountsByOwner(ownerPubkey);
```

## SDK Usage Examples

### RPC Connection Setup

```typescript
import { createRpc } from "@lightprotocol/stateless.js";
import { getLightConfig } from "../lib/solana-adapter";

// Auto-detects cluster and uses Helius if API key available
const config = getLightConfig();
const rpc = createRpc(
  config.compressionRpcEndpoint,
  config.compressionRpcEndpoint,
  config.compressionRpcEndpoint
);
```

### Compressed Balance Query

```typescript
// From use-light-protocol.ts:94-149
const getCompressedBalance = async (mint: string): Promise<CompressedBalance | null> => {
  const { createRpc } = await import("@lightprotocol/stateless.js");
  const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);

  const accounts = await connection.getCompressedTokenAccountsByOwner(
    walletAddress as unknown as PublicKey,
    { mint: mint as unknown as PublicKey }
  );

  if (!accounts.items || accounts.items.length === 0) {
    return { mint, amount: 0n, decimals: 9 };
  }

  const totalAmount = accounts.items.reduce(
    (sum, acc) => sum + BigInt(acc.parsed.amount),
    0n
  );

  return { mint, amount: totalAmount, decimals: 9 };
};
```

### Compress Tokens (Settlement)

```typescript
// From light-wallet-adapter.ts:108-144
import { CompressedTokenProgram, getTokenPoolInfos, selectTokenPoolInfo } from "@lightprotocol/compressed-token";
import { selectStateTreeInfo } from "@lightprotocol/stateless.js";

const poolInfos = await getTokenPoolInfos(rpc, mint);
const tokenPoolInfo = selectTokenPoolInfo(poolInfos);

const treeInfos = await rpc.getStateTreeInfos();
const outputStateTreeInfo = selectStateTreeInfo(treeInfos);

const ix = await CompressedTokenProgram.compress({
  payer: adapter.publicKey,
  owner: adapter.publicKey,
  source: sourceAta,
  toAddress: ownerPubkey,
  mint: mintPubkey,
  amount: amountBN,
  outputStateTreeInfo,
  tokenPoolInfo,
});
```

### Decompress Tokens

```typescript
// From light-wallet-adapter.ts:149-204
import { selectMinCompressedTokenAccountsForTransfer, selectTokenPoolInfosForDecompression } from "@lightprotocol/compressed-token";

// Select minimum accounts needed
const compressedAccounts = await rpc.getCompressedTokenAccountsByOwner(owner, { mint });
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(compressedAccounts.items, amount);

// Get validity proof
const proof = await rpc.getValidityProof(
  inputAccounts.map((account) => account.compressedAccount.hash)
);

// Get token pool info for decompression
const poolInfos = await getTokenPoolInfos(rpc, mint);
const tokenPoolInfos = selectTokenPoolInfosForDecompression(poolInfos, amount);

const ix = await CompressedTokenProgram.decompress({
  payer: adapter.publicKey,
  inputCompressedTokenAccounts: inputAccounts,
  toAddress: destinationAta,
  amount: amountBN,
  recentInputStateRootIndices: proof.rootIndices,
  recentValidityProof: proof.compressedProof,
  tokenPoolInfos,
});
```

### Transfer Compressed Tokens

```typescript
// From light-wallet-adapter.ts:209-252
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(compressedAccounts.items, amount);
const proof = await rpc.getValidityProof(inputAccounts.map((acc) => acc.compressedAccount.hash));

const ix = await CompressedTokenProgram.transfer({
  payer: adapter.publicKey,
  inputCompressedTokenAccounts: inputAccounts,
  toAddress: recipientPubkey,
  amount: amountBN,
  recentInputStateRootIndices: proof.rootIndices,
  recentValidityProof: proof.compressedProof,
});
```

### Delegate Approval

```typescript
// From light-wallet-adapter.ts:260-305
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(compressedAccounts.items, amount);
const proof = await rpc.getValidityProof(inputAccounts.map((acc) => acc.compressedAccount.hash));

const ix = await CompressedTokenProgram.approve({
  payer: adapter.publicKey,
  inputCompressedTokenAccounts: inputAccounts,
  toDelegate: sessionKey,
  delegatedAmount: amountBN,
  recentInputStateRootIndices: proof.rootIndices,
  recentValidityProof: proof.compressedProof,
});
```

## Wallet Adapter Bridge

The SDK expects `Signer` interface (with `secretKey`), but browser wallets provide `signTransaction`. The `light-wallet-adapter.ts` bridges this gap:

```typescript
// light-wallet-adapter.ts:30-78
export interface LightWalletAdapter {
  publicKey: PublicKey;
  signAndSendTransaction: (
    connection: Connection,
    instructions: TransactionInstruction[]
  ) => Promise<string>;
}

export async function createLightWalletAdapter(
  walletAddress: string,
  signTransaction: WalletSignTransaction,
  connection: Connection
): Promise<LightWalletAdapter> {
  const publicKey = new PublicKey(walletAddress);

  return {
    publicKey,
    signAndSendTransaction: async (conn, instructions) => {
      // Add compute budget
      const computeIxs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ];

      const allInstructions = [...computeIxs, ...instructions];

      // Build VersionedTransaction
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
      const message = MessageV0.compile({
        payerKey: publicKey,
        instructions: allInstructions,
        recentBlockhash: blockhash,
      });

      const transaction = new VersionedTransaction(message);
      const signedTx = await signTransaction(transaction);

      // Send and confirm
      const signature = await conn.sendRawTransaction(signedTx.serialize());
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      return signature;
    },
  };
}
```

## Shield Hook API

The shield hook orchestrates the decoupled settlement flow:

```typescript
// use-shield.ts exports
interface UseShieldReturn {
  // State
  isShielding: boolean;
  shieldError: string | null;
  lastShieldResult: ShieldResult | null;
  shieldMode: boolean;
  hasPendingSettlement: boolean;
  canShield: boolean;

  // Actions
  enableShieldMode(): void;
  disableShieldMode(): void;
  prefundFromCompressed(amount: number): Promise<ShieldResult>;
  executeSimpleTrade(params: ShieldTradeParams): Promise<ShieldResult>;
  executeShieldedClose(params: ShieldCloseParams): Promise<ShieldResult>;
  settlePending(): Promise<ShieldResult>;
  executeShieldedTrade(params: ShieldTradeParams): Promise<ShieldResult>;  // Legacy atomic
}
```

### ShieldResult

```typescript
interface ShieldResult {
  success: boolean;
  signature?: string;
  bundleId?: string;
  error?: string;
  phase?: "decompress" | "deposit" | "trade" | "withdraw" | "compress";
  realizedLoss?: bigint;           // Loss amount (positive) if position lost
  settledAmount?: bigint;          // Amount successfully compressed
  pendingSettlement?: boolean;      // True if compress was skipped
  pendingSettlementAmount?: bigint; // Amount waiting for retry
  timestamp: number;
}
```

## Merkle State Synchronization

Before building instructions, the implementation waits for the Merkle state to sync:

```typescript
// use-light-protocol.ts:1175-1242
const waitForMerkleSync = async (): Promise<{ synced: boolean; slot?: number; error?: string }> => {
  const connection = createRpc(rpcEndpoint, rpcEndpoint, rpcEndpoint);
  const currentSlot = await connection.getIndexerSlot();

  if (lastMerkleSlot !== null && currentSlot <= lastMerkleSlot) {
    // Poll for new state (max 20 attempts, 400ms each)
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 400));
      const newSlot = await connection.getIndexerSlot();
      if (newSlot > lastMerkleSlot) {
        setLastMerkleSlot(newSlot);
        return { synced: true, slot: newSlot };
      }
      attempts++;
    }
    return { synced: false, error: "Timeout waiting for new Merkle state" };
  }

  setLastMerkleSlot(currentSlot);
  return { synced: true, slot: currentSlot };
};
```

## Known Mints (Cluster-Aware)

```typescript
// solana-adapter.ts:105-118
const LIGHT_KNOWN_MINTS = {
  "mainnet-beta": {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    SOL: "So11111111111111111111111111111111111111112",
  },
  devnet: {
    USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    SOL: "So11111111111111111111111111111111111111112",
  },
  localnet: {
    USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    SOL: "So11111111111111111111111111111111111111112",
  },
};
```

## Current Limitations

1. **Token pool required** — Settlement requires token to have registered compression pool on Light Protocol
2. **Helius API key required** — Compression RPC only works via `NEXT_PUBLIC_HELIUS_API_KEY`
3. **State tree sync delay** — Transactions may fail if Merkle state hasn't synced; `waitForMerkleSync()` polls but has 20-attempt limit
4. **Trade execution visible** — Drift trades on L1 are always public; only settlement is private
5. **Hardcoded compute budget** — 500k units / 50k microlamports without dynamic adjustment
6. **No retry on proof failure** — If `getValidityProof()` fails, transaction immediately fails
7. **Account fragmentation** — `selectMinCompressedTokenAccountsForTransfer` may fail if accounts too fragmented

## Test Coverage

| Test File | Coverage |
|-----------|----------|
| `__tests__/light-protocol/light-wallet-adapter.test.ts` | Adapter creation, transaction signing |
| `__tests__/light-protocol/light-config.test.ts` | Cluster detection, config selection |

**Missing:**
- Integration tests with real devnet tokens
- End-to-end shielded trade flow tests
- Merkle sync edge case tests
- Token pool validation tests

## Future Improvements

- [x] Complete Signer wrapper for wallet adapter (`light-wallet-adapter.ts`)
- [x] Implement compressed token transfers for private payments
- [x] Automatic settlement on position close (`executeShieldedClose`)
- [x] Fallback settlement for failed compress (`settlePending()`)
- [x] Decoupled pre-fund / trade / settle flow
- [x] Loss-aware close handling (total loss, partial loss, profit)
- [x] Merkle state synchronization (`waitForMerkleSync()`)
- [x] Jito bundle integration for MEV protection
- [ ] Complete MagicBlock TEE integration for delegated operations
- [ ] Dynamic compute budget based on instruction complexity
- [ ] Retry logic for validity proof failures
- [ ] Add batch settlement for multiple P&L entries
- [ ] Mainnet deployment with production Helius key
- [ ] Integration tests with real devnet tokens

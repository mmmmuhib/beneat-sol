---
purpose: Documents Jito bundle integration for MEV protection and priority transaction landing
related:
  - technical/integrations/index
  - technical/integrations/drift
  - technical/integrations/magicblock
source_of_truth: false
code_files:
  - app/app/lib/jito-bundle.ts
last_verified: 2026-01-28
---

# Jito Bundle Integration

> **TL;DR:** Jito bundles provide MEV protection and guaranteed atomic execution. The integration supports single-transaction and multi-transaction bundles with automatic tip escalation on retry. Bundles are submitted to Jito's Block Engine for inclusion by validators running Jito-Solana.

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Single-tx bundle | **Done** | `submitAtomicBundle()` |
| Multi-tx bundle | **Done** | Up to 5 transactions |
| Tip account rotation | **Done** | 8 tip accounts, random selection |
| Priority fee tiers | **Done** | Low/medium/high |
| Retry with escalation | **Done** | Configurable tip increase |
| Bundle status polling | **Done** | 30 attempts, 2s interval |
| Dev mode simulation | **Done** | Skips actual submission |
| Compute budget | **Done** | 1.4M CU for shielded trades |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Jito Bundle Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. Build instructions                                     │
│      ↓                                                      │
│   2. Add compute budget (CU limit + priority fee)           │
│      ↓                                                      │
│   3. Add tip instruction (random tip account)               │
│      ↓                                                      │
│   4. Simulate transaction locally                           │
│      ↓                                                      │
│   5. Sign transaction                                       │
│      ↓                                                      │
│   6. Submit to Jito Block Engine                            │
│      ↓                                                      │
│   7. Poll for bundle status                                 │
│      - Pending → Confirmed/Finalized (success)              │
│      - Failed/Rejected (retry with higher tip)              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Constants

```typescript
const JITO_BLOCK_ENGINE_URL = "https://mainnet.block-engine.jito.wtf";
const MINIMUM_TIP_LAMPORTS = 10_000;        // 0.00001 SOL
const SHIELDED_TRADE_COMPUTE_UNITS = 1_400_000;
```

## Tip Accounts

Jito validators monitor these accounts for tips. The integration randomly selects one per bundle:

```typescript
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];
```

## Priority Fee Tiers

| Level | Compute Unit Price (microLamports) | Estimated Tip |
|-------|-----------------------------------|---------------|
| Low | 1,000 | 10,000 lamports |
| Medium | 50,000 | 50,000 lamports |
| High | 200,000 | 100,000 lamports |

## Core Functions

### Submit Single-Transaction Bundle

```typescript
const result = await submitAtomicBundle({
  instructions: [driftOpenPositionIx],
  payer: walletPubkey,
  connection,
  signTransaction,
  priorityLevel: "medium",
  computeUnits: 600_000,
});

if (result.success) {
  console.log("Bundle landed:", result.signature);
} else {
  console.error("Bundle failed:", result.error);
}
```

### Submit with Retry

```typescript
const result = await submitAtomicBundleWithRetry(
  {
    instructions,
    payer,
    connection,
    signTransaction,
    priorityLevel: "medium",
  },
  {
    maxRetries: 3,
    tipEscalation: 1.5,      // 50% increase per retry
    maxTipLamports: 500_000, // Cap at 0.0005 SOL
  }
);
```

### Submit Multi-Transaction Bundle

```typescript
const result = await submitMultiTransactionBundle({
  transactions: [
    { instructions: [depositIx] },
    { instructions: [openPositionIx] },
    { instructions: [setTriggerIx] },
  ],
  payer,
  connection,
  signTransaction,
  priorityLevel: "high",
});
```

## Bundle Submission Flow

### 1. Create Tip Instruction

```typescript
async function createTipInstruction(
  payer: PublicKey,
  tipAmount: number = MINIMUM_TIP_LAMPORTS
): Promise<TransactionInstruction> {
  const tipAccount = getRandomTipAccount();

  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(tipAccount),
    lamports: tipAmount,
  });
}
```

### 2. Submit to Block Engine

```typescript
async function submitBundleToJito(
  serializedTransactions: string[]
): Promise<{ bundleId: string }> {
  const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [serializedTransactions],
    }),
  });

  const result = await response.json();
  return { bundleId: result.result };
}
```

### 3. Poll Bundle Status

```typescript
async function getBundleStatus(bundleId: string): Promise<{
  status: string;
  landed?: boolean;
}> {
  const response = await fetch(`${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    }),
  });

  const result = await response.json();
  const statuses = result.result?.value || [];

  if (statuses.length === 0) {
    return { status: "pending" };
  }

  return {
    status: statuses[0].confirmation_status,
    landed: statuses[0].confirmation_status === "confirmed" ||
            statuses[0].confirmation_status === "finalized",
  };
}
```

## Tip Estimation

Dynamic tip estimation based on recent prioritization fees:

```typescript
async function estimateBundleTip(
  connection: Connection,
  priorityLevel: "low" | "medium" | "high" = "medium"
): Promise<number> {
  const baseTips = {
    low: 10_000,
    medium: 50_000,
    high: 100_000,
  };

  try {
    const recentFees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: [],
    });

    if (recentFees.length > 0) {
      const avgFee = recentFees.reduce((sum, f) =>
        sum + f.prioritizationFee, 0) / recentFees.length;

      const multipliers = { low: 1.0, medium: 1.5, high: 2.5 };

      return Math.max(
        MINIMUM_TIP_LAMPORTS,
        Math.floor(avgFee * multipliers[priorityLevel])
      );
    }
  } catch {
    // Fall back to base tips
  }

  return baseTips[priorityLevel];
}
```

## Dev Mode

When `isDevMode` is true, bundles are simulated without submission:

```typescript
async function simulateDevModeBundle(
  instructions: TransactionInstruction[]
): Promise<BundleResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  return {
    success: true,
    signature: `jito-bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    bundleId: `bundle-${Math.random().toString(36).slice(2, 14)}`,
  };
}
```

## Return Types

```typescript
interface BundleResult {
  success: boolean;
  signature?: string;
  bundleId?: string;
  error?: string;
}

interface RetryConfig {
  maxRetries?: number;      // Default: 3
  tipEscalation?: number;   // Default: 1.5 (50% increase)
  maxTipLamports?: number;  // Default: 500,000
}
```

## Multi-Transaction Bundle Limits

- Maximum 5 transactions per bundle
- Each transaction gets its own compute budget
- Tip only added to the last transaction
- All transactions share the same blockhash
- Atomic execution: all succeed or all fail

## Error Handling

| Error | Retry Strategy |
|-------|----------------|
| Simulation failed | No retry (fix instruction) |
| Bundle rejected | Retry with higher tip |
| Confirmation timeout | Retry with higher tip |
| Network error | Retry with same tip |

## Key File

| File | Purpose |
|------|---------|
| `app/app/lib/jito-bundle.ts` | Complete Jito bundle implementation |

## Usage with Drift

Jito bundles are particularly useful for Drift trades because:

1. **MEV Protection**: Prevents sandwich attacks on large orders
2. **Atomic Execution**: Position + trigger orders in one bundle
3. **Priority Landing**: Higher tip = faster inclusion during congestion
4. **Shielded Mode**: Combined with MagicBlock for private intent submission

---
purpose: Documents Drift Protocol V2 integration for perpetual trading
related:
  - technical/integrations/index
  - technical/integrations/jito
  - technical/integrations/magicblock
  - technical/specs/anchor-program-instructions
source_of_truth: false
code_files:
  - app/app/hooks/use-drift.ts
  - app/app/lib/drift-instructions.ts
  - app/app/lib/drift-verification.ts
  - app/app/types/drift.ts
last_verified: 2026-01-28
---

# Drift Protocol Integration

> **TL;DR:** Drift V2 is the primary perpetual trading backend. The integration provides manual instruction builders (not the full SDK) for initialize, deposit, withdraw, open/close positions, and trigger orders. Supports 31 perp markets with Pyth oracle integration.

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| User initialization | **Done** | Creates user + userStats PDAs |
| Deposit (USDC) | **Done** | Spot market index 0 |
| Withdraw (USDC) | **Done** | With drift_signer |
| Open perp position | **Done** | Market/limit orders |
| Close perp position | **Done** | Reduce-only with partial close |
| Trigger orders (SL/TP) | **Done** | TriggerMarket order type |
| Cancel order | **Done** | By order ID |
| Vault integration | **Done** | canTrade() checks before execution |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Trade Flow                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. User initiates trade                                   │
│      ↓                                                      │
│   2. useVault.canTrade() validates:                         │
│      - Vault not locked                                     │
│      - Not in cooldown                                      │
│      - Under daily trade limit                              │
│      ↓                                                      │
│   3. useDrift builds instruction                            │
│      ↓                                                      │
│   4. Transaction sent to Solana/Jito                        │
│      ↓                                                      │
│   5. useVault.recordTrade() updates stats                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Constants

```typescript
// Program
const DRIFT_PROGRAM_ID = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";

// Precision
const QUOTE_PRECISION = 1_000_000;      // 6 decimals (USDC)
const BASE_PRECISION = 1_000_000_000;   // 9 decimals
const PRICE_PRECISION = 1_000_000;      // 6 decimals

// Spot Markets
const USDC_SPOT_MARKET_INDEX = 0;
const SOL_SPOT_MARKET_INDEX = 1;

// Perp Markets
const SOL_PERP_MARKET_INDEX = 0;
const BTC_PERP_MARKET_INDEX = 1;
const ETH_PERP_MARKET_INDEX = 2;
```

## PDA Derivation

### User PDA

```typescript
function deriveUserPDA(authority: PublicKey, subAccountNumber: number = 0): PublicKey {
  const subAccountBuffer = Buffer.alloc(2);
  subAccountBuffer.writeUInt16LE(subAccountNumber);

  const [userPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), authority.toBuffer(), subAccountBuffer],
    DRIFT_PROGRAM_ID
  );

  return userPDA;
}
```

### User Stats PDA

```typescript
function deriveUserStatsPDA(authority: PublicKey): PublicKey {
  const [userStatsPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_stats"), authority.toBuffer()],
    DRIFT_PROGRAM_ID
  );

  return userStatsPDA;
}
```

### Other PDAs

| PDA | Seeds |
|-----|-------|
| State | `["drift_state"]` |
| Perp Market | `["perp_market", market_index (u16 LE)]` |
| Spot Market | `["spot_market", market_index (u16 LE)]` |
| Spot Market Vault | `["spot_market_vault", market_index (u16 LE)]` |
| Drift Signer | `["drift_signer"]` |

## Instruction Discriminators

```typescript
const DRIFT_INSTRUCTION_DISCRIMINATORS = {
  INITIALIZE_USER: 0,
  INITIALIZE_USER_STATS: 1,
  DEPOSIT: 3,
  WITHDRAW: 4,
  PLACE_PERP_ORDER: 23,
  CANCEL_ORDER: 24,
  SETTLE_PNL: 27,
};
```

## Supported Perp Markets (31 total)

| Index | Market | Oracle Address |
|-------|--------|----------------|
| 0 | SOL-PERP | `H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG` |
| 1 | BTC-PERP | `GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU` |
| 2 | ETH-PERP | `JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB` |
| 3 | APT-PERP | `FNNvb1AFDnDVPkocEri8mWbJ1952HQZtFLuwPiUjSJQ` |
| 4 | BONK-PERP | `8ihFLu5FimgTQ1Unh4dVyEHUGodJ5gJQCrQf4KUVB9bN` |
| ... | ... | ... |
| 30 | DRIFT-PERP | `PeNpQeGEm9UEFJ6MBCMauY4WW4h3YqLuNJds9cjjb8K` |

Full oracle mapping in `app/app/lib/drift-instructions.ts:768-831`

## Core Functions

### Initialize User

```typescript
const initIx = buildInitializeUserInstruction({
  authority: walletPubkey,
  payer: walletPubkey,
  subAccountNumber: 0,
  name: "Beneat",
});
```

### Deposit USDC

```typescript
const depositIx = buildDepositInstruction({
  amount: new BN(100_000_000), // 100 USDC
  spotMarketIndex: USDC_SPOT_MARKET_INDEX,
  userPDA,
  authority: walletPubkey,
  tokenAccount: userUsdcAta,
});
```

### Open Perp Position

```typescript
const openIx = buildOpenPerpPositionInstruction({
  marketIndex: SOL_PERP_MARKET_INDEX,
  baseAssetAmount: new BN(1_000_000_000), // 1 SOL
  direction: "long",
  userPDA,
  authority: walletPubkey,
  orderType: "market",
  reduceOnly: false,
});
```

### Close Perp Position

```typescript
const closeIx = buildClosePerpPositionInstruction({
  marketIndex: SOL_PERP_MARKET_INDEX,
  userPDA,
  authority: walletPubkey,
  baseAssetAmount: undefined, // Close entire position
});
```

### Place Trigger Order (Stop Loss / Take Profit)

```typescript
const triggerIx = buildPlaceTriggerOrderInstruction({
  marketIndex: SOL_PERP_MARKET_INDEX,
  baseAssetAmount: new BN(1_000_000_000),
  direction: "short", // Close a long
  triggerPrice: new BN(170_000_000), // $170
  triggerCondition: "below", // Stop loss
  userPDA,
  authority: walletPubkey,
});
```

## Order Types

```typescript
type OrderType = "market" | "limit" | "triggerMarket" | "triggerLimit" | "oracle";

const ORDER_TYPE_VALUES = {
  market: 0,
  limit: 1,
  triggerMarket: 2,
  triggerLimit: 3,
  oracle: 4,
};
```

## Trigger Conditions

```typescript
type TriggerCondition = "above" | "below";

// Automatic inference for SL/TP
function inferTriggerCondition(
  type: "stop_loss" | "take_profit",
  side: "long" | "short"
): TriggerCondition {
  if (type === "stop_loss") return side === "long" ? "below" : "above";
  return side === "long" ? "above" : "below";
}
```

## Vault Integration

The `useDrift` hook integrates with `useVault` for risk enforcement:

```typescript
const openPosition = async (params) => {
  // 1. Check vault rules
  if (vaultData) {
    const validation = canTrade();
    if (!validation.allowed) {
      throw new Error(`Trade blocked: ${validation.reason}`);
    }
  }

  // 2. Execute trade
  // ...

  // 3. Record trade for daily tracking
  recordTrade(wasLoss);
};
```

## User Initialization Check

```typescript
async function isDriftUserInitialized(
  connection: Connection,
  authority: PublicKey,
  subAccountId: number
): Promise<boolean> {
  const userPDA = deriveUserPDA(authority, subAccountId);
  const accountInfo = await connection.getAccountInfo(userPDA);
  return accountInfo !== null && accountInfo.data.length > 0;
}
```

## Type Definitions

See `app/app/types/drift.ts` for:

- `DriftConfig` - Configuration options
- `DriftPositionSimplified` - Position display data
- `OpenPositionParamsSimplified` - Open position parameters
- `ClosePositionParamsSimplified` - Close position parameters
- `PlaceTriggerOrderParamsSimplified` - Trigger order parameters
- `TradeResult` - Operation result

## Key Files

| File | Purpose |
|------|---------|
| `app/app/hooks/use-drift.ts` | React hook with full trading API |
| `app/app/lib/drift-instructions.ts` | Low-level instruction builders |
| `app/app/lib/drift-verification.ts` | User initialization checks |
| `app/app/types/drift.ts` | TypeScript type definitions |

## Note on SDK Usage

This integration uses **manual instruction builders** rather than the official `@drift-labs/sdk`. This approach:

1. Reduces bundle size significantly
2. Provides explicit control over instruction encoding
3. Works with custom Solana adapter layer

For complex order types or advanced features, consider migrating to the full SDK.

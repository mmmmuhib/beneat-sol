---
purpose: Documents Flash Trade perpetuals integration for leveraged trading
related:
  - technical/integrations/overview
  - technical/integrations/pyth
  - product/features/trading
source_of_truth: false
code_files:
  - app/app/hooks/use-flashtrade.ts
  - app/app/components/perp-order-form.tsx
last_verified: 2026-01-24
---

# Flash Trade Integration

> **TL;DR:** Flash Trade provides perpetual trading infrastructure on Solana. Beneat integrates via `flash-sdk` to execute leveraged long/short positions on SOL, BTC, and ETH markets.

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| PerpetualsClient initialization | **Done** | Dynamic import to avoid Node.js modules |
| Pool config loading | **Done** | Using Crypto.1 pool on mainnet-beta |
| Open position | **Done** | Full instruction building with ALTs |
| Close position | **Done** | P&L calculation and state tracking |
| Oracle prices | **Done** | Uses Birdeye/price store with fallback |
| Slippage handling | **Done** | Configurable via UI (50-200 bps) |
| Dev mode fallback | **Done** | Mock positions for testing |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        useFlashTrade Hook                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │  Price Store │    │ flash-sdk    │    │ Trading Store│     │
│   │  (Birdeye)   │    │PerpetualsClient│   │  (Zustand)   │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│          │                   │                   │              │
│          ▼                   ▼                   ▼              │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              openPosition / closePosition            │      │
│   │  1. Get oracle price                                 │      │
│   │  2. Apply slippage                                   │      │
│   │  3. Build backup oracle instructions                 │      │
│   │  4. Build Flash Trade instructions                   │      │
│   │  5. Compile versioned transaction with ALTs          │      │
│   │  6. Sign and send via wallet                         │      │
│   │  7. Update local position state                      │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

- `app/app/hooks/use-flashtrade.ts` - Main trading hook
- `app/app/components/perp-order-form.tsx` - Trading UI
- `app/app/stores/trading-store.ts` - Position state management

## SDK Usage

### Initialization

```typescript
const sdk = await import("flash-sdk");
const poolConfig = PoolConfig.fromIdsByName("Crypto.1", "mainnet-beta");
const client = new PerpetualsClient(provider, poolConfig.programId, ...);
await client.loadAddressLookupTable(poolConfig);
```

### Opening Position

```typescript
const { instructions, additionalSigners } = await client.openPosition(
  targetSymbol,      // "SOL", "BTC", "ETH"
  collateralSymbol,  // "USDC"
  priceWithSlippage, // { price: BN, exponent: number }
  collateralWithFee, // BN in token decimals
  size,              // BN in USD (1e6 precision)
  side,              // Side.Long or Side.Short
  poolConfig,
  Privilege.None
);
```

### Closing Position

```typescript
const { instructions, additionalSigners } = await client.closePosition(
  marketSymbol,
  collateralSymbol,
  priceWithSlippage,
  side,
  poolConfig,
  Privilege.None
);
```

## Configuration

Environment variables:
- `NEXT_PUBLIC_FLASH_TRADE_CLUSTER` - "mainnet-beta" or "devnet" (default: mainnet-beta)
- `NEXT_PUBLIC_SOLANA_RPC_URL` - RPC endpoint for transactions

Constants:
- Default slippage: 100 bps (1%)
- Default priority fee: 50,000 microlamports
- Compute unit limit: 600,000
- Pool: Crypto.1

## Webpack Configuration

Flash Trade SDK uses `@coral-xyz/anchor` which includes Node.js-specific modules. The Next.js config provides fallbacks:

```typescript
// next.config.ts
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      fs: false,
      path: false,
      os: false,
      crypto: false,
    };
  }
  return config;
}
```

## Known Limitations

1. **Wallet signing bridge** - Uses `as never` casts to bridge between `@solana/react-hooks` and Anchor provider types
2. **Transaction confirmation** - Signature returned but not confirmed before UI update
3. **Position fetching** - Positions stored locally, not fetched from on-chain state

## Future Improvements

- [ ] Fetch real positions from Flash Trade program accounts
- [ ] Add transaction confirmation polling
- [ ] Implement proper wallet adapter bridge
- [ ] Add position modification (add/remove collateral)
- [ ] Support limit orders via Flash Trade's order book

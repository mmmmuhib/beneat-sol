---
purpose: React hooks for behavioral analysis, vault interaction, and trading
related:
  - development/setup
  - development/core-implementation
  - development/environment-variables
  - technical/integrations/drift
  - technical/integrations/helius
source_of_truth: true
code_files:
  - app/app/hooks/use-vault.ts
  - app/app/hooks/use-behavioral-analysis.ts
  - app/app/hooks/use-drift.ts
  - app/app/hooks/use-trading-history.ts
last_verified: 2026-01-29
---

# Frontend Integration

> **TL;DR:** React hooks for vault management, behavioral analysis, and Drift trading. Uses `@solana/react-hooks` for wallet connection and Codama-generated clients for type-safe vault instructions.

## Tech Stack Overview

| Package | Purpose |
|---------|---------|
| `@solana/react-hooks` | Wallet connection, signing, RPC access |
| `@solana/kit` | Client utilities, address encoding, PDAs |
| `@solana/client` | RPC client for Solana |
| `zustand` | State management (stores) |
| Generated client (`app/generated/vault/`) | Type-safe vault instructions |

## Core Hooks

### useVault

Primary hook for vault state and operations.

```typescript
import { useVault } from "@/hooks";

function VaultControls() {
  const {
    // State
    vault,              // Vault account data
    vaultAddress,       // Vault PDA
    isLoading,
    error,
    isLocked,           // Whether vault is currently locked
    lockoutRemaining,   // Seconds until unlock
    balance,            // Vault balance (lamports)
    isInCooldown,       // Post-loss cooldown active
    cooldownRemaining,  // Seconds until cooldown ends

    // Rule settings
    dailyLossLimit,
    maxTradesPerDay,
    tradesToday,

    // Actions
    initializeVault,
    deposit,
    withdraw,
    setRules,
    manualLock,
    unlock,
    executeSwap,
    refresh,

    // Trading validation
    canTrade,           // () => { allowed: boolean, reason?: string }
    recordTrade,        // (wasLoss: boolean) => void
  } = useVault();

  const handleDeposit = async () => {
    const sig = await deposit(1_000_000_000n); // 1 SOL
    if (sig) console.log("Deposited:", sig);
  };

  const validation = canTrade();
  if (!validation.allowed) {
    return <p>Trading blocked: {validation.reason}</p>;
  }

  return <button onClick={handleDeposit}>Deposit 1 SOL</button>;
}
```

### useBehavioralAnalysis

Analyzes trading patterns and calculates risk scores.

```typescript
import { useBehavioralAnalysis } from "@/hooks";

function RiskIndicator({ walletAddress }) {
  const {
    riskLevel,          // "low" | "medium" | "high" | "critical"
    riskScore,          // 0-100
    activePatterns,     // ["revenge_trading", "overtrading", ...]
    primaryPattern,     // Most significant pattern
    patternDescription, // Human-readable description
    suggestedCooldown,  // Recommended cooldown in seconds
    canProceed,         // Whether trading is advised
    emotionScore,       // 0-100 (higher = more emotional)
    disciplineScore,    // 0-100 (higher = more disciplined)
  } = useBehavioralAnalysis(walletAddress);

  const colors = {
    low: "green",
    medium: "yellow",
    high: "orange",
    critical: "red",
  };

  return (
    <div style={{ color: colors[riskLevel] }}>
      Risk Score: {riskScore}/100
      {!canProceed && <p>Suggestion: Wait {suggestedCooldown}s</p>}
    </div>
  );
}
```

**Pattern Types Detected:**
- `revenge_trading` — Trading shortly after a loss
- `overtrading` — Approaching daily trade limit
- `losing_streak` — Multiple consecutive losses
- `bad_hours` — Trading during risky hours (11pm-5am)
- `tilt_sizing` — Increased position sizes after losses

### useTradingHistory

Fetches transaction history from Helius for pattern detection.

```typescript
import { useTradingHistory } from "@/hooks";

function TradeStats({ walletAddress }) {
  const {
    recentSwaps,         // Parsed swap transactions
    tradesInLastHour,    // Count for overtrading detection
    tradesInLast24Hours, // Daily trade count
    timeSinceLastTrade,  // Seconds since last trade
    isLoading,
    error,
    refresh,
  } = useTradingHistory(walletAddress);

  return (
    <div>
      <p>Trades today: {tradesInLast24Hours}</p>
      <p>Last trade: {timeSinceLastTrade}s ago</p>
    </div>
  );
}
```

### useDrift

Drift Protocol integration for perpetual trading.

```typescript
import { useDrift } from "@/hooks";

function TradingPanel() {
  const {
    // State
    isInitialized,      // Whether Drift user account exists
    isLoading,
    error,
    positions,          // Current open positions

    // Actions
    initializeUser,     // Create Drift user account
    deposit,            // Deposit USDC to Drift
    withdraw,           // Withdraw USDC from Drift
    openPosition,       // Open perp position
    closePosition,      // Close perp position
    placeTriggerOrder,  // Set stop loss / take profit
    cancelOrder,        // Cancel pending order
  } = useDrift();

  const handleOpenLong = async () => {
    const result = await openPosition({
      marketIndex: 0,     // SOL-PERP
      direction: "long",
      baseAssetAmount: 1_000_000_000n, // 1 SOL
      orderType: "market",
    });

    if (result.success) {
      console.log("Position opened:", result.signature);
    }
  };

  return <button onClick={handleOpenLong}>Long 1 SOL</button>;
}
```

## State Management (Zustand Stores)

### Behavioral Store

```typescript
import { useBehavioralStore } from "@/stores";

function CooldownManager() {
  const {
    addTrade,              // Record a trade
    triggerCooldown,       // Manually trigger cooldown
    overrideCooldown,      // Skip cooldown (tracked)
    getCooldownRemaining,  // Seconds remaining
    getOverrideCount,      // Count overrides in period
  } = useBehavioralStore();

  // Record a losing trade
  addTrade({ wasLoss: true });

  // Check cooldown
  const remaining = getCooldownRemaining();
  if (remaining > 0) {
    console.log(`Cooldown active: ${remaining}s remaining`);
  }
}
```

### Trading Store

```typescript
import { useTradingStore } from "@/stores";

function PositionsDisplay() {
  const {
    positions,        // Open positions
    orders,          // Pending orders
    addPosition,
    updatePosition,
    removePosition,
  } = useTradingStore();

  return (
    <ul>
      {positions.map(pos => (
        <li key={pos.id}>{pos.marketIndex}: {pos.size}</li>
      ))}
    </ul>
  );
}
```

### Webhook Store

```typescript
import { useWebhookStore } from "@/stores";

function EventLog() {
  const {
    events,          // Recent webhook events
    addEvent,        // Add new event
    clearEvents,
    getEventsByType,
  } = useWebhookStore();

  const lockouts = getEventsByType("LOCKOUT_TRIGGERED");

  return (
    <div>
      <p>Lockout events: {lockouts.length}</p>
    </div>
  );
}
```

## Provider Setup

The app uses a multi-provider stack defined in `app/components/providers.tsx`:

```typescript
// app/components/providers.tsx
"use client";

import { SolanaProvider } from "./solana-provider";
import { PriceStreamProvider } from "./price-stream-provider";
import { PropsWithChildren } from "react";

export function Providers({ children }: PropsWithChildren) {
  return (
    <SolanaProvider>
      <PriceStreamProvider>
        {children}
      </PriceStreamProvider>
    </SolanaProvider>
  );
}
```

The SolanaProvider handles wallet connection:

```typescript
// app/components/solana-provider.tsx
"use client";

import { WalletProvider, useWalletConnection } from "@solana/react-hooks";

const config = {
  endpoint: process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com",
};

export function SolanaProvider({ children }) {
  return (
    <WalletProvider config={config}>
      {children}
    </WalletProvider>
  );
}
```

## Using Wallet Hooks

```typescript
import {
  useWalletConnection,
  useSendTransaction,
  useBalance,
} from "@solana/react-hooks";

function WalletStatus() {
  const { wallet, status, connect, disconnect } = useWalletConnection();
  const { send, isSending } = useSendTransaction();
  const balance = useBalance(wallet?.account?.address);

  if (status !== "connected") {
    return (
      <button onClick={connect} disabled={status === "connecting"}>
        {status === "connecting" ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  return (
    <div>
      <p>Connected: {wallet.account.address.slice(0, 8)}...</p>
      <p>Balance: {balance ? (Number(balance) / 1e9).toFixed(4) : "..."} SOL</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

## Dev Mode

Many hooks support dev mode for testing without real transactions:

```typescript
import { useDevMode } from "@/hooks";

function DevToggle() {
  const { isDevMode, toggleDevMode } = useDevMode();

  return (
    <label>
      <input
        type="checkbox"
        checked={isDevMode}
        onChange={toggleDevMode}
      />
      Dev Mode (simulated transactions)
    </label>
  );
}
```

When dev mode is enabled:
- Vault operations return mock data
- Drift trades are simulated
- Light Protocol operations use delays instead of real ZK proofs
- Jito bundles skip actual submission

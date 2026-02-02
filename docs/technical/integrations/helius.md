---
purpose: Helius API integration for priority fees, transaction history, and webhooks
related:
  - technical/integrations/light-protocol
  - technical/integrations/jito
  - product/features/wallet-behavior-analysis
source_of_truth: true
code_files:
  - app/app/lib/helius.ts
  - app/app/lib/helius-webhooks.ts
  - app/app/api/webhooks/helius/route.ts
  - app/app/api/webhooks/helius/sse.ts
  - app/app/api/webhooks/helius/events/route.ts
  - app/app/hooks/use-helius-events.ts
  - app/app/hooks/use-trading-history.ts
last_verified: 2026-01-29
---

# Helius Integration

## Overview

Beneat uses Helius APIs for three core features:

1. **Priority Fee Estimation** — Dynamic fee calculation for Jito bundles
2. **Transaction History** — Parsed swap history for behavioral analysis
3. **Webhooks** — Real-time vault event monitoring with SSE push

## Configuration

Required environment variables:

```bash
# Required
NEXT_PUBLIC_HELIUS_API_KEY=your_api_key

# Webhook security (choose one)
HELIUS_WEBHOOK_SECRET=your_hmac_secret    # Recommended: HMAC signature verification
HELIUS_WEBHOOK_AUTH_TOKEN=your_bearer_token  # Fallback: Bearer token auth
```

## Priority Fee API

Used in `lib/jito-bundle.ts` to replace hardcoded priority fees:

```typescript
import { getPriorityFeeEstimate } from "./helius";

const estimate = await getPriorityFeeEstimate({
  accountKeys: ["program-id", "user-account"],
  includeAllPriorityFeeLevels: true,
});

// Returns: { priorityFeeEstimate: 15000, priorityFeeLevels: { low, medium, high, ... } }
```

The `estimateBundleTip()` function in `jito-bundle.ts` now:
1. Tries Helius Priority Fee API first (more accurate, accounts for current network conditions)
2. Falls back to `connection.getRecentPrioritizationFees()` if Helius unavailable
3. Uses static base tips as final fallback

### Circuit Breaker

The Helius client includes a circuit breaker to prevent cascade failures:

```typescript
import { getCircuitState, resetCircuit } from "./helius";

// Check circuit state: "CLOSED" | "OPEN" | "HALF_OPEN"
console.log(getCircuitState());

// Manually reset if needed
resetCircuit();
```

**Behavior:**
- Opens after 3 consecutive failures
- Opens immediately on HTTP 429 (rate limit)
- Auto-recovers after 60 seconds (30s for rate limits)
- Skips network calls when open, returning fallback values

## Transaction History API

Used in `hooks/use-trading-history.ts` for behavioral pattern detection:

```typescript
import { getTransactionHistory } from "./helius";

const swaps = await getTransactionHistory({
  address: walletAddress,
  type: "SWAP",
  limit: 50,
});

// Returns parsed transactions with swap details
```

The `useTradingHistory` hook provides:
- `recentSwaps` — Array of parsed swap transactions
- `tradesInLastHour` — Count for overtrading detection
- `tradesInLast24Hours` — Daily trade count
- `timeSinceLastTrade` — For revenge trading detection

This data feeds into `useBehavioralAnalysis()` for enhanced pattern detection.

## Webhooks

### Setup

1. Deploy your app to get a public URL
2. Create webhook via Helius dashboard or programmatically:

```typescript
import { createVaultWebhook } from "./helius-webhooks";

const webhook = await createVaultWebhook({
  vaultAddress: "your-vault-pda",
  webhookUrl: "https://your-app.com/api/webhooks/helius",
  authToken: "your-secret-token",
});
```

### Webhook Security

The webhook endpoint supports two authentication methods:

#### 1. HMAC Signature Verification (Recommended)

Set `HELIUS_WEBHOOK_SECRET` to enable cryptographic verification:

```typescript
// Helius sends: helius-signature header with HMAC-SHA256
// Server verifies using timing-safe comparison
```

Benefits:
- Proves webhook came from Helius servers
- Prevents webhook forgery attacks
- Includes timestamp validation to prevent replay attacks (5-minute window)

#### 2. Bearer Token (Fallback)

Set `HELIUS_WEBHOOK_AUTH_TOKEN` for simpler auth:

```typescript
// Request must include: Authorization: Bearer <token>
```

### Webhook Endpoint

The `/api/webhooks/helius` route receives events and parses them into vault events:

- `LOCKOUT_TRIGGERED` — Vault locked due to risk limits
- `LOCKOUT_CLEARED` — Vault unlocked
- `DEPOSIT` / `WITHDRAWAL` — Balance changes
- `TRADE` — Swap executed

### Real-Time Updates via SSE

Webhook events are pushed to connected browsers via Server-Sent Events:

```typescript
// In your component:
import { useHeliusEvents } from "@/hooks";

function VaultMonitor({ vaultAddress }) {
  useHeliusEvents({
    vaultAddress,
    onEvent: (event) => {
      console.log("Real-time event:", event);
    },
  });

  // Events automatically update useWebhookStore
}
```

SSE endpoint: `GET /api/webhooks/helius/events?vault=<address>`

Features:
- Auto-reconnect with exponential backoff
- 30-second keepalive heartbeats
- Zustand store integration

### Privacy Considerations

Webhooks only monitor the vault PDA, not individual user accounts. This means:

- ✅ Lockout status is visible (intentionally public)
- ✅ Deposit/withdrawal timing visible
- ❌ Actual P&L amounts remain private (compressed via Light Protocol)

## Files Reference

| File | Purpose |
|------|---------|
| `lib/helius.ts` | Core API client (priority fees, transaction history, circuit breaker) |
| `lib/helius-webhooks.ts` | Webhook CRUD operations |
| `hooks/use-trading-history.ts` | React hook for transaction history |
| `hooks/use-helius-events.ts` | React hook for SSE event subscription |
| `stores/webhook-store.ts` | Zustand store for webhook events |
| `api/webhooks/helius/route.ts` | Webhook receiver endpoint with signature verification |
| `api/webhooks/helius/sse.ts` | SSE broadcast module |
| `api/webhooks/helius/events/route.ts` | SSE connection endpoint |
| `types/helius-webhook.ts` | TypeScript types for webhook payloads |

## Rate Limits & Resilience

Helius API rate limits depend on your plan:
- Free tier: 100 requests/second
- Paid tiers: Higher limits available

**Resilience Features:**
1. Circuit breaker prevents hammering during outages
2. Graceful fallback to alternative data sources
3. Rate limit detection (HTTP 429) with automatic backoff
4. SSE reconnection with exponential backoff

## Testing

```bash
# Run Helius-specific tests
cd app
npm test -- --grep "Helius"

# Test files:
# - __tests__/helius/helius-client.test.ts
# - __tests__/helius/helius-webhooks.test.ts
# - __tests__/helius/helius-webhook-route.test.ts
# - __tests__/integration/helius-integration.test.ts
```

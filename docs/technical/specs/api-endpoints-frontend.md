---
purpose: Documents API routes exposed by the Next.js frontend
related:
  - technical/specs/overview
  - technical/integrations/helius
  - product/features/wallet-behavior-analysis
source_of_truth: true
code_files:
  - app/app/api/webhooks/helius/route.ts
  - app/app/api/webhooks/helius/events/route.ts
  - app/app/api/webhooks/helius/sse.ts
last_verified: 2026-01-29
---

# API Endpoints

> **TL;DR:** The frontend exposes webhook endpoints for Helius event ingestion and SSE streaming. Most functionality (wallet analysis, vault operations, trading) is handled client-side via React hooks and direct RPC calls.

## Webhook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/helius` | POST | Receives Helius webhook events for vault monitoring |
| `/api/webhooks/helius/events` | GET | SSE endpoint for real-time event streaming to clients |

### POST `/api/webhooks/helius`

Receives webhook events from Helius and broadcasts them to connected SSE clients.

**Authentication:** Supports two methods:
1. HMAC signature verification via `helius-signature` header (recommended)
2. Bearer token via `Authorization` header (fallback)

**Request Body:**
```json
[
  {
    "type": "TRANSFER",
    "signature": "5xYz...",
    "slot": 123456789,
    "timestamp": 1706500000,
    "nativeTransfers": [...],
    "tokenTransfers": [...],
    "accountData": [...]
  }
]
```

**Response:**
- `200 OK` — Event processed successfully
- `401 Unauthorized` — Invalid or missing authentication
- `400 Bad Request` — Invalid payload format

**Parsed Event Types:**
| Event | Description |
|-------|-------------|
| `LOCKOUT_TRIGGERED` | Vault locked due to risk limits |
| `LOCKOUT_CLEARED` | Vault unlocked |
| `DEPOSIT` | Funds deposited to vault |
| `WITHDRAWAL` | Funds withdrawn from vault |
| `TRADE` | Swap executed through vault |

### GET `/api/webhooks/helius/events`

Server-Sent Events endpoint for real-time vault event streaming.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `vault` | string | Vault address to subscribe to |

**Response:** SSE stream with events in format:
```
data: {"type":"DEPOSIT","signature":"5xYz...","timestamp":1706500000,"amount":1000000}

data: {"type":"LOCKOUT_TRIGGERED","signature":"6aB...","timestamp":1706500100}
```

**Features:**
- Auto-reconnect with exponential backoff (client-side)
- 30-second keepalive heartbeats
- Zustand store integration via `useHeliusEvents` hook

## Client-Side Operations

Most functionality is handled client-side without API routes:

| Operation | Implementation | Notes |
|-----------|----------------|-------|
| Wallet analysis | `use-behavioral-analysis.ts` + `lib/helius.ts` | Direct Helius API calls |
| Vault state | `use-vault.ts` + generated client | Direct RPC to Solana |
| Trading | `use-drift.ts` + `lib/drift-instructions.ts` | Direct Drift program calls |
| P&L privacy | `use-light-protocol.ts` | Direct Light Protocol SDK |
| Trigger orders | `use-ghost-crank.ts` + `use-magicblock.ts` | MagicBlock ER + Drift |

## Environment Variables

Required for webhook functionality:

```bash
# Helius API (required)
NEXT_PUBLIC_HELIUS_API_KEY=your_api_key

# Webhook security (one required)
HELIUS_WEBHOOK_SECRET=your_hmac_secret    # Recommended
HELIUS_WEBHOOK_AUTH_TOKEN=your_bearer_token  # Fallback
```

## Usage Example

```typescript
// Subscribe to vault events in a component
import { useHeliusEvents } from "@/hooks";

function VaultMonitor({ vaultAddress }) {
  useHeliusEvents({
    vaultAddress,
    onEvent: (event) => {
      if (event.type === "LOCKOUT_TRIGGERED") {
        showNotification("Vault locked!");
      }
    },
  });

  return <div>Monitoring vault...</div>;
}
```

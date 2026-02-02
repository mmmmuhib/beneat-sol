---
purpose: Index page for external integration documentation
related:
  - technical/integrations/overview
  - technical/integrations/drift
  - technical/integrations/jito
  - technical/integrations/magicblock
  - technical/integrations/light-protocol
  - technical/integrations/helius
  - technical/integrations/pyth
  - technical/integrations/jupiter
source_of_truth: true
code_files: []
last_verified: 2026-01-29
---

# Integrations

> **TL;DR:** Documentation for external integrations powering Beneat's trading and privacy features.

## Trading Infrastructure

| Integration | Status | Purpose |
|-------------|--------|---------|
| [[technical/integrations/drift]] | **Implemented** | Perpetual trading via instruction builders |
| [[technical/integrations/jito]] | **Implemented** | MEV-protected bundle submission |
| [[technical/integrations/jupiter]] | Planned | DEX aggregation for spot swaps |

## Privacy Layer

| Integration | Status | Purpose |
|-------------|--------|---------|
| [[technical/integrations/magicblock]] | **Implemented** | Ephemeral Rollups + Ghost Orders |
| [[technical/integrations/light-protocol]] | **Implemented** | ZK-compressed private P&L storage |

## Data Infrastructure

| Integration | Status | Purpose |
|-------------|--------|---------|
| [[technical/integrations/helius]] | **Implemented** | RPC, priority fees, webhooks, transaction history |
| [[technical/integrations/pyth]] | **Implemented** | Oracle price feeds for trigger orders |

## Program-Level Integrations

| Program | Status | Purpose |
|---------|--------|---------|
| Ghost Crank | **Implemented** | On-chain ghost order management and execution |
| Ghost Bridge | **Implemented** | Encrypted order storage and TEE execution |

## Implementation Files

### Drift
- `app/hooks/use-drift.ts` — React hook with full trading API
- `app/lib/drift-instructions.ts` — Low-level instruction builders
- `app/lib/drift-verification.ts` — User initialization checks
- `app/types/drift.ts` — TypeScript type definitions

### Jito
- `app/lib/jito-bundle.ts` — Bundle submission with retry and tip escalation

### MagicBlock
- `app/hooks/use-magicblock.ts` — ER session management (~1100 LOC)
- `app/hooks/use-private-ghost-orders.ts` — Private ghost order interface
- `anchor/programs/ghost-bridge/` — On-chain encrypted order program

### Light Protocol
- `app/hooks/use-light-protocol.ts` — ZK compression operations
- `app/hooks/use-shield.ts` — Shielded trading orchestration
- `app/lib/light-instructions.ts` — SDK-based instruction builders
- `app/lib/light-wallet-adapter.ts` — Wallet → Signer bridge

### Helius
- `app/lib/helius.ts` — Core API client with circuit breaker
- `app/lib/helius-webhooks.ts` — Webhook CRUD
- `app/hooks/use-helius-events.ts` — SSE subscription
- `app/hooks/use-trading-history.ts` — Transaction history
- `app/api/webhooks/helius/` — Webhook receiver and SSE endpoints

### Pyth
- `app/lib/pyth-benchmarks.ts` — Historical price data fetching
- Oracle addresses in `app/lib/drift-instructions.ts:768-831`

### TEE Encryption
- `app/lib/tee-encryption.ts` — ECIES encryption for order parameters
- `app/lib/tee-monitoring-service.ts` — TEE-side order monitoring

## Legacy / Deprecated

- [[technical/integrations/flash-trade]] — Flash Trade integration (superseded by Drift)

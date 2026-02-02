---
purpose: Overview of all external integrations including Jupiter, Light Protocol, Pyth, and Helius
related:
  - technical/integrations/jupiter
  - technical/integrations/pyth
  - technical/integrations/helius
  - technical/integrations/light-protocol
  - technical/architecture/system-diagram
source_of_truth: false
code_files:
  - programs/beneat/src/utils/jupiter.rs
  - programs/beneat/src/utils/pyth.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** Four external integrations: Jupiter CPI for multi-DEX swaps, Light Protocol SDK for private state, Pyth on-chain feeds for P&L, and Helius REST API for wallet history.

## Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                         │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│                    JUPITER                             │
├───────────────────────────────────────────────────────┤
│ Integration: CPI (Cross-Program Invocation)           │
│ Purpose: Execute swaps across all Solana DEXs         │
│                                                        │
│ We use:                                                │
│ • jupiter_cpi::route_swap()                           │
│ • Route data from Jupiter API                          │
│ • Slippage protection                                  │
│                                                        │
│ Benefits:                                              │
│ • Best price across 20+ DEXs                          │
│ • Any token pair supported                             │
│ • Battle-tested, audited                               │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│                  LIGHT PROTOCOL                        │
├───────────────────────────────────────────────────────┤
│ Integration: SDK + Compressed Accounts                │
│ Purpose: Private state storage                         │
│                                                        │
│ We use:                                                │
│ • @lightprotocol/stateless.js                         │
│ • Compressed account creation                          │
│ • Encrypted data storage                               │
│                                                        │
│ Benefits:                                              │
│ • ZK-verified privacy                                  │
│ • Low cost (compressed)                                │
│ • Solana-native                                        │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│                  PYTH ORACLE                           │
├───────────────────────────────────────────────────────┤
│ Integration: On-chain price feeds                      │
│ Purpose: Calculate portfolio value for P&L            │
│                                                        │
│ We use:                                                │
│ • pyth_solana_receiver_sdk                            │
│ • SOL/USD, popular token feeds                         │
│ • Real-time price updates                              │
│                                                        │
│ Benefits:                                              │
│ • High-frequency updates                               │
│ • Trusted price source                                 │
│ • Wide token coverage                                  │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│                   HELIUS API                           │
├───────────────────────────────────────────────────────┤
│ Integration: REST API (off-chain)                      │
│ Purpose: Wallet history analysis                       │
│                                                        │
│ We use:                                                │
│ • /v0/addresses/{address}/transactions                │
│ • Parsed DeFi transactions                             │
│ • Jupiter/Raydium swap detection                       │
│                                                        │
│ Benefits:                                              │
│ • Fast transaction parsing                             │
│ • DeFi-specific enrichment                             │
│ • Compression support (RPC)                            │
└───────────────────────────────────────────────────────┘
```

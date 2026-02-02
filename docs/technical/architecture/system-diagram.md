---
purpose: Visual system diagram showing frontend, blockchain, and external integrations
related:
  - technical/architecture/overview
  - technical/architecture/account-structure
  - technical/integrations/overview
source_of_truth: false
code_files:
  - programs/beneat/src/lib.rs
  - programs/beneat/src/instructions/swap.rs
last_verified: 2026-01-22
---

# Beneat Solana - Technical Architecture

> **TL;DR:** Full system diagram showing data flow from user wallet through Next.js frontend to Solana blockchain, integrating with Jupiter, Pyth, Light Protocol, and Helius.

## System Diagram

```
                                    USER
                                      │
                                      │ Connect Wallet
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Wallet     │  │   Analysis   │  │    Vault     │  │   Trading    │    │
│  │  Analysis    │  │  Dashboard   │  │  Management  │  │  Interface   │    │
│  │              │  │              │  │              │  │              │    │
│  │ • Fetch txs  │  │ • Patterns   │  │ • Deposit    │  │ • Swap UI    │    │
│  │ • Detect     │  │ • Rules      │  │ • Withdraw   │  │ • P&L view   │    │
│  │   patterns   │  │ • Savings    │  │ • Lock/Unlock│  │ • Status     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
        │                                       │
        │ Helius API                            │ Solana Transactions
        ▼                                       ▼
┌───────────────────┐              ┌─────────────────────────────────────────┐
│    HELIUS API     │              │            SOLANA BLOCKCHAIN            │
│                   │              │                                         │
│ • Transaction     │              │  ┌───────────────────────────────────┐  │
│   history         │              │  │      BENEAT VAULT PROGRAM         │  │
│ • Swap parsing    │              │  │           (Anchor)                │  │
│ • DeFi activity   │              │  │                                   │  │
└───────────────────┘              │  │  ┌─────────────┐ ┌─────────────┐  │  │
                                   │  │  │   PUBLIC    │ │   PRIVATE   │  │  │
                                   │  │  │   STATE     │ │   STATE     │  │  │
                                   │  │  │             │ │ (Light)     │  │  │
                                   │  │  │ • is_locked │ │             │  │  │
                                   │  │  │ • lockout_  │ │ • pnl       │  │  │
                                   │  │  │   until     │ │ • limits    │  │  │
                                   │  │  │ • count     │ │ • reason    │  │  │
                                   │  │  └─────────────┘ └─────────────┘  │  │
                                   │  │                                   │  │
                                   │  │  Instructions:                    │  │
                                   │  │  • initialize    • swap           │  │
                                   │  │  • deposit       • lock           │  │
                                   │  │  • withdraw      • unlock         │  │
                                   │  │  • set_rules                      │  │
                                   │  └───────────────────────────────────┘  │
                                   │              │                          │
                                   │              │ CPI                      │
                                   │              ▼                          │
                                   │  ┌───────────────────────────────────┐  │
                                   │  │        JUPITER AGGREGATOR         │  │
                                   │  │                                   │  │
                                   │  │  • Route optimization             │  │
                                   │  │  • Multi-DEX aggregation          │  │
                                   │  │  • Best price execution           │  │
                                   │  └───────────────────────────────────┘  │
                                   │              │                          │
                                   │              ▼                          │
                                   │  ┌───────────────────────────────────┐  │
                                   │  │      UNDERLYING DEXs              │  │
                                   │  │                                   │  │
                                   │  │  Raydium │ Orca │ Meteora │ etc  │  │
                                   │  └───────────────────────────────────┘  │
                                   │                                         │
                                   │  ┌───────────────────────────────────┐  │
                                   │  │        PYTH ORACLE                │  │
                                   │  │                                   │  │
                                   │  │  • Real-time price feeds          │  │
                                   │  │  • P&L calculation                │  │
                                   │  └───────────────────────────────────┘  │
                                   │                                         │
                                   │  ┌───────────────────────────────────┐  │
                                   │  │       LIGHT PROTOCOL              │  │
                                   │  │                                   │  │
                                   │  │  • ZK compression                 │  │
                                   │  │  • Private state storage          │  │
                                   │  │  • Encrypted accounts             │  │
                                   │  └───────────────────────────────────┘  │
                                   │                                         │
                                   └─────────────────────────────────────────┘
```

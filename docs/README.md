---
purpose: Main documentation entry point and project overview
related:
  - product/index
  - technical/index
  - development/index
  - product/hackathon/submission-checklist
source_of_truth: true
code_files: []
last_verified: 2026-02-01
---

# Beneat Solana - Privacy Hackathon 2026

> **TL;DR:** Three-program Solana protocol combining TEE ghost orders, ZK balance privacy, and on-chain risk enforcement. All programs deployed to devnet.

> Set your risk rules when calm. The blockchain enforces them when you're not.

---

## Deployed Programs (Devnet) ✅

| Program | Program ID | Size | Description |
|---------|------------|------|-------------|
| **vault** | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | 391 KB | Risk enforcement vault with trader profiles |
| **ghost-crank** | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | 413 KB | Ghost order execution crank |
| **ghost-bridge** | `8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA` | 532 KB | TEE-encrypted order bridge |

**Last deployed:** February 1, 2026 | **Authority:** `CPFuniXKyetNdzu5u15snqF3DqMVLFVggRcjDY4cmnSe`

Verify deployments:
```bash
solana program show GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki --url devnet
solana program show 7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv --url devnet
solana program show 8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA --url devnet
```

---

## Overview

Beneat is a **"Parasitic Dark Pool"** layer on Solana that wraps Drift Protocol's perpetual futures with:

| Feature | Technology | What It Does |
|---------|------------|--------------|
| **Hidden Orders** | MagicBlock TEE | Orders encrypted until execution—no front-running |
| **Private P&L** | Light Protocol ZK | Balances compressed with zero-knowledge proofs |
| **Risk Enforcement** | Anchor Vault | On-chain rules that lock you out when limits breached |
| **Trader Cards** | Helius Indexer | FIFA-style stats card showing your patterns |

## Key Features

### Trader Spec Cards (FIFA Ultimate Team Style)
```
┌─────────────────────┐
│       72            │
│      RARE           │
│                     │
│   DIS │ PAT │ CON   │
│   45  │ 32  │ 78    │
│   TIM │ RSK │ END   │
│   81  │ 67  │ 89    │
│                     │
│ Weakness: PATIENCE  │
│ "Revenge trades 73%"│
└─────────────────────┘
```
- 6 trading stats calculated from on-chain history
- Card rarity based on discipline level (Bronze → Legendary)
- Shareable cards for viral social media potential

### Ghost Orders (Private Trigger Orders)
- Orders encrypted in MagicBlock TEE until trigger conditions met
- No front-running possible—bots can't see your stops
- Supports stop-loss, take-profit, limit orders
- Executes atomically via Jito bundles

### Auto-Lockout System
- **Daily loss limits** — Vault locks when exceeded
- **Trade frequency limits** — Prevents overtrading
- **Cooldown periods** — Post-loss waiting period
- **Manual lock** — Self-imposed lockout

## The Privacy Angle

| Public (On-Chain) | Private (Encrypted) |
|-------------------|---------------------|
| Wallet is locked | Why they locked |
| Unlock time | Actual P&L |
| Lockout count | Personal rules |
| Uses Beneat | Trading history |

## Documentation Map

### Entry Points
- **Product:** [product/index.md](./product/index.md) - Features, requirements, roadmap
- **Technical:** [technical/index.md](./technical/index.md) - Architecture, integrations, privacy
- **Development:** [development/index.md](./development/index.md) - Setup, build, testing
- **Hackathon:** [product/hackathon/submission-checklist.md](./product/hackathon/submission-checklist.md) - Submission checklist

### Key Documents

| Document | Description |
|----------|-------------|
| [product/PRD.md](./product/PRD.md) | Full product requirements document |
| [technical/architecture/overview.md](./technical/architecture/overview.md) | Complete 3-program architecture |
| [development/implementation-status.md](./development/implementation-status.md) | What's built and what's pending |
| [development/build-and-deploy.md](./development/build-and-deploy.md) | Build and deployment guide |
| [INDEX.json](./INDEX.json) | Machine-readable doc index |

### Editor + Automation

- **Marksman:** Project config in [.marksman.toml](./.marksman.toml)
- **Wiki-links:** `[[technical/architecture/overview]]` supports completion + go-to-definition
- **Regenerate INDEX:** `node docs/scripts/generate-docs-idx.js`

## Target Bounties

| Bounty | Prize Pool | Status |
|--------|-----------|--------|
| **Main Track (Light Protocol)** | $18,000 | ✅ ZK compression implemented |
| **MagicBlock** | TBD | ✅ TEE ghost orders deployed |
| **Radr Labs (ShadowWire)** | $15,000 | ✅ Intent privacy implemented |

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 15.5.9 |
| **Smart Contracts** | Anchor (Rust) | 0.32.1 |
| **Solana SDK** | @solana/kit + @solana/react-hooks | 5.1.0 / 1.1.5 |
| **Privacy** | Light Protocol (ZK Compression) | 0.22.0 |
| **TEE Rollups** | MagicBlock Ephemeral Rollups | 0.6.5 |
| **Perp DEX** | Drift Protocol SDK | 2.100.0 |
| **MEV Protection** | Jito Bundles | Latest |
| **Indexer** | Helius API | Latest |
| **Styling** | Tailwind CSS | 4.x |

> **Note:** Using `@solana/kit` (Solana Kit) - the modern Solana Foundation recommended approach.

## Quick Links

- [Solana Privacy Hackathon](https://solana.com/privacyhack)
- [Light Protocol Docs](https://www.zkcompression.com/)
- [MagicBlock Docs](https://docs.magicblock.gg/)
- [Drift Protocol](https://drift.trade/)
- [Helius API](https://docs.helius.dev/)

## The Pitch

> "70% of crypto traders lose money—not from bad analysis, but from bad behavior. Beneat is a Parasitic Dark Pool on Drift Protocol that combines TEE privacy, ZK balance compression, and on-chain risk enforcement. Your trades are hidden from bots until execution, your P&L is private, but your discipline is verifiable. We solve the Trader's Trilemma: privacy, liquidity, and discipline—all three."

---

**Team:** Beneat  
**Hackathon:** Solana Privacy Hackathon 2026  
**Status:** ✅ Ready for Submission  
**Last Updated:** February 1, 2026

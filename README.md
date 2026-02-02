# Beneat Solana

> Privacy-first perpetual trading with on-chain risk enforcement

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Devnet-blueviolet)](https://solana.com)
[![Light Protocol](https://img.shields.io/badge/Privacy-Light%20Protocol-green)](https://www.zkcompression.com/)

**Set your risk rules when calm. The blockchain enforces them when you're not.**

## The Problem

70% of crypto traders lose money—not from bad analysis, but from bad behavior. Revenge trading, overtrading, and emotional decisions destroy portfolios. Meanwhile, on-chain transparency means bots front-run your orders and competitors track your P&L.

**Beneat solves both problems.**

## What We Built

Beneat is a **"Parasitic Dark Pool"** layer on Solana that wraps Drift Protocol's perpetual futures with:

| Feature | Technology | What It Does |
|---------|------------|--------------|
| **Hidden Orders** | MagicBlock TEE | Orders encrypted until execution—no front-running |
| **Private P&L** | Light Protocol ZK | Balances compressed with zero-knowledge proofs |
| **Risk Enforcement** | Anchor Vault | On-chain rules that lock you out when limits breached |
| **Behavioral Analysis** | Helius Indexer | FIFA-style "Trader Card" reveals your patterns |

### The Privacy Angle

| Public (On-Chain) | Private (Encrypted) |
|-------------------|---------------------|
| Wallet is locked | Why they locked |
| Unlock time | Actual P&L |
| Lockout count | Personal rules |
| Uses Beneat | Trading history |

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.89.0 (required for Anchor 0.32.1)
- Solana CLI 2.0+
- A Solana wallet with devnet SOL

### Installation

**Quick Start (Hackathon Judges):**
```bash
git clone https://github.com/beneat-solana/beneat-solana-hackathon.git
cd beneat-solana-hackathon/app
npm install
cp .env.local.demo .env.local    # Pre-configured for demo
npm run dev                       # Open http://localhost:3000
```

**Full Setup:**
```bash
# Clone the repository
git clone https://github.com/beneat-solana/beneat-solana-hackathon.git
cd beneat-solana-hackathon

# Install frontend dependencies
cd app
npm install

# Set up environment (choose one):
cp .env.local.demo .env.local    # Quick demo mode
# OR
cp .env.example .env.local       # Full configuration (edit with your keys)
```

### Environment Variables

**For quick demo**, use `.env.local.demo` which includes all required configs.

**For full features**, create `app/.env.local` with:

```env
# Solana (required)
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# Helius API (optional - enhances transaction history)
# Get free key at: https://www.helius.dev/
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key

# MagicBlock (for TEE execution)
MAGICBLOCK_ER_RPC=https://devnet.magicblock.app
```

> **Note:** Without a Helius API key, the app runs in "Demo Mode" with simulated behavioral data. Core vault and trading features still work.

### Run the App

```bash
cd app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     BENEAT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: BEHAVIORAL ANALYSIS                               │
│           └── Pattern detection, risk scoring               │
│                                                             │
│  Layer 4: VAULT (Anchor Program)                            │
│           └── On-chain rule enforcement, lockouts           │
│                                                             │
│  Layer 3: LIGHT PROTOCOL (ZK Compression)                   │
│           └── Balance/P&L privacy via zero-knowledge        │
│                                                             │
│  Layer 2: JITO (Bundle Engine)                              │
│           └── MEV protection, atomic execution              │
│                                                             │
│  Layer 1: MAGICBLOCK (TEE Ephemeral Rollups)                │
│           └── Order privacy, conditional triggers           │
│                                                             │
│  Layer 0: DRIFT PROTOCOL                                    │
│           └── Liquidity, perpetual futures engine           │
└─────────────────────────────────────────────────────────────┘
```

## Deployed Programs (Devnet)

| Program | Program ID | Size | Description |
|---------|------------|------|-------------|
| **vault** | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | 391 KB | Risk enforcement vault |
| **ghost-crank** | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | 413 KB | Ghost order execution crank |
| **ghost-bridge** | `8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA` | 532 KB | TEE-encrypted order bridge |

**Last deployed:** February 1, 2026 | **Authority:** `CPFuniXKyetNdzu5u15snqF3DqMVLFVggRcjDY4cmnSe`

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 15.5.9 |
| **Smart Contracts** | Anchor | 0.32.1 |
| **Solana SDK** | @solana/kit + @solana/react-hooks | 5.1.0 / 1.1.5 |
| **Privacy** | Light Protocol (ZK Compression) | 0.22.0 |
| **TEE Rollups** | MagicBlock Ephemeral Rollups | 0.6.5 |
| **Perp DEX** | Drift Protocol SDK | 2.100.0 |
| **Indexer** | Helius API | Latest |
| **Styling** | Tailwind CSS | 4.x |

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
- Card rarity based on discipline (Bronze → Legendary)
- Shareable for social virality

### Auto-Lockout System

- **Daily loss limits** — Vault locks when exceeded
- **Trade frequency limits** — Prevents overtrading
- **Time-delayed exit** — 24-hour waiting period
- **Penalty exit** — 5% fee for instant access

### Ghost Orders

- Orders encrypted in TEE until price triggers
- No front-running possible
- Executes through MagicBlock Ephemeral Rollups

## Project Structure

```
beneat-solana-hackathon/
├── app/                      # Next.js frontend
│   ├── app/
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom hooks (vault, drift, light)
│   │   ├── lib/              # Utilities and clients
│   │   └── api/              # API routes (crank, webhooks)
│   └── anchor/               # Solana programs
│       └── programs/
│           ├── vault/        # Risk enforcement vault
│           ├── ghost-crank/  # Order execution crank
│           └── ghost-bridge/ # TEE order bridge
├── docs/                     # Documentation
└── README.md
```

## Building Programs

```bash
cd app/anchor

# Build SBF programs (use cargo-build-sbf, NOT anchor build)
cargo-build-sbf --manifest-path programs/vault/Cargo.toml
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
cargo-build-sbf --manifest-path programs/ghost-bridge/Cargo.toml

# Generate IDL (requires Rust 1.89.0)
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p vault -o target/idl/vault.json

# Deploy to devnet
solana program deploy target/deploy/vault.so
```

## Testing

```bash
cd app

# Run unit tests
npm test

# Run specific test suites
npm test -- --grep "light-protocol"
npm test -- --grep "ghost-bridge"
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Project overview |
| [docs/product/PRD.md](docs/product/PRD.md) | Full product requirements |
| [docs/technical/index.md](docs/technical/index.md) | Technical architecture |
| [docs/development/build-and-deploy.md](docs/development/build-and-deploy.md) | Build guide |

## Sponsor Technology Integration

### Light Protocol (Main Track - Open Track Pool)
ZK-compressed token accounts for P&L privacy with decompress → trade → recompress flow.

| Component | File | Lines |
|-----------|------|-------|
| ZK Compression Hook | `app/hooks/use-light-protocol.ts` | 1,400 |
| Shield Mode UI | `app/hooks/use-shield.ts` | 280 |
| Light Instructions | `app/lib/light-instructions.ts` | 450 |

**Features:**
- Compressed token accounts hide realized P&L
- Session key delegation for TEE execution
- Merkle tree sync with validity proofs
- SDK: `@lightprotocol/compressed-token@0.22.0`

### MagicBlock (TEE Bounty - $5K)
Ghost orders encrypted in Intel TDX TEE until price trigger via Ephemeral Rollups.

| Component | File | Lines |
|-----------|------|-------|
| MagicBlock Integration | `app/hooks/use-magicblock.ts` | 1,135 |
| Ghost Crank Program | `anchor/programs/ghost-crank/` | 850 |
| Ghost Bridge Program | `anchor/programs/ghost-bridge/` | 720 |

**Features:**
- Ephemeral Rollup session creation and management
- Account delegation via `@delegate` macro
- Real-time Pyth Lazer price monitoring in enclave
- State commit and undelegation back to base chain
- SDK: `@magicblock-labs/ephemeral-rollups-sdk@0.6.5`

### Helius (Infrastructure Bounty - $5K)
Real-time vault monitoring and transaction infrastructure.

| Component | File | Lines |
|-----------|------|-------|
| Helius Client | `app/lib/helius.ts` | 308 |
| Webhook Handler | `app/api/webhooks/helius/route.ts` | 180 |
| Event Streaming | `app/hooks/use-helius-events.ts` | 150 |

**Features:**
- Webhook-based event streaming for lockouts, deposits, trades
- Enhanced transaction parsing with type recognition
- Priority fee estimation with circuit breaker pattern
- HMAC-SHA256 webhook signature verification

### Additional Integrations

| Technology | Purpose | Key Files |
|------------|---------|-----------|
| **Drift Protocol** | Perpetual futures (30+ markets) | `app/hooks/use-drift.ts`, `app/lib/drift-instructions.ts` |
| **Jito** | MEV-protected bundle submission | `app/lib/jito-bundles.ts` (182 LOC) |
| **Pyth** | Price feeds (Benchmarks + Lazer) | `app/lib/pyth-benchmarks.ts`, `app/hooks/use-magicblock-prices.ts` |

---

## Roadmap

### Phase 1: Hackathon (Current) ✅
- Core vault with risk enforcement rules
- Ghost order TEE execution via MagicBlock
- Light Protocol ZK settlement for P&L privacy
- FIFA-style Trader Cards with behavioral analysis
- Devnet deployment (3 programs verified)

### Phase 2: Beta (Q2 2026)
- Mainnet deployment with production infrastructure
- Multi-asset vault support (BTC, ETH perpetuals)
- Advanced behavioral ML model for tilt detection
- Mobile-responsive trading interface

### Phase 3: Production (Q3 2026)
- DAO governance for protocol parameters
- Institutional API with white-labeling
- Social trading / copy-trading features
- Cross-chain expansion via LayerZero

---

## Hackathon Submission

**Solana Privacy Hackathon 2026**

### Track & Bounties

| Track | Prize Pool | Focus |
|-------|-----------|-------|
| **Track 03: Open Track - Pool** | $18,000 | Privacy applications with Light Protocol |
| **MagicBlock Bounty** | $5,000 | TEE ghost order execution |
| **Helius Bounty** | $5,000 | Webhooks, priority fees, transaction parsing |

**Total Prize Target:** $28,000

## Team

**Beneat** — Building accountable privacy for DeFi traders.

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Your trades are hidden. Your discipline is verifiable.</strong>
</p>

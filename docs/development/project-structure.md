---
purpose: Documents the project directory structure and file organization
related: [development/setup, technical/architecture/overview]
source_of_truth: true
code_files: []
last_verified: 2026-01-29
---

# Project Structure

> **TL;DR:** This project is organized as a documentation-first repository with comprehensive specs for a Solana-based trading vault system. The `docs/` directory contains all project documentation organized by domain: product requirements, technical specifications, development guides, and hackathon materials.

## Directory Layout

```
beneat-solana-hackathon/
├── CLAUDE.md                    # Project instructions for AI assistants
├── .gitignore                   # Git ignore configuration
├── app/                         # Application code (see "Application Structure" below)
├── docs/                        # All project documentation
│   ├── README.md                # Documentation hub and navigation
│   ├── PRD.md                   # Product Requirements Document
│   ├── ARCHITECTURE.md          # High-level architecture overview
│   ├── BOUNTY_STRATEGY.md       # Hackathon bounty targeting strategy
│   │
│   ├── development/             # Developer guides and setup
│   │   ├── index.md
│   │   ├── setup.md
│   │   ├── prerequisites.md
│   │   ├── environment-variables.md
│   │   ├── build-and-deploy.md
│   │   ├── testing.md
│   │   ├── useful-commands.md
│   │   ├── core-implementation.md
│   │   ├── frontend-integration.md
│   │   └── project-structure.md
│   │
│   ├── general/                 # General documentation
│   │   ├── index.md
│   │   ├── appendix.md
│   │   ├── changelog.md
│   │   └── document-history.md
│   │
│   ├── product/                 # Product specifications
│   │   ├── index.md
│   │   ├── executive-summary.md
│   │   ├── problem-statement.md
│   │   ├── solution-overview.md
│   │   ├── target-users.md
│   │   ├── success-metrics.md
│   │   ├── user-flows.md
│   │   ├── risk-assessment.md
│   │   ├── future-roadmap.md
│   │   ├── development-sprint-plan.md
│   │   ├── hackathon.md
│   │   ├── hackathon-strategy.md
│   │   │
│   │   ├── features/            # Feature specifications
│   │   │   ├── index.md
│   │   │   ├── overview.md
│   │   │   ├── vault-system.md
│   │   │   ├── auto-lockout-system.md
│   │   │   ├── emergency-unlock-system.md
│   │   │   ├── wallet-behavior-analysis.md
│   │   │   ├── trader-spec-cards.md
│   │   │   ├── personalized-rule-recommendations.md
│   │   │   ├── jupiter-dex-integration.md
│   │   │   └── privacy-layer.md
│   │   │
│   │   └── hackathon/           # Hackathon-specific materials
│   │       ├── timeline.md
│   │       ├── submission-checklist.md
│   │       ├── final-checklist.md
│   │       ├── pitch-deck-outline.md
│   │       ├── judge-personas.md
│   │       ├── differentiation.md
│   │       ├── risk-mitigation.md
│   │       ├── target-bounties-overview.md
│   │       ├── light-protocol.md
│   │       └── radr-labs-shadowwire.md
│   │
│   ├── technical/               # Technical specifications
│   │   ├── index.md
│   │   ├── security-model.md
│   │   │
│   │   ├── architecture/        # System architecture
│   │   │   ├── index.md
│   │   │   ├── overview.md
│   │   │   ├── system-diagram.md
│   │   │   ├── account-structure.md
│   │   │   └── trade-execution-flow.md
│   │   │
│   │   ├── specs/               # Technical specifications
│   │   │   ├── index.md
│   │   │   ├── overview.md
│   │   │   ├── anchor-program-instructions.md
│   │   │   ├── account-sizes.md
│   │   │   ├── error-codes.md
│   │   │   ├── api-endpoints-frontend.md
│   │   │   └── oracle-and-price-feed-handling.md
│   │   │
│   │   ├── integrations/        # Third-party integrations
│   │   │   ├── index.md
│   │   │   ├── overview.md
│   │   │   ├── jupiter.md
│   │   │   ├── pyth.md
│   │   │   ├── helius.md
│   │   │   └── light-protocol.md
│   │   │
│   │   └── privacy/             # Privacy architecture
│   │       ├── index.md
│   │       ├── overview.md
│   │       ├── architecture.md
│   │       ├── model.md
│   │       └── detailed-analysis.md
│   │
│   ├── legacy/                  # Archived document versions
│   │   └── *.md                 # Timestamped backups
│   │
│   ├── scripts/                 # Documentation tooling
│   │   ├── generate-docs-idx.js # INDEX.json generator
│   │   └── split-docs.js        # Document splitting utility
│   │
│   └── githooks/                # Git hooks
│       └── pre-commit           # Pre-commit hook script
```

## Directory Descriptions

### Root Files

| File/Directory | Purpose |
|----------------|---------|
| `CLAUDE.md` | Project instructions and conventions for AI code assistants |
| `.gitignore` | Standard ignores for Node.js, build artifacts, and IDE files |
| `app/` | Application code: Next.js 16 frontend + Anchor 0.32.1 program |

### docs/

The primary content directory containing all project documentation.

| Directory | Purpose |
|-----------|---------|
| `development/` | Developer setup guides, build instructions, testing procedures, and implementation details |
| `general/` | Cross-cutting documentation including changelog, appendix, and document history |
| `product/` | Product requirements, feature specs, user flows, and hackathon materials |
| `technical/` | Architecture diagrams, API specs, integration guides, and security documentation |
| `legacy/` | Timestamped backups of major documents for version history |
| `scripts/` | JavaScript utilities for documentation management and index generation |
| `githooks/` | Git hook scripts for repository automation |

### docs/product/features/

Individual feature specifications for the trading vault platform:

- **vault-system.md** - Core vault deposit and withdrawal mechanics
- **auto-lockout-system.md** - Automated trading restrictions based on rules
- **emergency-unlock-system.md** - Safety mechanisms for fund access
- **wallet-behavior-analysis.md** - On-chain behavior pattern detection
- **trader-spec-cards.md** - Trader profile visualization
- **personalized-rule-recommendations.md** - AI-driven rule suggestions
- **jupiter-dex-integration.md** - DEX aggregator integration
- **privacy-layer.md** - Privacy-preserving computation layer

### docs/technical/

Technical documentation organized by concern:

- **architecture/** - System design, account structures, and execution flows
- **specs/** - Anchor program instructions, error codes, and API contracts
- **integrations/** - Third-party service integration guides (Jupiter, Pyth, Helius)
- **privacy/** - Privacy architecture using Light Protocol and ZK proofs

### docs/scripts/

| Script | Purpose |
|--------|---------|
| `generate-docs-idx.js` | Generates `INDEX.json` with document metadata and frontmatter |
| `split-docs.js` | Splits large documents into smaller focused files |

## Conventions

### File Naming

- Use kebab-case for all file and directory names
- Index files use `index.md` for directory entry points
- Legacy files include ISO timestamps: `FILENAME.YYYY-MM-DDTHH-MM-SS-MSSZ.md`

### Document Structure

All markdown files should include YAML frontmatter with:
- `purpose` - Single-line description
- `related` - Array of related document paths
- `source_of_truth` - Boolean indicating canonical status
- `last_verified` - Date of last content verification

---

## Application Structure (app/)

The `app/` directory contains the Next.js 16 frontend and Anchor program workspace.

```
app/
├── anchor/                      # Anchor program workspace
│   ├── Anchor.toml              # Anchor config (devnet, program ID)
│   ├── Cargo.toml               # Rust workspace
│   └── programs/
│       ├── vault/               # Main vault program
│       │   └── src/
│       │       ├── lib.rs       # Program entry point
│       │       ├── state/       # Account structures
│       │       ├── instructions/# Instruction handlers
│       │       └── errors.rs    # Custom error codes
│       └── ghost-crank/         # Ghost order crank program
│           └── src/
│               ├── lib.rs
│               └── instructions/
│
├── app/                         # Next.js 16 App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Homepage (landing page)
│   ├── polyfills.ts             # Browser polyfills
│   │
│   ├── analyze/page.tsx         # Wallet analysis page
│   ├── trade/page.tsx           # Trading terminal
│   ├── vault/page.tsx           # Vault management
│   ├── vault/onboarding/page.tsx # Onboarding wizard
│   ├── test/page.tsx            # Development test page
│   │
│   ├── api/webhooks/helius/     # API routes
│   │   ├── route.ts             # Webhook receiver
│   │   ├── events/route.ts      # SSE endpoint
│   │   └── sse.ts               # SSE broadcast module
│   │
│   ├── components/              # React components (~55 files)
│   │   ├── providers.tsx        # Provider stack
│   │   ├── solana-provider.tsx  # Wallet connection
│   │   ├── nav.tsx              # Navigation
│   │   ├── trade-terminal.tsx   # Trading UI
│   │   ├── perp-order-form.tsx  # Order entry form
│   │   ├── positions-panel.tsx  # Open positions
│   │   ├── price-chart.tsx      # TradingView chart
│   │   ├── trader-card.tsx      # Trader profile card
│   │   ├── vault-card.tsx       # Vault controls
│   │   ├── vault-content.tsx    # Vault page content
│   │   ├── behavioral-analysis.tsx
│   │   ├── emotional-speedometer.tsx
│   │   ├── lockout-banner.tsx
│   │   ├── ghost-mode-toggle.tsx
│   │   ├── shield-mode-toggle.tsx
│   │   ├── trigger-order-modal.tsx
│   │   ├── landing/             # Landing page sections
│   │   │   ├── landing-page.tsx
│   │   │   ├── hero-section.tsx
│   │   │   ├── features-section.tsx
│   │   │   └── ...
│   │   ├── onboarding/          # Onboarding wizard
│   │   │   ├── onboarding-wizard.tsx
│   │   │   ├── preset-selector.tsx
│   │   │   └── steps/
│   │   └── simulator/           # Monte Carlo simulator
│   │       ├── equity-curve-simulator.tsx
│   │       ├── monte-carlo-chart.tsx
│   │       └── simulation-logic.ts
│   │
│   ├── hooks/                   # React hooks (21 files)
│   │   ├── index.ts             # Re-exports
│   │   ├── use-vault.ts         # Vault state & operations
│   │   ├── use-drift.ts         # Drift perp trading
│   │   ├── use-magicblock.ts    # Ephemeral Rollup sessions
│   │   ├── use-ghost-crank.ts   # Ghost order management
│   │   ├── use-light-protocol.ts# ZK compression
│   │   ├── use-shield.ts        # Shielded trading
│   │   ├── use-behavioral-analysis.ts
│   │   ├── use-trading-history.ts
│   │   ├── use-helius-events.ts # SSE subscription
│   │   ├── use-trigger-monitor.ts
│   │   ├── use-trigger-executor.ts
│   │   ├── use-trader-profile.ts
│   │   ├── use-private-ghost-orders.ts
│   │   ├── use-candle-stream.ts
│   │   ├── use-historical-candles.ts
│   │   ├── use-magicblock-prices.ts
│   │   ├── use-analysis-data.ts
│   │   ├── use-dev-mode.ts
│   │   └── use-wallet-signer.ts
│   │
│   ├── stores/                  # Zustand stores (6 files)
│   │   ├── index.ts
│   │   ├── behavioral-store.ts  # Behavioral metrics
│   │   ├── gamification-store.ts# Achievements, XP
│   │   ├── onboarding-store.ts  # Wizard state
│   │   ├── price-store.ts       # Live prices
│   │   ├── trading-store.ts     # Positions, orders
│   │   └── webhook-store.ts     # Helius events
│   │
│   ├── lib/                     # Utility libraries (15 files)
│   │   ├── helius.ts            # Helius API client
│   │   ├── helius-webhooks.ts   # Webhook CRUD
│   │   ├── drift-instructions.ts# Drift instruction builders
│   │   ├── drift-verification.ts# User init checks
│   │   ├── jito-bundle.ts       # Jito bundle submission
│   │   ├── light-instructions.ts# Light Protocol builders
│   │   ├── light-wallet-adapter.ts# Wallet→Signer bridge
│   │   ├── solana-adapter.ts    # Type boundary utils
│   │   ├── tee-encryption.ts    # ECIES order encryption
│   │   ├── tee-monitoring-service.ts # TEE order monitor
│   │   ├── pyth-benchmarks.ts   # Historical price data
│   │   ├── candle-aggregator.ts # OHLCV aggregation
│   │   ├── analysis.ts          # Pattern detection
│   │   ├── mock-analysis.ts     # Dev mode mocks
│   │   └── wallet-signer-adapter.ts
│   │
│   ├── types/                   # TypeScript types
│   │   ├── index.ts
│   │   ├── drift.ts             # Drift types
│   │   ├── ghost-order.ts       # Ghost order types
│   │   ├── helius-webhook.ts    # Webhook payload types
│   │   └── trigger-monitor.ts   # Trigger order types
│   │
│   ├── generated/vault/        # Codama-generated client
│   │   ├── index.ts
│   │   ├── instructions/
│   │   ├── accounts/
│   │   ├── programs/
│   │   └── errors/
│   │
│   └── __tests__/              # Test files
│       ├── drift/
│       ├── helius/
│       ├── light-protocol/
│       ├── hooks/
│       ├── stores/
│       └── integration/
│
├── codama.json                  # TypeScript client generation config
├── next.config.ts               # Next.js configuration
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Vitest test configuration
├── eslint.config.mjs            # ESLint 9 configuration
└── postcss.config.mjs           # PostCSS for Tailwind 4
```

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.x | React framework (App Router) |
| `react` | 19.x | UI library |
| `@solana/kit` | 5.x | Solana client utilities |
| `@solana/react-hooks` | 1.x | Wallet connection hooks |
| `@solana/web3.js` | 1.x | Legacy Solana SDK (for external libs) |
| `@lightprotocol/stateless.js` | 0.22.x | Light Protocol ZK compression |
| `@lightprotocol/compressed-token` | 0.22.x | Compressed token operations |
| `@magicblock-labs/ephemeral-rollups-sdk` | latest | MagicBlock ER integration |
| `zustand` | 5.x | State management |
| `anchor-lang` | 0.32.1 | Anchor framework (Rust) |
| `codama` | 1.x | IDL → TypeScript generator |
| `tailwindcss` | 4.x | CSS framework |
| `vitest` | latest | Test framework |

### Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `npm run dev` | Start Next.js dev server |
| `build` | `npm run build` | Production build |
| `test` | `npm run test` | Run Vitest tests |
| `anchor-build` | `npm run anchor-build` | Build Anchor program |
| `anchor-test` | `npm run anchor-test` | Run Anchor tests |
| `setup` | `npm run setup` | Build program + generate client |
| `codama:js` | `npm run codama:js` | Regenerate TypeScript client |

### Key Directories by Feature

| Feature | Components | Hooks | Stores | Lib |
|---------|------------|-------|--------|-----|
| Trading | `perp-order-form`, `positions-panel`, `price-chart` | `use-drift`, `use-trigger-*` | `trading-store`, `price-store` | `drift-instructions` |
| Privacy | `ghost-mode-toggle`, `shield-mode-toggle` | `use-magicblock`, `use-shield`, `use-light-protocol` | — | `light-*`, `jito-bundle` |
| Vault | `vault-card`, `vault-content`, `lockout-banner` | `use-vault` | — | — |
| Analysis | `behavioral-analysis`, `emotional-speedometer`, `trader-card` | `use-behavioral-analysis`, `use-trading-history` | `behavioral-store` | `helius`, `analysis` |
| Onboarding | `onboarding/*`, `simulator/*` | — | `onboarding-store`, `gamification-store` | — |

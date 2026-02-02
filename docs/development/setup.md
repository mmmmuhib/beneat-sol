---
purpose: Project initialization and dependency installation guide
related:
  - development/prerequisites
  - development/core-implementation
  - development/environment-variables
  - technical/project-structure
source_of_truth: true
code_files: []
last_verified: 2026-01-22
---

# Beneat Solana - Development Setup

> **TL;DR:** Project scaffolded with `create-solana-dapp`. Configure devnet, build Anchor program, and run the Next.js frontend.

## Project Setup

### 1. Project Already Scaffolded

The project was initialized using the official Solana Foundation CLI:

```bash
npx create-solana-dapp@latest app -t nextjs-anchor
```

This creates a monorepo with:
- **Next.js 16** frontend with App Router
- **Anchor 0.32.1** vault program template
- **@solana/kit** and **@solana/react-hooks** for wallet connection
- **Codama** for TypeScript client generation from IDL

### 2. Configure Solana CLI

```bash
# Configure for devnet
solana config set --url devnet

# Create keypair (if needed)
solana-keygen new --outfile ~/.config/solana/id.json

# Airdrop for testing
solana airdrop 2
```

### 3. Build and Run

```bash
cd app

# Build Anchor program and generate TypeScript client
npm run setup

# Start development server
npm run dev
```

### 4. Install Additional Dependencies

```bash
# Light Protocol (ZK compression)
npm install @lightprotocol/stateless.js @lightprotocol/compressed-token

# Jupiter DEX integration
npm install @jup-ag/api

# Helius SDK for wallet analysis
npm install helius-sdk
```

### 5. Project Structure

```
app/
├── anchor/                      # Anchor program
│   ├── Anchor.toml              # Anchor configuration
│   ├── Cargo.toml               # Rust workspace
│   └── programs/
│       └── vault/               # Vault program (rename to beneat)
│           ├── Cargo.toml
│           └── src/
│               └── lib.rs       # Program entry point
├── app/                         # Next.js App Router
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Homepage
│   ├── components/
│   │   ├── providers.tsx        # SolanaProvider setup
│   │   └── vault-card.tsx       # Vault UI component
│   └── generated/
│       └── vault/               # Auto-generated TypeScript client
│           ├── index.ts
│           ├── instructions/    # deposit.ts, withdraw.ts
│           ├── programs/        # Program ID and helpers
│           └── errors/          # Error types
├── codama.json                  # TypeScript client generation config
├── next.config.ts               # Next.js configuration
├── package.json                 # Dependencies and scripts
└── tsconfig.json                # TypeScript configuration
```

### 6. Key Dependencies (Already Installed)

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.0.10 | React framework with App Router |
| `react` | 19.2.3 | UI library |
| `@solana/kit` | 5.1.0 | Solana client utilities |
| `@solana/react-hooks` | 1.1.5 | React hooks for wallet connection |
| `@solana/client` | 1.2.0 | Solana RPC client |
| `anchor-lang` | 0.32.1 | Anchor framework (Rust) |
| `codama` | 1.5.0 | IDL → TypeScript client generator |
| `tailwindcss` | 4.x | Utility-first CSS |

### 7. Available Scripts

```bash
npm run dev           # Start Next.js dev server
npm run build         # Production build
npm run anchor-build  # Build Anchor program
npm run anchor-test   # Run Anchor tests
npm run setup         # Build program + generate TypeScript client
npm run codama:js     # Regenerate TypeScript client from IDL
npm run lint          # Run ESLint
npm run format        # Format with Prettier
```

## Verification

### Environment Verified (2026-01-22)

The following setup has been verified as working:

**Installed Toolchain:**
- ✅ Rust: 1.93.0
- ✅ Solana CLI: 3.0.13 (Agave client)
- ✅ Anchor CLI: 0.32.1
- ✅ Node.js: v24.10.0
- ✅ npm: 11.7.0
- ✅ cargo-build-sbf: 3.0.13

**Build Artifacts Generated:**
- ✅ Program binary: `anchor/target/deploy/vault.so` (185KB)
- ✅ Program ID: `6qupWfS7CxPFHbB4XEAq1PajKm6UYR3FNRjR541EutFy`
- ✅ IDL: `anchor/target/idl/vault.json`
- ✅ TypeScript clients: `app/generated/vault/`
  - `instructions/deposit.ts`
  - `instructions/withdraw.ts`
  - `programs/vault.ts`
  - `errors/vault.ts`

**Current Program Capabilities:**
- Basic SOL vault with deposit/withdraw instructions
- PDA-based user vaults (seed: `["vault", user_pubkey]`)
- Ready for Light Protocol, Jupiter, and Pyth integration

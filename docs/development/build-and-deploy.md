---
purpose: Build, deploy, and run commands for the Solana program and frontend
related:
  - development/setup
  - development/testing
  - development/useful-commands
  - development/prerequisites
  - technical/integrations/magicblock
source_of_truth: true
code_files:
  - app/anchor/rust-toolchain.toml
  - app/anchor/programs/vault/Cargo.toml
  - app/anchor/programs/ghost-crank/Cargo.toml
last_verified: 2026-02-01
---

# Beneat Solana - Build & Deploy Guide

> **TL;DR:** Use `cargo-build-sbf` for SBF builds and `RUSTUP_TOOLCHAIN=1.89.0 anchor idl build` for IDL generation. Standard `anchor build` has known issues with the current toolchain.

## Quick Start

```bash
# Build SBF programs (recommended method)
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
cargo-build-sbf --manifest-path programs/vault/Cargo.toml

# Generate IDL (requires Rust 1.89.0)
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_crank -o target/idl/ghost_crank.json
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p vault -o target/idl/vault.json

# Deploy to devnet
solana program deploy target/deploy/ghost_crank.so --program-id target/deploy/ghost_crank-keypair.json

# Start frontend
cd app && npm run dev
```

## ⚠️ Known Build Issues & Workarounds

### Issue 1: `anchor build` ICE (Internal Compiler Error)

**Symptom:**
```
error: the compiler unexpectedly panicked. this is a bug.
query stack during panic:
#0 [optimized_mir] optimizing MIR for `std::process::Command::args`
```

**Cause:** The Solana BPF rustc (1.84.1-sbpf-solana-v1.51) incorrectly compiles native dependencies.

**Solution:** Use `cargo-build-sbf` directly instead of `anchor build`:

```bash
# Build each program separately
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
cargo-build-sbf --manifest-path programs/vault/Cargo.toml
```

### Issue 2: IDL Generation Fails with `local_file` Error

**Symptom:**
```
error[E0599]: no method named `local_file` found for struct `proc_macro::Span`
```

**Cause:** Anchor 0.32.1 uses `proc_macro::Span::local_file()` which was stabilized in Rust 1.88.0. Anchor internally invokes `+stable` for IDL generation, so if your stable Rust is < 1.88, it fails.

**Solution:** Force Rust 1.89.0 for IDL generation:

```bash
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_crank -o target/idl/ghost_crank.json
```

### Issue 3: Missing `anchor-spl/idl-build` Feature

**Symptom:**
```
WARNING: `idl-build` feature of `anchor-spl` is not enabled.
error[E0599]: no function or associated item named `create_type` found for struct `TokenAccount`
```

**Solution:** Ensure `Cargo.toml` includes the feature:

```toml
[features]
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

## Build Commands Reference

### SBF Program Build

```bash
# Build all programs
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
cargo-build-sbf --manifest-path programs/vault/Cargo.toml

# Verify outputs
ls -la target/deploy/*.so
# ghost_crank.so (~375KB)
# vault.so (~391KB)
```

### IDL Generation

```bash
# Generate IDL for specific program
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_crank -o target/idl/ghost_crank.json
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p vault -o target/idl/vault.json

# Copy IDL to frontend
cp target/idl/ghost_crank.json app/app/lib/ghost-crank-idl.json
```

### Deployment

```bash
# Check wallet balance
solana balance

# Deploy new program
solana program deploy target/deploy/ghost_crank.so \
  --program-id target/deploy/ghost_crank-keypair.json

# Upgrade existing program
solana program deploy target/deploy/ghost_crank.so \
  --program-id 7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv

# Verify deployment
solana program show 7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv
```

## Deployed Programs (Devnet)

| Program | Program ID | Status | Size |
|---------|------------|--------|------|
| vault | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | ✅ Deployed | 391 KB |
| ghost-crank | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | ✅ Deployed | 413 KB |
| ghost-bridge | `8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA` | ✅ Deployed | 532 KB |

**Last deployed:** 2026-02-01
**Upgrade authority:** `CPFuniXKyetNdzu5u15snqF3DqMVLFVggRcjDY4cmnSe`

### Ghost-Bridge Program

The ghost-bridge program enables encrypted ghost orders with TEE execution:

```bash
# Build ghost-bridge
cargo-build-sbf --manifest-path programs/ghost-bridge/Cargo.toml

# Generate IDL
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_bridge -o target/idl/ghost_bridge.json

# Deploy
solana program deploy target/deploy/ghost_bridge.so \
  --program-id 8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA
```

## Frontend Development

```bash
cd app

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Troubleshooting

### "AccountNotFound" during deploy

The public devnet RPC may rate-limit. Use `solana program deploy` directly instead of `anchor deploy`.

### Rust version confusion

Check which Rust is active:
```bash
rustc --version                    # Host compiler
rustup show                        # All toolchains
cat rust-toolchain.toml            # Project override
```

### Stale build artifacts

Clean and rebuild:
```bash
cargo clean
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
```

## TEE Crank Service

The ghost-bridge uses a TEE monitoring service to execute encrypted trigger orders. This service can run as a Next.js API route.

### Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
# Required for crank operation
TEE_PRIVATE_KEY=<your-32-byte-hex-private-key>
NEXT_PUBLIC_TEE_PUBLIC_KEY=<corresponding-compressed-public-key>
MAGICBLOCK_ER_RPC=https://devnet.magicblock.app
CRANK_POLL_INTERVAL_MS=2000
```

### Crank API Endpoints

```bash
# Start the monitoring service
curl -X POST http://localhost:3000/api/crank \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'

# Check status
curl http://localhost:3000/api/crank

# Add an order to monitor
curl -X POST http://localhost:3000/api/crank \
  -H "Content-Type: application/json" \
  -d '{"action": "add-order", "orderPubkey": "<order-pda>"}'

# Stop the service
curl -X POST http://localhost:3000/api/crank \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'

# Real-time event stream (SSE)
curl http://localhost:3000/api/crank/stream
```

### Testing the Integration

```bash
# 1. Deploy ghost-bridge program (if needed)
solana program deploy target/deploy/ghost_bridge.so

# 2. Start frontend with crank
cd app && npm run dev

# 3. Test flow:
#    - Initialize executor (wallet connects)
#    - Create encrypted order with trigger price
#    - Delegate order to ER
#    - Start crank service via API
#    - Wait for price condition to be met
#    - Verify order executes
```

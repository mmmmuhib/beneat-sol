---
purpose: Required toolchain installation for Beneat Solana development
related:
  - development/setup
  - development/environment-variables
  - development/build-and-deploy
source_of_truth: true
code_files:
  - app/anchor/rust-toolchain.toml
last_verified: 2026-01-30
---

# Beneat Solana - Development Prerequisites

> **TL;DR:** Install Rust 1.89.0, Solana CLI 3.x (Agave), Anchor 0.32.1, and Node.js v20+ before starting development.

## Prerequisites

### Required Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | **1.89.0** (specific) | Anchor program compilation and IDL generation |
| Solana CLI | 3.x (Agave) | Cluster interaction, keypair management, cargo-build-sbf |
| Anchor | 0.32.1 | Solana program framework |
| Node.js | 20+ (tested with 24.10) | Frontend and tooling |
| npm | 10+ (tested with 11.7) | Package management |

### ⚠️ Critical: Rust Version Compatibility

**This project requires Rust 1.89.0 specifically.** There is a complex toolchain compatibility issue:

| Requirement | Rust Version | Reason |
|-------------|--------------|--------|
| Anchor 0.32.1 IDL generation | **1.88.0+** | Uses `proc_macro::Span::local_file()` stabilized in 1.88 |
| MagicBlock SDK | 1.85+ (recommended) | `ephemeral-rollups-sdk` compatibility |
| Solana platform-tools v1.51 | Any | Uses bundled SBF rustc (1.84.1) |

**Solution:** Use Rust 1.89.0 which satisfies all requirements:

```bash
# Install and set Rust 1.89.0
rustup install 1.89.0
rustup default 1.89.0

# The project's rust-toolchain.toml enforces 1.89.0
cat app/anchor/rust-toolchain.toml
# [toolchain]
# channel = "1.89.0"
```

> **Why not latest stable?** Anchor internally uses `+stable` for IDL generation. If your stable is older than 1.88, IDL generation fails. Using 1.89.0 explicitly avoids this issue.

### Installation

#### 1. Install Rust

```bash
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Reload PATH
. "$HOME/.cargo/env"

# Verify
rustc --version
```

#### 2. Install Solana CLI

```bash
# Install from Anza (latest stable, v3.x)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add to PATH (Linux/WSL - Bash)
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Add to PATH (Mac - Zsh)
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify installation
solana --version           # Should show 3.0.x (Agave)
cargo-build-sbf --version  # Should show 3.0.x
```

#### 3. Install Anchor

The project uses Anchor 0.32.1 which is already installed if you cloned this repo.

```bash
# Verify Anchor installation
anchor --version  # Should show 0.32.1

# If not installed, install via cargo
cargo install --git https://github.com/solana-foundation/anchor --tag v0.32.1 anchor-cli
```

**Optional:** Install AVM (Anchor Version Manager) for managing multiple Anchor versions:

```bash
cargo install --git https://github.com/solana-foundation/anchor avm --force
avm install 0.32.1
avm use 0.32.1
```

#### 4. Node.js & npm

```bash
# Install Node.js v20+ (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc  # or ~/.zshrc

nvm install 20
nvm use 20

# Verify
node --version  # Should show v20.x or higher
npm --version   # Should show 10.x or higher
```

### Verify Complete Installation

```bash
rustc --version           # rustc 1.93.0 or higher
solana --version          # solana-cli 3.0.13 or higher (Agave)
cargo-build-sbf --version # solana-cargo-build-sbf 3.0.x
anchor --version          # anchor-cli 0.32.1
node --version            # v20.x or higher
npm --version             # 10.x or higher
```

### Installation Notes

- **Solana CLI 3.x** includes the Agave validator client (formerly Solana Labs client)
- **cargo-build-sbf** is required for building Anchor programs and comes with Solana CLI
- For Windows users, use WSL (Windows Subsystem for Linux) - native Windows is not supported

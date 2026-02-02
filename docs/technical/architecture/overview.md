---
purpose: Complete technical architecture overview including system diagram, tech stack, and 3-program structure (vault, ghost-crank, ghost-bridge)
related:
  - technical/architecture/system-diagram
  - technical/architecture/account-structure
  - technical/integrations/overview
  - technical/integrations/magicblock
  - technical/integrations/light-protocol
source_of_truth: true
code_files:
  - app/anchor/programs/vault/src/lib.rs
  - app/anchor/programs/vault/src/state/vault.rs
  - app/anchor/programs/vault/src/state/trader_profile.rs
  - app/anchor/programs/ghost-crank/src/lib.rs
  - app/anchor/programs/ghost-crank/src/state/ghost_order.rs
  - app/anchor/programs/ghost-bridge/src/lib.rs
  - app/anchor/programs/ghost-bridge/src/state/encrypted_order.rs
  - app/anchor/Anchor.toml
last_verified: 2026-02-01
---

# Beneat Solana: Privacy-Preserving Risk Enforcement

> **TL;DR:** Three Anchor programs (vault, ghost-crank, ghost-bridge) with MagicBlock TEE for order privacy, Light Protocol ZK for balance privacy, Drift for perp trading, and Next.js frontend.

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│                    (Next.js + React + TypeScript)                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Wallet    │  │   Trader    │  │    Vault    │  │   Ghost    │ │
│  │  Connect    │  │    Card     │  │  Management │  │   Orders   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ RPC + Transactions
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SOLANA BLOCKCHAIN                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    VAULT PROGRAM                               │ │
│  │              Program: GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUu...  │ │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐   │ │
│  │  │   PUBLIC STATE   │  │      TRADER PROFILE              │   │ │
│  │  │                  │  │                                  │   │ │
│  │  │  • is_locked     │  │  • overall_rating (0-99)         │   │ │
│  │  │  • lockout_until │  │  • discipline, patience          │   │ │
│  │  │  • lockout_count │  │  • consistency, timing           │   │ │
│  │  │  • trades_today  │  │  • total_trades, total_pnl       │   │ │
│  │  │  • daily_loss... │  │  • trading_days                  │   │ │
│  │  └──────────────────┘  └──────────────────────────────────┘   │ │
│  │                                                                │ │
│  │  Instructions: initialize, deposit, withdraw, set_rules,      │ │
│  │    manual_lock, unlock, swap_with_enforcement,                 │ │
│  │    initialize_profile, update_stats, delegate/undelegate       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  GHOST-CRANK PROGRAM                           │ │
│  │           Program: 7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7Wq...      │ │
│  │                                                                │ │
│  │  Ghost Orders: Encrypted trigger orders for private execution │ │
│  │  • create_ghost_order    • delegate_order    • check_trigger  │ │
│  │  • execute_trigger       • cancel_order      • mark_ready     │ │
│  │  • execute_with_commitment (Shield Mode atomic bundle)        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                 GHOST-BRIDGE PROGRAM                           │ │
│  │           Program: 8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTi...     │ │
│  │                                                                │ │
│  │  TEE Integration: MagicBlock Ephemeral Rollups execution      │ │
│  │  • init_executor         • create_encrypted_order             │ │
│  │  • delegate_executor     • trigger_and_execute                │ │
│  │  • consume_and_execute   • schedule_encrypted_monitoring      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    MAGICBLOCK (TEE ER)                         │ │
│  │              Hardware-enforced order privacy                   │ │
│  │         Orders encrypted until trigger conditions met          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    DRIFT PROTOCOL                              │ │
│  │              Perpetual futures liquidity                       │ │
│  │         31+ markets, up to 20x leverage                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    LIGHT PROTOCOL                              │ │
│  │              ZK compression for balance privacy                │ │
│  │         Compressed token accounts, Merkle proofs               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      JITO (Bundles)                            │ │
│  │              MEV protection, atomic execution                  │ │
│  │         Bundle submission with tip escalation                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ Indexed Data
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         HELIUS API                                   │
│         Transaction history, webhooks, SSE streaming                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Deployed Programs (Devnet)

| Program | Program ID | Size | Description |
|---------|------------|------|-------------|
| **vault** | `GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki` | 391 KB | Risk enforcement vault with trader profiles |
| **ghost-crank** | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | 413 KB | Ghost order execution crank |
| **ghost-bridge** | `8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA` | 532 KB | TEE-encrypted order bridge |

**Last deployed:** February 1, 2026 | **Authority:** `CPFuniXKyetNdzu5u15snqF3DqMVLFVggRcjDY4cmnSe`

### Tech Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | Next.js (App Router) | 15.5.9 | User interface |
| **Smart Contracts** | Anchor (Rust) | 0.32.1 | 3 on-chain programs |
| **Solana SDK** | @solana/kit | 5.1.0 | RPC client and utilities |
| **Wallet** | @solana/react-hooks | 1.1.5 | Wallet connection |
| **TEE Rollups** | MagicBlock ER | 0.6.5 | Order privacy (Intel TDX) |
| **Privacy** | Light Protocol | 0.22.0 | ZK balance compression |
| **Perp DEX** | Drift Protocol SDK | 2.100.0 | Perpetual futures |
| **MEV Protection** | Jito Bundles | Latest | Atomic execution |
| **Indexer** | Helius API | Latest | Transaction history |
| **Oracle** | Pyth Network | Latest | Price feeds |
| **Styling** | Tailwind CSS | 4.x | UI styling |
| **TypeScript** | TypeScript | 5.x | Type safety |

> **Note:** Using `@solana/kit` (Solana Kit) instead of legacy `@solana/web3.js`. This is the modern approach recommended by Solana Foundation.

### Program Architecture

#### Vault Program (`programs/vault/`)
Risk enforcement vault with trader profile system.

```
programs/vault/
├── Cargo.toml
└── src/
    ├── lib.rs                    # Program entry (13 instructions)
    ├── state/
    │   ├── mod.rs
    │   ├── vault.rs              # Vault account (28 fields)
    │   └── trader_profile.rs     # Trader stats (FIFA-style card)
    ├── instructions/
    │   ├── mod.rs
    │   ├── initialize.rs         # Create vault PDA
    │   ├── deposit.rs            # Fund vault
    │   ├── withdraw.rs           # Remove funds
    │   ├── set_rules.rs          # Configure risk rules
    │   ├── manual_lock.rs        # Self-imposed lockout
    │   ├── unlock.rs             # Time-based unlock
    │   ├── swap.rs               # Trade with enforcement
    │   ├── delegate.rs           # MagicBlock ER delegation
    │   ├── undelegate.rs         # Undelegate from ER
    │   ├── initialize_profile.rs # Create trader card
    │   ├── update_stats.rs       # Update trading stats
    │   ├── delegate_profile.rs   # Delegate profile to ER
    │   └── undelegate_profile.rs # Undelegate profile
    └── errors.rs                 # Custom errors
```

**Key Features:**
- **Lockout System**: Time-based and rule-based trading locks
- **Risk Rules**: Daily loss limits, max trades per day, cooldown periods
- **Trader Profile**: 6-stat FIFA-style card (discipline, patience, consistency, timing, risk_control, endurance)
- **MagicBlock Integration**: Full ER delegation/undelegation support

#### Ghost-Crank Program (`programs/ghost-crank/`)
Encrypted trigger order system for private order execution.

```
programs/ghost-crank/
├── Cargo.toml
└── src/
    ├── lib.rs                    # Program entry (9 instructions)
    ├── state/
    │   ├── mod.rs
    │   └── ghost_order.rs        # Ghost order state
    └── instructions/
        ├── mod.rs
        ├── create_ghost_order.rs # Create encrypted order
        ├── delegate_order.rs     # Delegate to ER
        ├── check_trigger.rs      # Verify trigger conditions
        ├── execute_trigger.rs    # Execute triggered order
        ├── schedule_monitoring.rs # Schedule price monitoring
        ├── cancel_order.rs       # Cancel ghost order
        ├── mark_ready.rs         # Mark order ready for execution
        └── execute_with_commitment.rs # Atomic Shield Mode execution
```

**Key Features:**
- **Encrypted Orders**: Order details hidden until execution
- **Trigger Conditions**: Price-based execution (stop loss, take profit)
- **Price Monitoring**: Automated crank for trigger detection
- **Shield Mode**: Atomic bundle execution with Light Protocol

#### Ghost-Bridge Program (`programs/ghost-bridge/`)
TEE integration bridge for MagicBlock Ephemeral Rollups.

```
programs/ghost-bridge/
├── Cargo.toml
└── src/
    ├── lib.rs                    # Program entry (12 instructions)
    ├── state/
    │   ├── mod.rs
    │   ├── encrypted_order.rs    # TEE-encrypted order state
    │   └── executor_authority.rs # Executor delegation
    ├── instructions/
    │   ├── mod.rs
    │   ├── init_executor.rs      # Initialize TEE executor
    │   ├── delegate_executor.rs  # Delegate to TEE
    │   ├── undelegate_executor.rs # Undelegate from TEE
    │   ├── create_encrypted_order.rs # Create TEE order
    │   ├── delegate_encrypted_order.rs # Delegate encrypted order
    │   ├── trigger_and_execute.rs # TEE trigger execution
    │   ├── cancel_encrypted_order.rs # Cancel TEE order
    │   ├── close_encrypted_order.rs # Close order account
    │   ├── authorize_executor.rs # Authorize TEE executor
    │   ├── schedule_encrypted_monitoring.rs # Schedule monitoring
    │   ├── check_price_update.rs # Check price conditions
    │   ├── create_compressed_order.rs # Light Protocol compressed order
    │   └── consume_and_execute.rs # Consume and execute order
    ├── drift_cpi.rs              # Drift Protocol CPI helpers
    ├── constants.rs              # Program constants
    └── errors.rs                 # Custom errors
```

**Key Features:**
- **TEE Executor**: Hardware-enforced execution environment
- **Drift Integration**: Direct CPI calls to Drift Protocol
- **Light Protocol**: ZK-compressed order state
- **Price Oracles**: Pyth integration for trigger conditions

### Trading Modes

#### Flash Mode
Fast public trading with MEV protection via Jito bundles.

**Flow:**
```
User Wallet → Vault Check → Drift → Jito Bundle → Settlement
```

- No TEE (orders visible)
- No Light Protocol (public balance)
- Jito prevents sandwich attacks
- Market orders only
- ~2s latency, ~$0.01 cost

#### Shield Mode
Full privacy with TEE + ZK + Jito atomic bundles.

**Flow:**
```
1. Delegate to MagicBlock TEE
2. Create encrypted ghost order
3. TEE monitors price feeds privately
4. On trigger:
   - Decompress from Light Protocol (ZK)
   - Deposit to Drift
   - Execute trade
   - Recompress to Light Protocol (ZK)
5. All steps bundled via Jito (atomic)
```

- Full intent privacy (TEE)
- Full balance privacy (ZK)
- Full execution privacy (Jito bundles)
- Supports limits, stops, take profits
- ~10-30s latency, ~$0.50-1.00 cost

### Account Structures

#### Vault Account
```rust
#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub bump: u8,
    pub is_locked: bool,
    pub lockout_until: i64,
    pub lockout_count: u32,
    pub lockout_duration: u32,
    pub daily_loss_limit: u64,
    pub max_trades_per_day: u8,
    pub trades_today: u8,
    pub session_start: i64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub last_trade_was_loss: bool,
    pub last_trade_time: i64,
    pub cooldown_seconds: u32,
    pub swap_in_progress: bool,
    pub pending_swap_source_mint: Pubkey,
    pub pending_swap_dest_mint: Pubkey,
    pub pending_swap_amount_in: u64,
    pub pending_swap_min_out: u64,
    pub balance_before_swap: u64,
}
```

#### TraderProfile Account
```rust
#[account]
pub struct TraderProfile {
    pub authority: Pubkey,
    pub bump: u8,
    pub overall_rating: u8,      // 0-99 FIFA-style
    pub discipline: u8,          // Risk control adherence
    pub patience: u8,            // Wait time between trades
    pub consistency: u8,         // Win rate stability
    pub timing: u8,              // Entry quality
    pub risk_control: u8,        // Position sizing discipline
    pub endurance: u8,           // Trading session management
    pub total_trades: u32,
    pub total_wins: u32,
    pub total_pnl: i64,
    pub avg_trade_size: u64,
    pub trading_days: u16,
    pub last_updated: i64,
}
```

---

## Build Instructions

```bash
cd app/anchor

# Build all programs
cargo-build-sbf --manifest-path programs/vault/Cargo.toml
cargo-build-sbf --manifest-path programs/ghost-crank/Cargo.toml
cargo-build-sbf --manifest-path programs/ghost-bridge/Cargo.toml

# Generate IDL
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p vault -o target/idl/vault.json
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_crank -o target/idl/ghost_crank.json
RUSTUP_TOOLCHAIN=1.89.0 anchor idl build -p ghost_bridge -o target/idl/ghost_bridge.json
```

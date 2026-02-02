---
purpose: Documents all Anchor program instructions with parameters, access control, and descriptions
related:
  - technical/specs/overview
  - technical/specs/error-codes
  - technical/architecture/trade-execution-flow
  - technical/integrations/magicblock
  - technical/integrations/drift
source_of_truth: false
code_files:
  - app/anchor/programs/vault/src/lib.rs
  - app/anchor/programs/vault/src/instructions/initialize.rs
  - app/anchor/programs/vault/src/instructions/deposit.rs
  - app/anchor/programs/vault/src/instructions/withdraw.rs
  - app/anchor/programs/vault/src/instructions/set_rules.rs
  - app/anchor/programs/vault/src/instructions/swap.rs
  - app/anchor/programs/vault/src/instructions/manual_lock.rs
  - app/anchor/programs/vault/src/instructions/unlock.rs
  - app/anchor/programs/vault/src/instructions/delegate.rs
  - app/anchor/programs/vault/src/instructions/undelegate.rs
  - app/anchor/programs/vault/src/instructions/initialize_profile.rs
  - app/anchor/programs/vault/src/instructions/update_stats.rs
  - app/anchor/programs/vault/src/instructions/delegate_profile.rs
  - app/anchor/programs/vault/src/instructions/undelegate_profile.rs
  - app/anchor/programs/ghost-crank/src/lib.rs
  - app/anchor/programs/ghost-crank/src/instructions/create_ghost_order.rs
  - app/anchor/programs/ghost-crank/src/instructions/delegate_order.rs
  - app/anchor/programs/ghost-crank/src/instructions/check_trigger.rs
  - app/anchor/programs/ghost-crank/src/instructions/execute_trigger.rs
  - app/anchor/programs/ghost-crank/src/instructions/schedule_monitoring.rs
  - app/anchor/programs/ghost-crank/src/instructions/cancel_order.rs
last_verified: 2026-01-28
---

# Anchor Program Instructions

> **TL;DR:** Two programs power Beneat: the **Vault program** (13 instructions for risk enforcement, deposits, swaps, and trader profiles) and the **Ghost-Crank program** (7 instructions for private trigger orders via MagicBlock ER). Both use MagicBlock's `#[ephemeral]` macro for Ephemeral Rollup support.

## Program Overview

| Program | Program ID | Instructions | Purpose |
|---------|------------|--------------|---------|
| Vault | `6qupWfS7CxPFHbB4XEAq1PajKm6UYR3FNRjR541EutFy` | 13 | Risk enforcement, trading rules, trader profiles |
| Ghost-Crank | `7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv` | 7 | Private trigger orders executed on ER |

---

## Vault Program Instructions

### Core Vault Operations

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `initialize` | `lockout_duration: u32` | Anyone | Create new vault PDA for caller |
| `deposit` | `amount: u64` | Owner only | Fund vault with tokens |
| `withdraw` | `amount: u64` | Owner only, not locked | Remove funds from vault |
| `set_rules` | `daily_loss_limit: u64, max_trades_per_day: u8, lockout_duration: u32` | Owner only | Configure risk rules |
| `manual_lock` | none | Owner only | Self-imposed lockout |
| `unlock` | none | Owner only, after timeout | Remove lockout after expiry |

### Swap Operations (Split Instruction Pattern)

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `pre_swap_check` | `source_mint: Pubkey, dest_mint: Pubkey, amount_in: u64, min_out: u64` | Owner only, not locked | Validate and prepare for swap |
| `swap_with_enforcement` | `amount_in: u64, min_out: u64` | Owner only, not locked | Execute swap with rule enforcement |
| `post_swap_update` | none | Owner only | Finalize swap and calculate P&L |

### Ephemeral Rollups Delegation

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `delegate` | none | Owner only | Delegate vault account to ER |
| `undelegate` | none | Session keypair | Return vault control to owner |

### Trader Profile System

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `initialize_profile` | none | Anyone | Create trader profile PDA |
| `update_stats` | `UpdateStatsArgs` | Profile authority | Update trading statistics |
| `delegate_profile` | none | Profile authority | Delegate profile to ER |
| `undelegate_profile` | none | Session keypair | Return profile control |

---

## Ghost-Crank Program Instructions

| Instruction | Parameters | Access Control | Description |
|-------------|------------|----------------|-------------|
| `create_ghost_order` | `CreateGhostOrderArgs` | Anyone | Create private trigger order |
| `delegate_order` | none | Order owner | Delegate order to ER |
| `activate_order` | none | Order owner | Activate order for monitoring |
| `check_trigger` | none | ER crank | Check if trigger condition met |
| `execute_trigger` | none | ER crank | Execute trade via Drift CPI |
| `schedule_monitoring` | `ScheduleMonitoringArgs` | Order owner | Set up crank monitoring |
| `cancel_order` | none | Order owner | Cancel pending order |

---

## State Structures

### Vault

```rust
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
    // Swap state
    pub swap_in_progress: bool,
    pub pending_swap_source_mint: Pubkey,
    pub pending_swap_dest_mint: Pubkey,
    pub pending_swap_amount_in: u64,
    pub pending_swap_min_out: u64,
    pub balance_before_swap: u64,
}
```

**Seeds:** `["vault", owner.key()]`

### TraderProfile

```rust
pub struct TraderProfile {
    pub authority: Pubkey,
    pub bump: u8,
    pub overall_rating: u8,      // 0-99
    pub discipline: u8,          // 0-99
    pub patience: u8,            // 0-99
    pub consistency: u8,         // 0-99
    pub timing: u8,              // 0-99
    pub risk_control: u8,        // 0-99
    pub endurance: u8,           // 0-99
    pub total_trades: u32,
    pub total_wins: u32,
    pub total_pnl: i64,
    pub avg_trade_size: u64,
    pub trading_days: u16,
    pub last_updated: i64,
}
```

**Seeds:** `["trader_profile", authority.key()]`

### GhostOrder

```rust
pub struct GhostOrder {
    pub owner: Pubkey,
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,          // Scaled by 1e6
    pub trigger_condition: TriggerCondition,  // Above = 0, Below = 1
    pub order_side: OrderSide,       // Long = 0, Short = 1
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub status: OrderStatus,         // Pending/Active/Triggered/Executed/Cancelled/Expired
    pub created_at: i64,
    pub triggered_at: i64,
    pub executed_at: i64,
    pub expiry: i64,
    pub feed_id: [u8; 32],           // Pyth price feed ID
    pub crank_task_id: u64,
    pub execution_price: i64,
    pub bump: u8,
}
```

**Seeds:** `["ghost_order", owner.key(), order_id.to_le_bytes()]`

---

## MagicBlock Ephemeral Rollups Macros

Both programs use MagicBlock's `ephemeral-rollups-sdk` for ER support:

```rust
use ephemeral_rollups_sdk::anchor::ephemeral;

#[ephemeral]  // Enables delegation/undelegation for all accounts
#[program]
pub mod vault {
    // ...
}
```

### Macro Effects

| Macro | Effect |
|-------|--------|
| `#[ephemeral]` | Enables account delegation to Ephemeral Rollup |

The `#[ephemeral]` macro automatically:
- Adds delegation-aware account validation
- Enables state commitment back to L1
- Supports session keypair signing in ER context

---

## Split Instruction Pattern (Swap Flow)

Jupiter integration uses a 3-phase atomic transaction:

```
┌─────────────────────────────────────────────────────────────┐
│                  Atomic Transaction                          │
├─────────────────────────────────────────────────────────────┤
│  1. pre_swap_check                                          │
│     - Validate vault not locked                             │
│     - Check cooldown elapsed                                │
│     - Verify under trade limit                              │
│     - Record balance_before_swap                            │
│     - Set swap_in_progress = true                           │
├─────────────────────────────────────────────────────────────┤
│  2. Jupiter Route Execution (external)                      │
│     - Execute via Jupiter aggregator                        │
├─────────────────────────────────────────────────────────────┤
│  3. post_swap_update                                        │
│     - Calculate actual_out = balance_after - balance_before │
│     - Determine if loss: actual_out < min_out               │
│     - Increment trades_today                                │
│     - Update last_trade_time                                │
│     - Set swap_in_progress = false                          │
└─────────────────────────────────────────────────────────────┘
```

---

## UpdateStatsArgs Structure

```rust
pub struct UpdateStatsArgs {
    pub discipline: u8,
    pub patience: u8,
    pub consistency: u8,
    pub timing: u8,
    pub risk_control: u8,
    pub endurance: u8,
    pub overall_rating: u8,
    pub total_trades: u32,
    pub total_wins: u32,
    pub total_pnl: i64,
    pub avg_trade_size: u64,
    pub trading_days: u16,
}
```

All rating fields are capped at 99.

---

## CreateGhostOrderArgs Structure

```rust
pub struct CreateGhostOrderArgs {
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: TriggerCondition,
    pub order_side: OrderSide,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry_seconds: i64,
    pub feed_id: [u8; 32],
}
```

---

## ScheduleMonitoringArgs Structure

```rust
pub struct ScheduleMonitoringArgs {
    pub task_id: u64,
    pub check_interval_millis: u64,
    pub max_iterations: u64,
}
```

---

## Key Files

### Vault Program
- `app/anchor/programs/vault/src/lib.rs` - Program entry point
- `app/anchor/programs/vault/src/state/vault.rs` - Vault account structure
- `app/anchor/programs/vault/src/state/trader_profile.rs` - Profile structure
- `app/anchor/programs/vault/src/errors.rs` - Error codes

### Ghost-Crank Program
- `app/anchor/programs/ghost-crank/src/lib.rs` - Program entry point
- `app/anchor/programs/ghost-crank/src/state/ghost_order.rs` - Order structure
- `app/anchor/programs/ghost-crank/src/instructions/execute_trigger.rs` - Drift CPI

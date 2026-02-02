use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod errors;
pub mod instructions;
pub mod state;

#[cfg(test)]
mod tests;

use instructions::*;

declare_id!("GaxNRQXHVoYJQQEmXGRWSmBRmAvt7iWBtUuYWf8f8pki");

#[ephemeral]
#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, lockout_duration: u32) -> Result<()> {
        instructions::initialize::handler(ctx, lockout_duration)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    pub fn set_rules(
        ctx: Context<SetRules>,
        daily_loss_limit: u64,
        max_trades_per_day: u8,
        lockout_duration: u32,
    ) -> Result<()> {
        instructions::set_rules::handler(ctx, daily_loss_limit, max_trades_per_day, lockout_duration)
    }

    pub fn manual_lock(ctx: Context<ManualLock>) -> Result<()> {
        instructions::manual_lock::handler(ctx)
    }

    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        instructions::unlock::handler(ctx)
    }

    pub fn swap_with_enforcement(
        ctx: Context<SwapWithEnforcement>,
        amount_in: u64,
        min_out: u64,
    ) -> Result<()> {
        instructions::swap::handler(ctx, amount_in, min_out)
    }

    pub fn pre_swap_check(
        ctx: Context<PreSwapCheck>,
        source_mint: Pubkey,
        dest_mint: Pubkey,
        amount_in: u64,
        min_out: u64,
    ) -> Result<()> {
        instructions::swap::pre_swap_check_handler(ctx, source_mint, dest_mint, amount_in, min_out)
    }

    pub fn post_swap_update(ctx: Context<PostSwapUpdate>) -> Result<()> {
        instructions::swap::post_swap_update_handler(ctx)
    }

    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        instructions::delegate::handler(ctx)
    }

    pub fn undelegate(ctx: Context<Undelegate>) -> Result<()> {
        instructions::undelegate::handler(ctx)
    }

    pub fn initialize_profile(ctx: Context<InitializeProfile>) -> Result<()> {
        instructions::initialize_profile::handler(ctx)
    }

    pub fn update_stats(ctx: Context<UpdateStats>, args: UpdateStatsArgs) -> Result<()> {
        instructions::update_stats::handler(ctx, args)
    }

    pub fn delegate_profile(ctx: Context<DelegateProfileInput>) -> Result<()> {
        instructions::delegate_profile::handler(ctx)
    }

    pub fn undelegate_profile(ctx: Context<UndelegateProfile>) -> Result<()> {
        instructions::undelegate_profile::handler(ctx)
    }
}

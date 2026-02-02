use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::state::Vault;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct PreSwapCheck<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        constraint = destination_token_account.owner == vault.key() @ VaultError::InvalidTokenAccount
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
}

pub fn pre_swap_check_handler(
    ctx: Context<PreSwapCheck>,
    source_mint: Pubkey,
    dest_mint: Pubkey,
    amount_in: u64,
    min_out: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    if vault.should_reset_session(current_time) {
        vault.reset_daily_counters(current_time);
    }

    require!(!vault.is_currently_locked(current_time), VaultError::VaultLocked);
    require!(!vault.is_in_cooldown(current_time), VaultError::CooldownActive);
    require!(
        vault.trades_today < vault.max_trades_per_day,
        VaultError::TradeLimitExceeded
    );
    require!(amount_in > 0 && min_out > 0, VaultError::InvalidAmount);
    require!(!vault.swap_in_progress, VaultError::SwapAlreadyInProgress);

    vault.swap_in_progress = true;
    vault.pending_swap_source_mint = source_mint;
    vault.pending_swap_dest_mint = dest_mint;
    vault.pending_swap_amount_in = amount_in;
    vault.pending_swap_min_out = min_out;
    vault.balance_before_swap = ctx.accounts.destination_token_account.amount;

    msg!(
        "Pre-swap check passed: {} in, min {} out, balance_before={}",
        amount_in,
        min_out,
        vault.balance_before_swap
    );

    Ok(())
}

#[derive(Accounts)]
pub struct PostSwapUpdate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        constraint = destination_token_account.owner == vault.key() @ VaultError::InvalidTokenAccount
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
}

pub fn post_swap_update_handler(ctx: Context<PostSwapUpdate>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(vault.swap_in_progress, VaultError::NoSwapInProgress);

    let balance_after = ctx.accounts.destination_token_account.amount;
    let actual_out = balance_after
        .checked_sub(vault.balance_before_swap)
        .ok_or(VaultError::ArithmeticOverflow)?;

    vault.last_trade_was_loss = actual_out < vault.pending_swap_min_out;
    vault.increment_trade()?;
    vault.last_trade_time = clock.unix_timestamp;
    vault.swap_in_progress = false;

    msg!(
        "Swap complete: {} out (min {}), loss={}",
        actual_out,
        vault.pending_swap_min_out,
        vault.last_trade_was_loss
    );

    Ok(())
}

#[derive(Accounts)]
pub struct SwapWithEnforcement<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(ctx: Context<SwapWithEnforcement>, amount_in: u64, min_out: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    if vault.should_reset_session(current_time) {
        vault.reset_daily_counters(current_time);
    }

    require!(!vault.is_currently_locked(current_time), VaultError::VaultLocked);
    require!(!vault.is_in_cooldown(current_time), VaultError::CooldownActive);
    require!(
        vault.trades_today < vault.max_trades_per_day,
        VaultError::TradeLimitExceeded
    );
    require!(amount_in > 0 && min_out > 0, VaultError::InvalidAmount);

    vault.increment_trade()?;
    vault.last_trade_time = current_time;

    msg!(
        "Pre-trade enforcement passed: {} in, min {} out",
        amount_in,
        min_out
    );

    Ok(())
}

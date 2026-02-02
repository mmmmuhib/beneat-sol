use anchor_lang::prelude::*;

use crate::state::Vault;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Vault::INIT_SPACE,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, lockout_duration: u32) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.owner = ctx.accounts.owner.key();
    vault.bump = ctx.bumps.vault;
    vault.is_locked = false;
    vault.lockout_until = 0;
    vault.lockout_count = 0;
    vault.lockout_duration = lockout_duration;
    vault.daily_loss_limit = 0;
    vault.max_trades_per_day = 0;
    vault.trades_today = 0;
    vault.session_start = clock.unix_timestamp;
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;

    Ok(())
}

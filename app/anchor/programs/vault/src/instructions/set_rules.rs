use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::Vault;

#[derive(Accounts)]
pub struct SetRules<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(
    ctx: Context<SetRules>,
    daily_loss_limit: u64,
    max_trades_per_day: u8,
    lockout_duration: u32,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    vault.daily_loss_limit = daily_loss_limit;
    vault.max_trades_per_day = max_trades_per_day;
    vault.lockout_duration = lockout_duration;

    Ok(())
}

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::Vault;

#[derive(Accounts)]
pub struct ManualLock<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(ctx: Context<ManualLock>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(vault.lockout_duration > 0, VaultError::InvalidLockoutDuration);

    vault.is_locked = true;
    vault.lockout_until = clock
        .unix_timestamp
        .checked_add(vault.lockout_duration as i64)
        .ok_or(VaultError::ArithmeticOverflow)?;
    vault.lockout_count = vault
        .lockout_count
        .checked_add(1)
        .ok_or(VaultError::ArithmeticOverflow)?;

    Ok(())
}

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Unlock<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(ctx: Context<Unlock>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp >= vault.lockout_until,
        VaultError::LockoutNotExpired
    );

    vault.is_locked = false;
    vault.lockout_until = 0;

    Ok(())
}

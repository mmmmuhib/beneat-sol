use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::Vault;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(!vault.is_currently_locked(clock.unix_timestamp), VaultError::VaultLocked);
    require!(amount > 0, VaultError::InvalidAmount);

    let vault_lamports = vault.to_account_info().lamports();
    let rent = Rent::get()?.minimum_balance(8 + Vault::INIT_SPACE);
    let available = vault_lamports.saturating_sub(rent);

    require!(amount <= available, VaultError::InsufficientFunds);

    vault.sub_lamports(amount)?;
    ctx.accounts.owner.add_lamports(amount)?;

    vault.total_withdrawn = vault
        .total_withdrawn
        .checked_add(amount)
        .ok_or(VaultError::ArithmeticOverflow)?;

    Ok(())
}

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::TraderProfile;

pub fn handler(ctx: Context<DelegateProfileInput>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let seeds = &[TraderProfile::SEED_PREFIX, authority_key.as_ref()];

    ctx.accounts.delegate_profile(
        &ctx.accounts.authority,
        seeds,
        DelegateConfig::default(),
    )?;

    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateProfileInput<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The PDA to delegate
    #[account(
        mut,
        del,
        seeds = [TraderProfile::SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub profile: AccountInfo<'info>,
}

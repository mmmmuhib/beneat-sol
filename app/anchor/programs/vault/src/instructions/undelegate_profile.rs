use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use crate::state::TraderProfile;

pub fn handler(ctx: Context<UndelegateProfile>) -> Result<()> {
    commit_and_undelegate_accounts(
        &ctx.accounts.authority,
        vec![&ctx.accounts.profile.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [TraderProfile::SEED_PREFIX, authority.key().as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, TraderProfile>,
}

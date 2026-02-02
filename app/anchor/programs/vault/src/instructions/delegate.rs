use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::Vault;

pub fn handler(ctx: Context<DelegateInput>) -> Result<()> {
    let owner_key = ctx.accounts.owner.key();
    let seeds = &[Vault::SEED_PREFIX, owner_key.as_ref()];
    
    ctx.accounts.delegate_vault(
        &ctx.accounts.owner,
        seeds,
        DelegateConfig::default(),
    )?;
    
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: The PDA to delegate
    #[account(
        mut, 
        del, 
        seeds = [Vault::SEED_PREFIX, owner.key().as_ref()], 
        bump
    )]
    pub vault: AccountInfo<'info>,
}

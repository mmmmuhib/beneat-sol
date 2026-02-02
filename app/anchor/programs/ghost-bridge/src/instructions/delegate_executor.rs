use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::ExecutorAuthority;
use crate::errors::GhostBridgeError;

pub fn handler(ctx: Context<DelegateExecutor>) -> Result<()> {
    let executor = &ctx.accounts.executor_authority_data;

    require!(!executor.is_delegated, GhostBridgeError::ExecutorDelegated);

    let owner_key = ctx.accounts.owner.key();
    let seeds = &[ExecutorAuthority::SEED_PREFIX, owner_key.as_ref()];

    ctx.accounts.delegate_executor_authority(
        &ctx.accounts.owner,
        seeds,
        DelegateConfig::default(),
    )?;

    msg!(
        "ExecutorAuthority delegated to Ephemeral Rollup for owner: {}",
        owner_key
    );

    Ok(())
}

pub fn post_delegate_handler(ctx: Context<PostDelegateExecutor>) -> Result<()> {
    let executor = &mut ctx.accounts.executor_authority;
    executor.is_delegated = true;

    msg!("ExecutorAuthority delegation confirmed");
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateExecutor<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority_data.bump,
        constraint = executor_authority_data.owner == owner.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority_data: Account<'info, ExecutorAuthority>,

    /// CHECK: The PDA to delegate - must match executor_authority_data
    #[account(
        mut,
        del,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority_data.bump
    )]
    pub executor_authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PostDelegateExecutor<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority.bump,
        constraint = executor_authority.owner == owner.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,
}

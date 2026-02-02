use anchor_lang::prelude::*;
use crate::state::ExecutorAuthority;

pub fn handler(ctx: Context<InitExecutor>) -> Result<()> {
    let executor = &mut ctx.accounts.executor_authority;

    executor.owner = ctx.accounts.owner.key();
    executor.order_count = 0;
    executor.is_delegated = false;
    executor.bump = ctx.bumps.executor_authority;
    executor.order_hashes = [[0u8; 32]; 16];
    executor.order_hash_count = 0;

    msg!(
        "ExecutorAuthority initialized for owner: {}",
        ctx.accounts.owner.key()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct InitExecutor<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = ExecutorAuthority::LEN,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    pub system_program: Program<'info, System>,
}

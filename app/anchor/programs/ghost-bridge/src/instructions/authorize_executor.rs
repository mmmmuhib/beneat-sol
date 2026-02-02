use anchor_lang::prelude::*;
use crate::state::ExecutorAuthority;
use crate::errors::GhostBridgeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AuthorizeExecutorArgs {
    pub executor: Pubkey,
    pub authorize: bool,
}

pub fn handler(ctx: Context<AuthorizeExecutor>, args: AuthorizeExecutorArgs) -> Result<()> {
    let executor_authority = &mut ctx.accounts.executor_authority;

    if args.authorize {
        executor_authority.add_authorized_executor(args.executor)?;
        msg!("Authorized executor: {}", args.executor);
    } else {
        executor_authority.remove_authorized_executor(args.executor)?;
        msg!("Revoked executor: {}", args.executor);
    }

    emit!(ExecutorAuthorizationChanged {
        owner: ctx.accounts.owner.key(),
        executor: args.executor,
        authorized: args.authorize,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AuthorizeExecutor<'info> {
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

#[event]
pub struct ExecutorAuthorizationChanged {
    pub owner: Pubkey,
    pub executor: Pubkey,
    pub authorized: bool,
}

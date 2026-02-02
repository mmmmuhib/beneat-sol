use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{
    CommitAndUndelegate, CommitType, MagicAction, MagicInstructionBuilder, UndelegateType,
};
use crate::state::ExecutorAuthority;
use crate::errors::GhostBridgeError;

pub fn handler(ctx: Context<UndelegateExecutor>) -> Result<()> {
    require!(
        ctx.accounts.executor_authority.is_delegated,
        GhostBridgeError::ExecutorNotDelegated
    );

    let owner = ctx.accounts.executor_authority.owner;

    ctx.accounts.executor_authority.is_delegated = false;

    let executor_account_info = ctx.accounts.executor_authority.to_account_info();

    let magic_builder = MagicInstructionBuilder {
        payer: ctx.accounts.payer.to_account_info(),
        magic_context: ctx.accounts.magic_context.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        magic_action: MagicAction::CommitAndUndelegate(CommitAndUndelegate {
            commit_type: CommitType::Standalone(vec![executor_account_info]),
            undelegate_type: UndelegateType::Standalone,
        }),
    };

    magic_builder.build_and_invoke()?;

    msg!("ExecutorAuthority undelegated for owner: {}", owner);

    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateExecutor<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, executor_authority.owner.as_ref()],
        bump = executor_authority.bump
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    /// CHECK: Magic context account for ER commit operations
    pub magic_context: AccountInfo<'info>,

    /// CHECK: Magic program for ER operations
    pub magic_program: AccountInfo<'info>,
}

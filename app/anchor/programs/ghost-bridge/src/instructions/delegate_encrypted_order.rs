use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::{EncryptedOrder, ExecutorAuthority};
use crate::errors::GhostBridgeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DelegateEncryptedOrderArgs {
    pub order_hash: [u8; 32],
}

pub fn handler(ctx: Context<DelegateEncryptedOrder>, args: DelegateEncryptedOrderArgs) -> Result<()> {
    ctx.accounts.delegate_encrypted_order(
        &ctx.accounts.payer,
        &[
            EncryptedOrder::SEED_PREFIX,
            ctx.accounts.payer.key().as_ref(),
            &args.order_hash,
        ],
        DelegateConfig::default(),
    )?;

    msg!(
        "Encrypted order delegated to ER: hash={:?}",
        &args.order_hash[..8]
    );

    emit!(EncryptedOrderDelegated {
        owner: ctx.accounts.payer.key(),
        order_hash: args.order_hash,
    });

    Ok(())
}

#[delegate]
#[derive(Accounts)]
#[instruction(args: DelegateEncryptedOrderArgs)]
pub struct DelegateEncryptedOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Account to delegate - uses del constraint, validated via PDA seeds
    #[account(mut, del,
        seeds = [EncryptedOrder::SEED_PREFIX, payer.key().as_ref(), &args.order_hash],
        bump
    )]
    pub encrypted_order: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, payer.key().as_ref()],
        bump = executor_authority.bump,
        constraint = executor_authority.owner == payer.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,
}

#[event]
pub struct EncryptedOrderDelegated {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
}

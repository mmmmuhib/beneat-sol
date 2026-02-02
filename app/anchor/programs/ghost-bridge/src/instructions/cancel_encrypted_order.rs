use anchor_lang::prelude::*;
use crate::state::{EncryptedOrder, EncryptedOrderStatus, ExecutorAuthority};
use crate::errors::GhostBridgeError;

pub fn handler(ctx: Context<CancelEncryptedOrder>) -> Result<()> {
    let encrypted_order = &mut ctx.accounts.encrypted_order;
    let executor = &mut ctx.accounts.executor_authority;

    require!(
        encrypted_order.status == EncryptedOrderStatus::Active,
        GhostBridgeError::InvalidOrderData
    );

    executor.remove_order_hash(encrypted_order.order_hash)?;

    encrypted_order.status = EncryptedOrderStatus::Cancelled;

    msg!(
        "Encrypted order cancelled: hash={:?}",
        &encrypted_order.order_hash[..8]
    );

    emit!(EncryptedOrderCancelled {
        owner: ctx.accounts.owner.key(),
        order_hash: encrypted_order.order_hash,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CancelEncryptedOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = encrypted_order.owner == owner.key() @ GhostBridgeError::Unauthorized,
        constraint = encrypted_order.status == EncryptedOrderStatus::Active @ GhostBridgeError::InvalidOrderData
    )]
    pub encrypted_order: Account<'info, EncryptedOrder>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority.bump,
        constraint = executor_authority.owner == owner.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,
}

#[event]
pub struct EncryptedOrderCancelled {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
}

use anchor_lang::prelude::*;
use crate::state::{EncryptedOrder, EncryptedOrderStatus};
use crate::errors::GhostBridgeError;

pub fn handler(ctx: Context<CloseEncryptedOrder>) -> Result<()> {
    let encrypted_order = &ctx.accounts.encrypted_order;

    require!(
        encrypted_order.status == EncryptedOrderStatus::Executed ||
        encrypted_order.status == EncryptedOrderStatus::Cancelled,
        GhostBridgeError::InvalidOrderData
    );

    msg!(
        "Encrypted order closed: hash={:?}, rent returned to owner",
        &encrypted_order.order_hash[..8]
    );

    emit!(EncryptedOrderClosed {
        owner: ctx.accounts.owner.key(),
        order_hash: encrypted_order.order_hash,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseEncryptedOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        constraint = encrypted_order.owner == owner.key() @ GhostBridgeError::Unauthorized,
        constraint = (
            encrypted_order.status == EncryptedOrderStatus::Executed ||
            encrypted_order.status == EncryptedOrderStatus::Cancelled
        ) @ GhostBridgeError::InvalidOrderData
    )]
    pub encrypted_order: Account<'info, EncryptedOrder>,
}

#[event]
pub struct EncryptedOrderClosed {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
}

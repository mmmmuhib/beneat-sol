use anchor_lang::prelude::*;
use crate::state::{GhostOrder, OrderStatus};

pub fn handler(ctx: Context<CancelOrder>) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;

    require!(
        ghost_order.status == OrderStatus::Pending ||
        ghost_order.status == OrderStatus::Active,
        CancelError::OrderNotCancellable
    );

    ghost_order.status = OrderStatus::Cancelled;

    msg!("Ghost order cancelled: id={}", ghost_order.order_id);

    Ok(())
}

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, owner.key().as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.owner == owner.key() @ CancelError::NotOwner
    )]
    pub ghost_order: Account<'info, GhostOrder>,
}

#[error_code]
pub enum CancelError {
    #[msg("Only the owner can cancel the order")]
    NotOwner,
    #[msg("Order cannot be cancelled in current status")]
    OrderNotCancellable,
}

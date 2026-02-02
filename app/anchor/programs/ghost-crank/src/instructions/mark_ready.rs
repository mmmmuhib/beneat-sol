use anchor_lang::prelude::*;
use crate::state::{GhostOrder, OrderStatus};

/// Called inside ER action when trigger condition is met.
/// Only writes ready flag + commitment - no plaintext order params.
pub fn handler(ctx: Context<MarkReady>, execution_price: i64) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    let clock = Clock::get()?;

    require!(
        ghost_order.status == OrderStatus::Triggered,
        MarkReadyError::NotTriggered
    );

    ghost_order.status = OrderStatus::ReadyToExecute;
    ghost_order.execution_price = execution_price;
    // 100 slots (~40 seconds) to execute before expiry
    ghost_order.ready_expires_at = clock.slot as i64 + 100;

    msg!(
        "Ghost order marked ready: id={}, expires_at_slot={}",
        ghost_order.order_id,
        ghost_order.ready_expires_at
    );

    Ok(())
}

#[derive(Accounts)]
pub struct MarkReady<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.status == OrderStatus::Triggered @ MarkReadyError::NotTriggered
    )]
    pub ghost_order: Account<'info, GhostOrder>,
}

#[error_code]
pub enum MarkReadyError {
    #[msg("Order has not been triggered yet")]
    NotTriggered,
    #[msg("Order is already ready or executed")]
    AlreadyReady,
}

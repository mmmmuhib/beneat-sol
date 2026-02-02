use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::state::{GhostOrder, OrderStatus};

pub fn handler(ctx: Context<DelegateOrder>) -> Result<()> {
    let owner_key = ctx.accounts.owner.key();
    let order_id_bytes = ctx.accounts.ghost_order_data.order_id.to_le_bytes();
    let seeds = &[
        GhostOrder::SEED_PREFIX,
        owner_key.as_ref(),
        order_id_bytes.as_ref(),
    ];

    ctx.accounts.delegate_ghost_order(
        &ctx.accounts.owner,
        seeds,
        DelegateConfig::default(),
    )?;

    msg!("Ghost order delegated to Ephemeral Rollup");
    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [GhostOrder::SEED_PREFIX, owner.key().as_ref(), &ghost_order_data.order_id.to_le_bytes()],
        bump = ghost_order_data.bump
    )]
    pub ghost_order_data: Account<'info, GhostOrder>,

    /// CHECK: The PDA to delegate - must match ghost_order_data
    #[account(
        mut,
        del,
        seeds = [GhostOrder::SEED_PREFIX, owner.key().as_ref(), &ghost_order_data.order_id.to_le_bytes()],
        bump = ghost_order_data.bump
    )]
    pub ghost_order: AccountInfo<'info>,
}

pub fn activate_handler(ctx: Context<ActivateOrder>) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    ghost_order.status = OrderStatus::Active;

    msg!("Ghost order activated: id={}", ghost_order.order_id);
    Ok(())
}

#[derive(Accounts)]
pub struct ActivateOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, owner.key().as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.owner == owner.key(),
        constraint = ghost_order.status == OrderStatus::Pending
    )]
    pub ghost_order: Account<'info, GhostOrder>,
}

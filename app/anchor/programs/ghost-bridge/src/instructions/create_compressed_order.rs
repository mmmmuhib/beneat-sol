use anchor_lang::prelude::*;
use crate::state::{CompressedGhostOrder, ExecutorAuthority, TriggerCondition, OrderSide};
use crate::errors::GhostBridgeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateCompressedOrderArgs {
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: u8,
    pub order_side: u8,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry_seconds: i64,
    pub feed_id: [u8; 32],
    pub salt: [u8; 16],
}

pub fn handler(ctx: Context<CreateCompressedOrder>, args: CreateCompressedOrderArgs) -> Result<()> {
    let executor = &mut ctx.accounts.executor_authority;
    let clock = Clock::get()?;

    let trigger_condition = match args.trigger_condition {
        0 => TriggerCondition::Above,
        1 => TriggerCondition::Below,
        _ => return Err(GhostBridgeError::InvalidTriggerCondition.into()),
    };

    let order_side = match args.order_side {
        0 => OrderSide::Long,
        1 => OrderSide::Short,
        _ => return Err(GhostBridgeError::InvalidOrderData.into()),
    };

    let expiry = if args.expiry_seconds > 0 {
        clock.unix_timestamp + args.expiry_seconds
    } else {
        0
    };

    let order = CompressedGhostOrder {
        owner: ctx.accounts.owner.key(),
        order_id: args.order_id,
        market_index: args.market_index,
        trigger_price: args.trigger_price,
        trigger_condition,
        order_side,
        base_asset_amount: args.base_asset_amount,
        reduce_only: args.reduce_only,
        expiry,
        feed_id: args.feed_id,
        salt: args.salt,
    };

    let order_hash = order.compute_hash();

    executor.add_order_hash(order_hash)?;

    msg!(
        "Compressed ghost order created: order_id={}, hash={:?}",
        args.order_id,
        &order_hash[..8]
    );

    emit!(CompressedOrderCreated {
        owner: ctx.accounts.owner.key(),
        order_id: args.order_id,
        order_hash,
        market_index: args.market_index,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateCompressedOrderArgs)]
pub struct CreateCompressedOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority.bump,
        constraint = executor_authority.owner == owner.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct CompressedOrderCreated {
    pub owner: Pubkey,
    pub order_id: u64,
    pub order_hash: [u8; 32],
    pub market_index: u16,
}

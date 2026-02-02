use anchor_lang::prelude::*;
use crate::state::{GhostOrder, TriggerCondition, OrderSide, OrderStatus};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateGhostOrderArgs {
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: TriggerCondition,
    pub order_side: OrderSide,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry_seconds: i64,
    pub feed_id: [u8; 32],
    // Commitment fields
    pub params_commitment: [u8; 32],
    pub nonce: u64,
    pub drift_user: Pubkey,
}

pub fn handler(ctx: Context<CreateGhostOrder>, args: CreateGhostOrderArgs) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    let clock = Clock::get()?;

    // Derive delegate PDA for this user
    let (delegate_pda, delegate_bump) = GhostOrder::derive_delegate_pda(
        &ctx.accounts.owner.key(),
        ctx.program_id,
    );

    ghost_order.owner = ctx.accounts.owner.key();
    ghost_order.order_id = args.order_id;
    ghost_order.market_index = args.market_index;
    ghost_order.trigger_price = args.trigger_price;
    ghost_order.trigger_condition = args.trigger_condition;
    ghost_order.order_side = args.order_side;
    ghost_order.base_asset_amount = args.base_asset_amount;
    ghost_order.reduce_only = args.reduce_only;
    ghost_order.status = OrderStatus::Pending;
    ghost_order.created_at = clock.unix_timestamp;
    ghost_order.triggered_at = 0;
    ghost_order.executed_at = 0;
    ghost_order.expiry = if args.expiry_seconds > 0 {
        clock.unix_timestamp + args.expiry_seconds
    } else {
        0
    };
    ghost_order.feed_id = args.feed_id;
    ghost_order.crank_task_id = 0;
    ghost_order.execution_price = 0;
    ghost_order.bump = ctx.bumps.ghost_order;

    // Set commitment fields
    ghost_order.params_commitment = args.params_commitment;
    ghost_order.nonce = args.nonce;
    ghost_order.ready_expires_at = 0;
    ghost_order.delegate_pda = delegate_pda;
    ghost_order.delegate_bump = delegate_bump;
    ghost_order.drift_user = args.drift_user;

    msg!("Ghost order created: id={}, trigger_price={}, condition={:?}, commitment={:?}",
         args.order_id, args.trigger_price, args.trigger_condition,
         &args.params_commitment[..8]);

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateGhostOrderArgs)]
pub struct CreateGhostOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = GhostOrder::LEN,
        seeds = [GhostOrder::SEED_PREFIX, owner.key().as_ref(), &args.order_id.to_le_bytes()],
        bump
    )]
    pub ghost_order: Account<'info, GhostOrder>,

    pub system_program: Program<'info, System>,
}

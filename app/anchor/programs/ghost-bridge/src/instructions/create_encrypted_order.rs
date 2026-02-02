use anchor_lang::prelude::*;
use crate::state::{EncryptedOrder, EncryptedOrderStatus, ExecutorAuthority, MAX_ENCRYPTED_DATA_LEN};
use crate::errors::GhostBridgeError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateEncryptedOrderArgs {
    pub order_hash: [u8; 32],
    pub encrypted_data: Vec<u8>,
    pub feed_id: [u8; 32],
}

pub fn handler(ctx: Context<CreateEncryptedOrder>, args: CreateEncryptedOrderArgs) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        args.encrypted_data.len() <= MAX_ENCRYPTED_DATA_LEN,
        GhostBridgeError::InvalidOrderData
    );

    require!(
        args.encrypted_data.len() > 0,
        GhostBridgeError::InvalidOrderData
    );

    let executor = &mut ctx.accounts.executor_authority;
    executor.add_order_hash(args.order_hash)?;

    let encrypted_order = &mut ctx.accounts.encrypted_order;
    encrypted_order.owner = ctx.accounts.owner.key();
    encrypted_order.order_hash = args.order_hash;
    encrypted_order.executor_authority = ctx.accounts.executor_authority.key();
    encrypted_order.data_len = args.encrypted_data.len() as u16;
    encrypted_order.encrypted_data[..args.encrypted_data.len()].copy_from_slice(&args.encrypted_data);
    encrypted_order.feed_id = args.feed_id;
    encrypted_order.created_at = clock.unix_timestamp;
    encrypted_order.triggered_at = 0;
    encrypted_order.execution_price = 0;
    encrypted_order.status = EncryptedOrderStatus::Active;
    encrypted_order.bump = ctx.bumps.encrypted_order;

    msg!(
        "Encrypted order created: hash={:?}, feed={:?}, data_len={}",
        &args.order_hash[..8],
        &args.feed_id[..8],
        args.encrypted_data.len()
    );

    emit!(EncryptedOrderCreated {
        owner: ctx.accounts.owner.key(),
        order_hash: args.order_hash,
        feed_id: args.feed_id,
        created_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateEncryptedOrderArgs)]
pub struct CreateEncryptedOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, owner.key().as_ref()],
        bump = executor_authority.bump,
        constraint = executor_authority.owner == owner.key() @ GhostBridgeError::Unauthorized
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    #[account(
        init,
        payer = owner,
        space = EncryptedOrder::LEN,
        seeds = [EncryptedOrder::SEED_PREFIX, owner.key().as_ref(), &args.order_hash],
        bump
    )]
    pub encrypted_order: Account<'info, EncryptedOrder>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct EncryptedOrderCreated {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
    pub feed_id: [u8; 32],
    pub created_at: i64,
}

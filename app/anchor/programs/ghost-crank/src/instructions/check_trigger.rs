use anchor_lang::prelude::*;
use crate::state::{GhostOrder, OrderStatus};

pub fn handler(ctx: Context<CheckTrigger>) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    let clock = Clock::get()?;

    if !ghost_order.is_active() {
        msg!("Order not active, skipping check");
        return Ok(());
    }

    if ghost_order.is_expired(clock.unix_timestamp) {
        ghost_order.status = OrderStatus::Expired;
        msg!("Order expired: id={}", ghost_order.order_id);
        return Ok(());
    }

    let current_price = read_pyth_price(&ctx.accounts.price_feed)?;

    msg!("Checking trigger: current_price={}, trigger_price={}, condition={:?}",
         current_price, ghost_order.trigger_price, ghost_order.trigger_condition);

    if ghost_order.check_trigger(current_price) {
        ghost_order.status = OrderStatus::Triggered;
        ghost_order.triggered_at = clock.unix_timestamp;
        ghost_order.execution_price = current_price;

        msg!("TRIGGER FIRED! Order {} triggered at price {}",
             ghost_order.order_id, current_price);
    }

    Ok(())
}

fn read_pyth_price(price_feed: &AccountInfo) -> Result<i64> {
    let data = price_feed.try_borrow_data()?;

    if data.len() < 32 {
        msg!("Invalid price feed data length");
        return Ok(0);
    }

    let price_offset = 8;
    if data.len() < price_offset + 8 {
        return Ok(0);
    }

    let price_bytes: [u8; 8] = data[price_offset..price_offset + 8]
        .try_into()
        .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;

    let price = i64::from_le_bytes(price_bytes);

    Ok(price)
}

#[derive(Accounts)]
pub struct CheckTrigger<'info> {
    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump
    )]
    pub ghost_order: Account<'info, GhostOrder>,

    /// CHECK: Pyth Lazer price feed account
    pub price_feed: AccountInfo<'info>,
}

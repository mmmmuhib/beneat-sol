use anchor_lang::prelude::*;
use crate::state::{EncryptedOrder, EncryptedOrderStatus};

pub fn handler(ctx: Context<CheckPriceUpdate>) -> Result<()> {
    let encrypted_order = &ctx.accounts.encrypted_order;

    if encrypted_order.status != EncryptedOrderStatus::Active {
        return Ok(());
    }

    let current_price = read_pyth_price(&ctx.accounts.price_feed)?;

    emit!(PriceUpdateChecked {
        order_hash: encrypted_order.order_hash,
        feed_id: encrypted_order.feed_id,
        current_price,
    });

    Ok(())
}

fn read_pyth_price(price_feed: &AccountInfo) -> Result<i64> {
    use crate::constants::PYTH_RECEIVER_ID;
    use crate::errors::GhostBridgeError;

    if price_feed.owner != &PYTH_RECEIVER_ID {
        msg!(
            "Invalid price feed owner: expected {}, got {}",
            PYTH_RECEIVER_ID,
            price_feed.owner
        );
        return Err(GhostBridgeError::InvalidPriceFeed.into());
    }

    let data = price_feed.try_borrow_data()?;

    if data.len() < 64 {
        msg!("Price feed data too short: {} bytes", data.len());
        return Err(GhostBridgeError::InvalidPriceFeed.into());
    }

    let magic = &data[0..4];
    if magic != b"PYTH" && magic != [0x50, 0x32, 0x55, 0x56] {
        msg!("Invalid price feed magic bytes");
        return Err(GhostBridgeError::InvalidPriceFeed.into());
    }

    let price_offset = 32 + 8;
    if data.len() < price_offset + 8 {
        msg!("Price feed missing price data at expected offset");
        return Err(GhostBridgeError::InvalidPriceFeed.into());
    }

    let price_bytes: [u8; 8] = data[price_offset..price_offset + 8]
        .try_into()
        .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;

    Ok(i64::from_le_bytes(price_bytes))
}

#[derive(Accounts)]
pub struct CheckPriceUpdate<'info> {
    #[account(
        constraint = encrypted_order.status == EncryptedOrderStatus::Active
    )]
    pub encrypted_order: Account<'info, EncryptedOrder>,

    /// CHECK: Pyth price feed account
    pub price_feed: AccountInfo<'info>,
}

#[event]
pub struct PriceUpdateChecked {
    pub order_hash: [u8; 32],
    pub feed_id: [u8; 32],
    pub current_price: i64,
}

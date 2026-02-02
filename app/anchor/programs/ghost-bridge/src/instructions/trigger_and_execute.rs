use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{
    CallHandler, CommitAndUndelegate, CommitType, MagicAction, MagicInstructionBuilder,
    UndelegateType,
};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use crate::state::{
    EncryptedOrder, EncryptedOrderStatus, ExecutorAuthority,
    CompressedGhostOrder, TriggerCondition, OrderSide,
};
use crate::errors::GhostBridgeError;
use crate::constants::{DRIFT_PROGRAM_ID, DELEGATION_PROGRAM_ID};
use crate::drift_cpi::build_drift_place_perp_order;

pub const DRIFT_EXECUTE_COMPUTE_UNITS: u32 = 200_000;
pub const DELEGATE_COMPUTE_UNITS: u32 = 50_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TriggerAndExecuteArgs {
    pub salt: [u8; 16],
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: u8,
    pub order_side: u8,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry: i64,
    pub redelegate_after: bool,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, TriggerAndExecute<'info>>,
    args: TriggerAndExecuteArgs,
) -> Result<()> {
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

    let owner = ctx.accounts.encrypted_order.owner;
    let stored_hash = ctx.accounts.encrypted_order.order_hash;
    let feed_id = ctx.accounts.encrypted_order.feed_id;
    let status = ctx.accounts.encrypted_order.status;

    require!(
        status == EncryptedOrderStatus::Active,
        GhostBridgeError::OrderNotActive
    );

    require!(
        ctx.accounts.executor_authority.is_authorized_executor(&ctx.accounts.payer.key())
            || ctx.accounts.executor_authority.owner == ctx.accounts.payer.key(),
        GhostBridgeError::ExecutorNotAuthorized
    );

    let order = CompressedGhostOrder {
        owner,
        order_id: args.order_id,
        market_index: args.market_index,
        trigger_price: args.trigger_price,
        trigger_condition,
        order_side,
        base_asset_amount: args.base_asset_amount,
        reduce_only: args.reduce_only,
        expiry: args.expiry,
        feed_id,
        salt: args.salt,
    };

    let computed_hash = order.compute_hash();
    require!(
        computed_hash == stored_hash,
        GhostBridgeError::OrderHashMismatch
    );

    if order.is_expired(clock.unix_timestamp) {
        ctx.accounts.encrypted_order.status = EncryptedOrderStatus::Cancelled;
        msg!("Order expired: hash={:?}", &stored_hash[..8]);
        return Ok(());
    }

    let current_price = read_pyth_price(&ctx.accounts.price_feed)?;

    msg!(
        "Checking trigger: current={}, trigger={}, condition={:?}",
        current_price,
        args.trigger_price,
        trigger_condition
    );

    if !order.check_trigger(current_price) {
        msg!("Trigger condition not met, skipping execution");
        return Ok(());
    }

    msg!("TRIGGER FIRED! Initiating atomic undelegate+execute+redelegate");

    require!(
        ctx.accounts.executor_authority.has_order_hash(&computed_hash),
        GhostBridgeError::OrderHashNotFound
    );

    ctx.accounts.executor_authority.remove_order_hash(computed_hash)?;
    ctx.accounts.encrypted_order.status = EncryptedOrderStatus::Executed;
    ctx.accounts.encrypted_order.triggered_at = clock.unix_timestamp;
    ctx.accounts.encrypted_order.execution_price = current_price;

    let drift_ix_data = build_drift_place_perp_order(
        args.market_index,
        order_side,
        args.base_asset_amount,
        args.reduce_only,
    );

    let drift_accounts = build_drift_short_account_metas(
        ctx.accounts.drift_state.key(),
        ctx.accounts.drift_user.key(),
        ctx.accounts.drift_user_stats.key(),
        ctx.accounts.drift_authority.key(),
        ctx.accounts.perp_market.key(),
        ctx.accounts.oracle.key(),
    );

    let drift_call_handler = CallHandler {
        destination_program: DRIFT_PROGRAM_ID,
        accounts: drift_accounts,
        args: ActionArgs::new(drift_ix_data),
        escrow_authority: ctx.accounts.payer.to_account_info(),
        compute_units: DRIFT_EXECUTE_COMPUTE_UNITS,
    };

    let call_handlers = if args.redelegate_after {
        let redelegate_handler = build_redelegate_handler(
            ctx.accounts.payer.to_account_info(),
            ctx.remaining_accounts,
            ctx.accounts.encrypted_order.key(),
            owner,
        )?;
        vec![drift_call_handler, redelegate_handler]
    } else {
        vec![drift_call_handler]
    };

    let encrypted_order_info = ctx.accounts.encrypted_order.to_account_info();
    let executor_info = ctx.accounts.executor_authority.to_account_info();

    let magic_action = MagicAction::CommitAndUndelegate(CommitAndUndelegate {
        commit_type: CommitType::WithHandler {
            commited_accounts: vec![encrypted_order_info, executor_info],
            call_handlers,
        },
        undelegate_type: UndelegateType::Standalone,
    });

    let magic_builder = MagicInstructionBuilder {
        payer: ctx.accounts.payer.to_account_info(),
        magic_context: ctx.accounts.magic_context.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        magic_action,
    };

    magic_builder.build_and_invoke()?;

    emit!(OrderTriggeredAndExecuted {
        owner,
        order_hash: computed_hash,
        market_index: args.market_index,
        order_side: args.order_side,
        base_asset_amount: args.base_asset_amount,
        trigger_price: args.trigger_price,
        execution_price: current_price,
        executed_at: clock.unix_timestamp,
        redelegated: args.redelegate_after,
    });

    msg!(
        "Order executed: hash={:?}, market={}, price={}",
        &computed_hash[..8],
        args.market_index,
        current_price
    );

    Ok(())
}

fn build_redelegate_handler<'info>(
    payer: AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    encrypted_order_key: Pubkey,
    _owner: Pubkey,
) -> Result<CallHandler<'info>> {
    if remaining_accounts.len() < 3 {
        msg!("Skipping redelegation: missing delegation PDAs");
        return Err(GhostBridgeError::MagicActionFailed.into());
    }

    let buffer_pda = &remaining_accounts[0];
    let record_pda = &remaining_accounts[1];
    let metadata_pda = &remaining_accounts[2];

    let delegate_ix_data = build_delegate_instruction_data();

    let delegate_accounts = vec![
        ShortAccountMeta {
            pubkey: payer.key(),
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: encrypted_order_key,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: buffer_pda.key(),
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: record_pda.key(),
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: metadata_pda.key(),
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: anchor_lang::solana_program::system_program::ID,
            is_writable: false,
        },
    ];

    Ok(CallHandler {
        destination_program: DELEGATION_PROGRAM_ID,
        accounts: delegate_accounts,
        args: ActionArgs::new(delegate_ix_data),
        escrow_authority: payer,
        compute_units: DELEGATE_COMPUTE_UNITS,
    })
}

fn build_delegate_instruction_data() -> Vec<u8> {
    let mut data = Vec::with_capacity(16);
    let discriminator: [u8; 8] = [0x90, 0xf6, 0x7a, 0x11, 0x7e, 0x8c, 0x4f, 0x00];
    data.extend_from_slice(&discriminator);
    data.extend_from_slice(&0u64.to_le_bytes());
    data
}


fn build_drift_short_account_metas(
    drift_state_key: Pubkey,
    drift_user_key: Pubkey,
    drift_user_stats_key: Pubkey,
    authority_key: Pubkey,
    perp_market_key: Pubkey,
    oracle_key: Pubkey,
) -> Vec<ShortAccountMeta> {
    vec![
        ShortAccountMeta {
            pubkey: drift_state_key,
            is_writable: false,
        },
        ShortAccountMeta {
            pubkey: drift_user_key,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: authority_key,
            is_writable: false,
        },
        ShortAccountMeta {
            pubkey: drift_user_stats_key,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: perp_market_key,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: oracle_key,
            is_writable: false,
        },
    ]
}

fn read_pyth_price(price_feed: &AccountInfo) -> Result<i64> {
    use crate::constants::PYTH_RECEIVER_ID;

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

#[commit]
#[derive(Accounts)]
pub struct TriggerAndExecute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub encrypted_order: Account<'info, EncryptedOrder>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, encrypted_order.owner.as_ref()],
        bump = executor_authority.bump
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    /// CHECK: Pyth price feed for trigger comparison
    pub price_feed: AccountInfo<'info>,

    /// CHECK: Drift program state account
    pub drift_state: AccountInfo<'info>,

    /// CHECK: Drift user account for the order owner
    #[account(mut)]
    pub drift_user: AccountInfo<'info>,

    /// CHECK: Drift user stats account
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,

    /// CHECK: Authority for the Drift user (order owner)
    pub drift_authority: AccountInfo<'info>,

    /// CHECK: Perp market account for the order
    #[account(mut)]
    pub perp_market: AccountInfo<'info>,

    /// CHECK: Oracle account for the market
    pub oracle: AccountInfo<'info>,

    /// CHECK: Magic context account for ER commit operations
    pub magic_context: AccountInfo<'info>,

    /// CHECK: Magic program for ER operations
    pub magic_program: AccountInfo<'info>,
}

#[event]
pub struct OrderTriggeredAndExecuted {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
    pub market_index: u16,
    pub order_side: u8,
    pub base_asset_amount: u64,
    pub trigger_price: i64,
    pub execution_price: i64,
    pub executed_at: i64,
    pub redelegated: bool,
}

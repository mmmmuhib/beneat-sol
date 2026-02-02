use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{
    CallHandler, CommitAndUndelegate, CommitType, MagicAction, MagicInstructionBuilder,
    UndelegateType,
};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use crate::state::{CompressedGhostOrder, ExecutorAuthority, TriggerCondition, OrderSide};
use crate::errors::GhostBridgeError;
use crate::constants::DRIFT_PROGRAM_ID;
use crate::drift_cpi::build_drift_place_perp_order;

pub const DRIFT_EXECUTE_COMPUTE_UNITS: u32 = 200_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConsumeAndExecuteArgs {
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: u8,
    pub order_side: u8,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry: i64,
    pub feed_id: [u8; 32],
    pub salt: [u8; 16],
    pub current_price: i64,
    pub keep_delegated: bool,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ConsumeAndExecute<'info>>,
    args: ConsumeAndExecuteArgs,
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

    let owner = ctx.accounts.executor_authority.owner;

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
        feed_id: args.feed_id,
        salt: args.salt,
    };

    let order_hash = order.compute_hash();

    require!(
        ctx.accounts.executor_authority.has_order_hash(&order_hash),
        GhostBridgeError::OrderHashNotFound
    );

    require!(
        !order.is_expired(clock.unix_timestamp),
        GhostBridgeError::OrderExpired
    );

    require!(
        order.check_trigger(args.current_price),
        GhostBridgeError::TriggerConditionNotMet
    );

    ctx.accounts.executor_authority.remove_order_hash(order_hash)?;

    if !args.keep_delegated {
        ctx.accounts.executor_authority.is_delegated = false;
    }

    msg!(
        "Order hash verified and removed. Executing Drift order: market={}, side={:?}, amount={}",
        args.market_index,
        order_side,
        args.base_asset_amount
    );

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

    let executor_account_info = ctx.accounts.executor_authority.to_account_info();

    let magic_action = if args.keep_delegated {
        MagicAction::Commit(CommitType::WithHandler {
            commited_accounts: vec![executor_account_info],
            call_handlers: vec![drift_call_handler],
        })
    } else {
        MagicAction::CommitAndUndelegate(CommitAndUndelegate {
            commit_type: CommitType::WithHandler {
                commited_accounts: vec![executor_account_info],
                call_handlers: vec![drift_call_handler],
            },
            undelegate_type: UndelegateType::Standalone,
        })
    };

    let magic_builder = MagicInstructionBuilder {
        payer: ctx.accounts.payer.to_account_info(),
        magic_context: ctx.accounts.magic_context.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        magic_action,
    };

    magic_builder.build_and_invoke()?;

    emit!(GhostOrderExecuted {
        owner,
        order_id: args.order_id,
        order_hash,
        market_index: args.market_index,
        execution_price: args.current_price,
    });

    msg!(
        "Ghost order executed via Magic Action: order_id={}, market={}, price={}",
        args.order_id,
        args.market_index,
        args.current_price
    );

    Ok(())
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

#[commit]
#[derive(Accounts)]
pub struct ConsumeAndExecute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [ExecutorAuthority::SEED_PREFIX, executor_authority.owner.as_ref()],
        bump = executor_authority.bump
    )]
    pub executor_authority: Account<'info, ExecutorAuthority>,

    /// CHECK: Drift program state account
    pub drift_state: AccountInfo<'info>,

    /// CHECK: Drift user account for the ghost order owner
    #[account(mut)]
    pub drift_user: AccountInfo<'info>,

    /// CHECK: Drift user stats account
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,

    /// CHECK: Authority for the Drift user (ghost order owner)
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
pub struct GhostOrderExecuted {
    pub owner: Pubkey,
    pub order_id: u64,
    pub order_hash: [u8; 32],
    pub market_index: u16,
    pub execution_price: i64,
}

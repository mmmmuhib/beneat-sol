use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::{
    CallHandler, CommitAndUndelegate, CommitType, MagicAction, MagicInstructionBuilder,
    UndelegateType,
};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use crate::state::{GhostOrder, OrderStatus, OrderSide};

pub const DRIFT_PROGRAM_ID: Pubkey = pubkey!("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");
pub const DELEGATION_PROGRAM_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
pub const PLACE_PERP_ORDER_DISCRIMINATOR: u8 = 23;
pub const DRIFT_EXECUTE_COMPUTE_UNITS: u32 = 200_000;
pub const DELEGATE_COMPUTE_UNITS: u32 = 50_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ExecuteTriggerArgs {
    pub redelegate_after_execution: bool,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteTrigger<'info>>,
    args: ExecuteTriggerArgs,
) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    let clock = Clock::get()?;

    require!(
        ghost_order.status == OrderStatus::Triggered,
        GhostCrankError::OrderNotTriggered
    );

    let order_id = ghost_order.order_id;
    let market_index = ghost_order.market_index;
    let order_side = ghost_order.order_side;
    let base_asset_amount = ghost_order.base_asset_amount;
    let reduce_only = ghost_order.reduce_only;
    let owner = ghost_order.owner;
    let bump = ghost_order.bump;
    let execution_price = ghost_order.execution_price;

    ghost_order.status = OrderStatus::Executed;
    ghost_order.executed_at = clock.unix_timestamp;

    msg!(
        "Preparing Magic Action: order_id={}, market={}, side={:?}, price={}",
        order_id,
        market_index,
        order_side,
        execution_price
    );

    let drift_ix_data = build_drift_place_perp_order(
        market_index,
        order_side,
        base_asset_amount,
        reduce_only,
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

    let call_handlers = if args.redelegate_after_execution {
        build_handlers_with_redelegation(
            ctx.accounts.payer.to_account_info(),
            ctx.remaining_accounts,
            drift_call_handler,
            owner,
            order_id,
            bump,
        )?
    } else {
        vec![drift_call_handler]
    };

    let ghost_order_account_info = ctx.accounts.ghost_order.to_account_info();

    let magic_builder = MagicInstructionBuilder {
        payer: ctx.accounts.payer.to_account_info(),
        magic_context: ctx.accounts.magic_context.to_account_info(),
        magic_program: ctx.accounts.magic_program.to_account_info(),
        magic_action: MagicAction::CommitAndUndelegate(CommitAndUndelegate {
            commit_type: CommitType::WithHandler {
                commited_accounts: vec![ghost_order_account_info],
                call_handlers,
            },
            undelegate_type: UndelegateType::Standalone,
        }),
    };

    magic_builder.build_and_invoke()?;

    msg!(
        "Ghost order executed via Magic Action: id={}, market={}, side={:?}",
        order_id,
        market_index,
        order_side
    );

    Ok(())
}

fn build_handlers_with_redelegation<'info>(
    payer: AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    drift_handler: CallHandler<'info>,
    owner: Pubkey,
    order_id: u64,
    _bump: u8,
) -> Result<Vec<CallHandler<'info>>> {
    if remaining_accounts.len() < 3 {
        msg!("Skipping redelegation: missing delegation accounts (buffer, record, metadata)");
        return Ok(vec![drift_handler]);
    }

    let buffer_pda = &remaining_accounts[0];
    let record_pda = &remaining_accounts[1];
    let metadata_pda = &remaining_accounts[2];

    let order_id_bytes = order_id.to_le_bytes();
    let (ghost_order_pda, _) = Pubkey::find_program_address(
        &[
            GhostOrder::SEED_PREFIX,
            owner.as_ref(),
            &order_id_bytes,
        ],
        &crate::ID,
    );

    let delegate_ix_data = build_delegate_instruction_data();

    let delegate_accounts = vec![
        ShortAccountMeta {
            pubkey: payer.key(),
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: ghost_order_pda,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: owner,
            is_writable: false,
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

    let redelegate_handler = CallHandler {
        destination_program: DELEGATION_PROGRAM_ID,
        accounts: delegate_accounts,
        args: ActionArgs::new(delegate_ix_data),
        escrow_authority: payer,
        compute_units: DELEGATE_COMPUTE_UNITS,
    };

    msg!("Redelegation scheduled after Drift execution");

    Ok(vec![drift_handler, redelegate_handler])
}

fn build_delegate_instruction_data() -> Vec<u8> {
    let mut data = Vec::with_capacity(16);
    let discriminator: [u8; 8] = [0x90, 0xf6, 0x7a, 0x11, 0x7e, 0x8c, 0x4f, 0x00];
    data.extend_from_slice(&discriminator);
    data.extend_from_slice(&0u64.to_le_bytes());
    data
}

fn build_drift_place_perp_order(
    market_index: u16,
    side: OrderSide,
    base_asset_amount: u64,
    reduce_only: bool,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(24);

    data.push(PLACE_PERP_ORDER_DISCRIMINATOR);
    data.push(0);

    data.push(match side {
        OrderSide::Long => 0,
        OrderSide::Short => 1,
    });

    data.extend_from_slice(&market_index.to_le_bytes());
    data.extend_from_slice(&base_asset_amount.to_le_bytes());
    data.extend_from_slice(&0u64.to_le_bytes());

    data.push(if reduce_only { 1 } else { 0 });
    data.push(0);
    data.push(0);

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
            pubkey: drift_user_stats_key,
            is_writable: true,
        },
        ShortAccountMeta {
            pubkey: authority_key,
            is_writable: false,
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
pub struct ExecuteTrigger<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.status == OrderStatus::Triggered @ GhostCrankError::OrderNotTriggered
    )]
    pub ghost_order: Account<'info, GhostOrder>,

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

    /// CHECK: Magic context account for ER commit operations (added by #[commit] macro)
    pub magic_context: AccountInfo<'info>,

    /// CHECK: Magic program for ER operations
    pub magic_program: AccountInfo<'info>,
}

#[error_code]
pub enum GhostCrankError {
    #[msg("Order has not been triggered yet")]
    OrderNotTriggered,
    #[msg("Order is not active")]
    OrderNotActive,
    #[msg("Order has expired")]
    OrderExpired,
    #[msg("Invalid trigger condition")]
    InvalidTriggerCondition,
    #[msg("Failed to build Drift instruction")]
    DriftInstructionError,
    #[msg("Magic Action execution failed")]
    MagicActionFailed,
    #[msg("Redelegation failed")]
    RedelegationFailed,
}

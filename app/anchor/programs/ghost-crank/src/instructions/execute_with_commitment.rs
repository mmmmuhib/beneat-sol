use anchor_lang::prelude::*;
use solana_program::hash::hash;
use crate::state::{GhostOrder, OrderStatus, OrderSide};

pub const DRIFT_PROGRAM_ID: Pubkey = pubkey!("dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH");

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OrderParams {
    pub market_index: u16,
    pub order_side: OrderSide,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ExecuteWithCommitmentArgs {
    pub order_params: OrderParams,
    pub nonce: u64,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExecuteWithCommitment<'info>>,
    args: ExecuteWithCommitmentArgs,
) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;
    let clock = Clock::get()?;

    // 1. Verify ready state
    require!(
        ghost_order.status == OrderStatus::ReadyToExecute,
        ExecuteError::NotReady
    );

    // 2. Verify not expired
    require!(
        (clock.slot as i64) < ghost_order.ready_expires_at,
        ExecuteError::Expired
    );

    // 3. Verify nonce matches
    require!(
        args.nonce == ghost_order.nonce,
        ExecuteError::NonceMismatch
    );

    // 4. Verify commitment - this is the anti-frontrun mechanism
    let params_bytes = args.order_params.try_to_vec()?;
    let mut hasher_input = Vec::with_capacity(params_bytes.len() + 8);
    hasher_input.extend_from_slice(&params_bytes);
    hasher_input.extend_from_slice(&args.nonce.to_le_bytes());

    let computed_hash = hash(&hasher_input);
    require!(
        computed_hash.to_bytes() == ghost_order.params_commitment,
        ExecuteError::CommitmentMismatch
    );

    msg!(
        "Commitment verified for order {}: executing Drift CPI",
        ghost_order.order_id
    );

    // 5. Build Drift place_perp_order CPI
    let drift_ix_data = build_drift_place_perp_order(
        args.order_params.market_index,
        args.order_params.order_side,
        args.order_params.base_asset_amount,
        args.order_params.reduce_only,
    );

    let drift_accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.drift_state.key(), false),
        AccountMeta::new(ctx.accounts.drift_user.key(), false),
        AccountMeta::new(ctx.accounts.drift_user_stats.key(), false),
        // Authority is the delegate PDA, which signs via invoke_signed
        AccountMeta::new_readonly(ctx.accounts.delegate_pda.key(), true),
        AccountMeta::new(ctx.accounts.perp_market.key(), false),
        AccountMeta::new_readonly(ctx.accounts.oracle.key(), false),
    ];

    let drift_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: DRIFT_PROGRAM_ID,
        accounts: drift_accounts,
        data: drift_ix_data,
    };

    // 6. Sign with delegate PDA via invoke_signed
    let owner_key = ghost_order.owner;
    let delegate_seeds = &[
        GhostOrder::DELEGATE_SEED_PREFIX,
        owner_key.as_ref(),
        &[ghost_order.delegate_bump],
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &drift_ix,
        &[
            ctx.accounts.drift_state.to_account_info(),
            ctx.accounts.drift_user.to_account_info(),
            ctx.accounts.drift_user_stats.to_account_info(),
            ctx.accounts.delegate_pda.to_account_info(),
            ctx.accounts.perp_market.to_account_info(),
            ctx.accounts.oracle.to_account_info(),
            ctx.accounts.drift_program.to_account_info(),
        ],
        &[delegate_seeds],
    )?;

    // 7. Mark executed
    ghost_order.status = OrderStatus::Executed;
    ghost_order.executed_at = clock.unix_timestamp;

    msg!(
        "Ghost order executed via delegate CPI: id={}, market={}, side={:?}",
        ghost_order.order_id,
        args.order_params.market_index,
        args.order_params.order_side
    );

    Ok(())
}

fn build_drift_place_perp_order(
    market_index: u16,
    side: OrderSide,
    base_asset_amount: u64,
    reduce_only: bool,
) -> Vec<u8> {
    // Drift place_perp_order discriminator: sha256("global:place_perp_order")[0..8]
    let discriminator: [u8; 8] = [0x45, 0xa1, 0x3b, 0x69, 0x28, 0x1c, 0xfa, 0x63];

    let mut data = Vec::with_capacity(32);
    data.extend_from_slice(&discriminator);

    // OrderType::Market = 0
    data.push(0);

    // Direction
    data.push(match side {
        OrderSide::Long => 0,
        OrderSide::Short => 1,
    });

    // Market index (u16 LE)
    data.extend_from_slice(&market_index.to_le_bytes());

    // Base asset amount (u64 LE)
    data.extend_from_slice(&base_asset_amount.to_le_bytes());

    // Price (u64 LE) - 0 for market orders
    data.extend_from_slice(&0u64.to_le_bytes());

    // Reduce only
    data.push(if reduce_only { 1 } else { 0 });

    // Post only = false
    data.push(0);

    // Immediate or cancel = false
    data.push(0);

    data
}

#[derive(Accounts)]
pub struct ExecuteWithCommitment<'info> {
    /// Keeper/filler - pays for tx, anyone can call
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.status == OrderStatus::ReadyToExecute @ ExecuteError::NotReady
    )]
    pub ghost_order: Account<'info, GhostOrder>,

    /// CHECK: Delegate PDA that acts as authority for Drift CPI
    #[account(
        seeds = [GhostOrder::DELEGATE_SEED_PREFIX, ghost_order.owner.as_ref()],
        bump = ghost_order.delegate_bump,
    )]
    pub delegate_pda: AccountInfo<'info>,

    /// CHECK: Drift program state
    pub drift_state: AccountInfo<'info>,

    /// CHECK: User's Drift account
    #[account(
        mut,
        constraint = drift_user.key() == ghost_order.drift_user @ ExecuteError::DriftUserMismatch
    )]
    pub drift_user: AccountInfo<'info>,

    /// CHECK: User's Drift stats
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,

    /// CHECK: Perp market account
    #[account(mut)]
    pub perp_market: AccountInfo<'info>,

    /// CHECK: Oracle for the market
    pub oracle: AccountInfo<'info>,

    /// CHECK: Drift program
    #[account(address = DRIFT_PROGRAM_ID)]
    pub drift_program: AccountInfo<'info>,
}

#[error_code]
pub enum ExecuteError {
    #[msg("Order is not ready to execute")]
    NotReady,
    #[msg("Order has expired")]
    Expired,
    #[msg("Nonce does not match")]
    NonceMismatch,
    #[msg("Commitment does not match order params")]
    CommitmentMismatch,
    #[msg("Drift user account mismatch")]
    DriftUserMismatch,
    #[msg("Drift CPI failed")]
    DriftCpiFailed,
}

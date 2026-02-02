use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use magicblock_magic_program_api::{args::ScheduleTaskArgs, instruction::MagicBlockInstruction};
use crate::state::{EncryptedOrder, EncryptedOrderStatus};
use crate::errors::GhostBridgeError;
use crate::constants::MAGIC_PROGRAM_ID;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ScheduleEncryptedMonitoringArgs {
    pub task_id: i64,
    pub check_interval_millis: i64,
    pub max_iterations: i64,
}

pub fn handler(
    ctx: Context<ScheduleEncryptedMonitoring>,
    args: ScheduleEncryptedMonitoringArgs,
) -> Result<()> {
    let encrypted_order = &ctx.accounts.encrypted_order;

    require!(
        encrypted_order.status == EncryptedOrderStatus::Active,
        GhostBridgeError::InvalidOrderData
    );

    let check_trigger_ix = build_check_encrypted_trigger_instruction(
        &encrypted_order.key(),
        &ctx.accounts.price_feed.key(),
    );

    let schedule_args = ScheduleTaskArgs {
        task_id: args.task_id,
        execution_interval_millis: args.check_interval_millis,
        iterations: args.max_iterations,
        instructions: vec![check_trigger_ix],
    };

    let schedule_ix_data = bincode::serialize(&MagicBlockInstruction::ScheduleTask(schedule_args))
        .map_err(|_| GhostBridgeError::MagicActionFailed)?;

    let schedule_ix = Instruction::new_with_bytes(
        MAGIC_PROGRAM_ID,
        &schedule_ix_data,
        vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new(ctx.accounts.encrypted_order.key(), false),
            AccountMeta::new_readonly(ctx.accounts.price_feed.key(), false),
        ],
    );

    invoke(
        &schedule_ix,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.encrypted_order.to_account_info(),
            ctx.accounts.price_feed.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ],
    )?;

    msg!(
        "Encrypted order monitoring scheduled: task_id={}, interval={}ms, iterations={}",
        args.task_id,
        args.check_interval_millis,
        args.max_iterations
    );

    emit!(MonitoringScheduled {
        order_hash: encrypted_order.order_hash,
        task_id: args.task_id,
        check_interval_millis: args.check_interval_millis,
        max_iterations: args.max_iterations,
    });

    Ok(())
}

fn build_check_encrypted_trigger_instruction(
    encrypted_order: &Pubkey,
    price_feed: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: crate::ID,
        accounts: vec![
            AccountMeta::new(*encrypted_order, false),
            AccountMeta::new_readonly(*price_feed, false),
        ],
        data: anchor_lang::InstructionData::data(&crate::instruction::CheckPriceUpdate {}),
    }
}

#[derive(Accounts)]
#[instruction(args: ScheduleEncryptedMonitoringArgs)]
pub struct ScheduleEncryptedMonitoring<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = encrypted_order.status == EncryptedOrderStatus::Active @ GhostBridgeError::InvalidOrderData
    )]
    pub encrypted_order: Account<'info, EncryptedOrder>,

    /// CHECK: Pyth price feed account for monitoring
    pub price_feed: AccountInfo<'info>,

    /// CHECK: Magic Program for scheduling
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: AccountInfo<'info>,
}

#[event]
pub struct MonitoringScheduled {
    pub order_hash: [u8; 32],
    pub task_id: i64,
    pub check_interval_millis: i64,
    pub max_iterations: i64,
}

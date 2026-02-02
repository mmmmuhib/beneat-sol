use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use crate::state::{GhostOrder, OrderStatus};

pub const MAGIC_PROGRAM_ID: Pubkey = pubkey!("Magic11111111111111111111111111111111111111");

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ScheduleMonitoringArgs {
    pub task_id: u64,
    pub check_interval_millis: u64,
    pub max_iterations: u64,
}

pub fn handler(ctx: Context<ScheduleMonitoring>, args: ScheduleMonitoringArgs) -> Result<()> {
    let ghost_order = &mut ctx.accounts.ghost_order;

    require!(
        ghost_order.status == OrderStatus::Active,
        ScheduleError::OrderNotActive
    );

    let check_trigger_ix = build_check_trigger_instruction(
        &ghost_order.key(),
        &ctx.accounts.price_feed.key(),
    );

    let schedule_task_data = build_schedule_task_data(
        args.task_id,
        args.check_interval_millis,
        args.max_iterations,
        check_trigger_ix,
    )?;

    let schedule_ix = Instruction {
        program_id: MAGIC_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new_readonly(crate::ID, false),
        ],
        data: schedule_task_data,
    };

    invoke_signed(
        &schedule_ix,
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ],
        &[],
    )?;

    ghost_order.crank_task_id = args.task_id;

    msg!("Ghost order monitoring scheduled: task_id={}, interval={}ms, iterations={}",
         args.task_id, args.check_interval_millis, args.max_iterations);

    Ok(())
}

fn build_check_trigger_instruction(
    ghost_order: &Pubkey,
    price_feed: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: crate::ID,
        accounts: vec![
            AccountMeta::new(*ghost_order, false),
            AccountMeta::new_readonly(*price_feed, false),
        ],
        data: anchor_lang::InstructionData::data(&crate::instruction::CheckTrigger {}),
    }
}

fn build_schedule_task_data(
    task_id: u64,
    execution_interval_millis: u64,
    iterations: u64,
    instruction: Instruction,
) -> Result<Vec<u8>> {
    #[derive(AnchorSerialize)]
    struct ScheduleTaskArgs {
        task_id: u64,
        execution_interval_millis: u64,
        iterations: u64,
        instructions_count: u32,
    }

    let args = ScheduleTaskArgs {
        task_id,
        execution_interval_millis,
        iterations,
        instructions_count: 1,
    };

    let mut data = vec![1u8];
    data.extend(args.try_to_vec()?);

    data.extend(instruction.program_id.to_bytes());
    data.extend((instruction.accounts.len() as u32).to_le_bytes());
    for account in &instruction.accounts {
        data.extend(account.pubkey.to_bytes());
        data.push(if account.is_signer { 1 } else { 0 });
        data.push(if account.is_writable { 1 } else { 0 });
    }
    data.extend((instruction.data.len() as u32).to_le_bytes());
    data.extend(&instruction.data);

    Ok(data)
}

#[derive(Accounts)]
#[instruction(args: ScheduleMonitoringArgs)]
pub struct ScheduleMonitoring<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [GhostOrder::SEED_PREFIX, ghost_order.owner.as_ref(), &ghost_order.order_id.to_le_bytes()],
        bump = ghost_order.bump,
        constraint = ghost_order.status == OrderStatus::Active @ ScheduleError::OrderNotActive
    )]
    pub ghost_order: Account<'info, GhostOrder>,

    /// CHECK: Pyth Lazer price feed for monitoring
    pub price_feed: AccountInfo<'info>,

    /// CHECK: Magic Program for scheduling
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: AccountInfo<'info>,
}

#[error_code]
pub enum ScheduleError {
    #[msg("Order must be active to schedule monitoring")]
    OrderNotActive,
    #[msg("Failed to serialize schedule task")]
    SerializationError,
}

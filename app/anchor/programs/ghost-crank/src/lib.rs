use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("7VvD7j99AE7q9PC9atpJeMEUeEzZ5ZYH7WqSzGdmvsqv");

#[ephemeral]
#[program]
pub mod ghost_crank {
    use super::*;

    pub fn create_ghost_order(
        ctx: Context<CreateGhostOrder>,
        args: CreateGhostOrderArgs,
    ) -> Result<()> {
        instructions::create_ghost_order::handler(ctx, args)
    }

    pub fn delegate_order(ctx: Context<DelegateOrder>) -> Result<()> {
        instructions::delegate_order::handler(ctx)
    }

    pub fn activate_order(ctx: Context<ActivateOrder>) -> Result<()> {
        instructions::delegate_order::activate_handler(ctx)
    }

    pub fn check_trigger(ctx: Context<CheckTrigger>) -> Result<()> {
        instructions::check_trigger::handler(ctx)
    }

    pub fn execute_trigger<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteTrigger<'info>>,
        args: ExecuteTriggerArgs,
    ) -> Result<()> {
        instructions::execute_trigger::handler(ctx, args)
    }

    pub fn schedule_monitoring(
        ctx: Context<ScheduleMonitoring>,
        args: ScheduleMonitoringArgs,
    ) -> Result<()> {
        instructions::schedule_monitoring::handler(ctx, args)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::cancel_order::handler(ctx)
    }

    pub fn mark_ready(ctx: Context<MarkReady>, execution_price: i64) -> Result<()> {
        instructions::mark_ready::handler(ctx, execution_price)
    }

    pub fn execute_with_commitment<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteWithCommitment<'info>>,
        args: ExecuteWithCommitmentArgs,
    ) -> Result<()> {
        instructions::execute_with_commitment::handler(ctx, args)
    }
}

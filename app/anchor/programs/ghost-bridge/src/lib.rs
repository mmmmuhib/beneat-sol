use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod drift_cpi;
pub mod errors;
pub mod instructions;
pub mod state;

#[cfg(test)]
mod tests;

use instructions::*;

declare_id!("8w95bQ7UzKHKa4NYvyVeAVGN3dMgwshJhhTinPfabMLA");

#[ephemeral]
#[program]
pub mod ghost_bridge {
    use super::*;

    pub fn init_executor(ctx: Context<InitExecutor>) -> Result<()> {
        instructions::init_executor::handler(ctx)
    }

    pub fn delegate_executor(ctx: Context<DelegateExecutor>) -> Result<()> {
        instructions::delegate_executor::handler(ctx)
    }

    pub fn undelegate_executor(ctx: Context<UndelegateExecutor>) -> Result<()> {
        instructions::undelegate_executor::handler(ctx)
    }

    pub fn create_compressed_order(
        ctx: Context<CreateCompressedOrder>,
        args: CreateCompressedOrderArgs,
    ) -> Result<()> {
        instructions::create_compressed_order::handler(ctx, args)
    }

    pub fn consume_and_execute<'info>(
        ctx: Context<'_, '_, '_, 'info, ConsumeAndExecute<'info>>,
        args: ConsumeAndExecuteArgs,
    ) -> Result<()> {
        instructions::consume_and_execute::handler(ctx, args)
    }

    pub fn create_encrypted_order(
        ctx: Context<CreateEncryptedOrder>,
        args: CreateEncryptedOrderArgs,
    ) -> Result<()> {
        instructions::create_encrypted_order::handler(ctx, args)
    }

    pub fn delegate_encrypted_order(
        ctx: Context<DelegateEncryptedOrder>,
        args: DelegateEncryptedOrderArgs,
    ) -> Result<()> {
        instructions::delegate_encrypted_order::handler(ctx, args)
    }

    pub fn trigger_and_execute<'info>(
        ctx: Context<'_, '_, '_, 'info, TriggerAndExecute<'info>>,
        args: TriggerAndExecuteArgs,
    ) -> Result<()> {
        instructions::trigger_and_execute::handler(ctx, args)
    }

    pub fn cancel_encrypted_order(ctx: Context<CancelEncryptedOrder>) -> Result<()> {
        instructions::cancel_encrypted_order::handler(ctx)
    }

    pub fn close_encrypted_order(ctx: Context<CloseEncryptedOrder>) -> Result<()> {
        instructions::close_encrypted_order::handler(ctx)
    }

    pub fn authorize_executor(
        ctx: Context<AuthorizeExecutor>,
        args: AuthorizeExecutorArgs,
    ) -> Result<()> {
        instructions::authorize_executor::handler(ctx, args)
    }

    pub fn schedule_encrypted_monitoring(
        ctx: Context<ScheduleEncryptedMonitoring>,
        args: ScheduleEncryptedMonitoringArgs,
    ) -> Result<()> {
        instructions::schedule_encrypted_monitoring::handler(ctx, args)
    }

    pub fn check_price_update(ctx: Context<CheckPriceUpdate>) -> Result<()> {
        instructions::check_price_update::handler(ctx)
    }
}

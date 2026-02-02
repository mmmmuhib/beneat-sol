use anchor_lang::prelude::*;
use crate::state::TraderProfile;

pub fn handler(ctx: Context<InitializeProfile>) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    profile.authority = ctx.accounts.authority.key();
    profile.bump = ctx.bumps.profile;
    profile.overall_rating = 50;
    profile.discipline = 50;
    profile.patience = 50;
    profile.consistency = 50;
    profile.timing = 50;
    profile.risk_control = 50;
    profile.endurance = 50;
    profile.total_trades = 0;
    profile.total_wins = 0;
    profile.total_pnl = 0;
    profile.avg_trade_size = 0;
    profile.trading_days = 0;
    profile.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + TraderProfile::INIT_SPACE,
        seeds = [TraderProfile::SEED_PREFIX, authority.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, TraderProfile>,

    pub system_program: Program<'info, System>,
}

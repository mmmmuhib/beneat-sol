use anchor_lang::prelude::*;
use crate::state::TraderProfile;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateStatsArgs {
    pub discipline: u8,
    pub patience: u8,
    pub consistency: u8,
    pub timing: u8,
    pub risk_control: u8,
    pub endurance: u8,
    pub overall_rating: u8,
    pub total_trades: u32,
    pub total_wins: u32,
    pub total_pnl: i64,
    pub avg_trade_size: u64,
    pub trading_days: u16,
}

pub fn handler(ctx: Context<UpdateStats>, args: UpdateStatsArgs) -> Result<()> {
    let profile = &mut ctx.accounts.profile;
    profile.discipline = args.discipline.min(99);
    profile.patience = args.patience.min(99);
    profile.consistency = args.consistency.min(99);
    profile.timing = args.timing.min(99);
    profile.risk_control = args.risk_control.min(99);
    profile.endurance = args.endurance.min(99);
    profile.overall_rating = args.overall_rating.min(99);
    profile.total_trades = args.total_trades;
    profile.total_wins = args.total_wins;
    profile.total_pnl = args.total_pnl;
    profile.avg_trade_size = args.avg_trade_size;
    profile.trading_days = args.trading_days;
    profile.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateStats<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [TraderProfile::SEED_PREFIX, authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority,
    )]
    pub profile: Account<'info, TraderProfile>,
}

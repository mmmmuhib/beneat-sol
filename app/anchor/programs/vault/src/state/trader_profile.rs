use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TraderProfile {
    pub authority: Pubkey,
    pub bump: u8,
    pub overall_rating: u8,
    pub discipline: u8,
    pub patience: u8,
    pub consistency: u8,
    pub timing: u8,
    pub risk_control: u8,
    pub endurance: u8,
    pub total_trades: u32,
    pub total_wins: u32,
    pub total_pnl: i64,
    pub avg_trade_size: u64,
    pub trading_days: u16,
    pub last_updated: i64,
}

impl TraderProfile {
    pub const SEED_PREFIX: &'static [u8] = b"trader_profile";
}

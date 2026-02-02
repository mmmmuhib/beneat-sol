use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub bump: u8,
    pub is_locked: bool,
    pub lockout_until: i64,
    pub lockout_count: u32,
    pub lockout_duration: u32,
    pub daily_loss_limit: u64,
    pub max_trades_per_day: u8,
    pub trades_today: u8,
    pub session_start: i64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub last_trade_was_loss: bool,
    pub last_trade_time: i64,
    pub cooldown_seconds: u32,

    pub swap_in_progress: bool,
    pub pending_swap_source_mint: Pubkey,
    pub pending_swap_dest_mint: Pubkey,
    pub pending_swap_amount_in: u64,
    pub pending_swap_min_out: u64,
    pub balance_before_swap: u64,
}

impl Vault {
    pub const SEED_PREFIX: &'static [u8] = b"vault";

    pub fn is_currently_locked(&self, current_time: i64) -> bool {
        self.is_locked && current_time < self.lockout_until
    }

    pub fn reset_daily_counters(&mut self, current_time: i64) {
        self.trades_today = 0;
        self.session_start = current_time;
    }

    pub fn should_reset_session(&self, current_time: i64) -> bool {
        const SECONDS_PER_DAY: i64 = 86400;
        current_time - self.session_start >= SECONDS_PER_DAY
    }

    pub fn increment_trade(&mut self) -> Result<()> {
        self.trades_today = self.trades_today.checked_add(1).ok_or(error!(crate::errors::VaultError::ArithmeticOverflow))?;
        Ok(())
    }

    pub fn is_in_cooldown(&self, current_time: i64) -> bool {
        self.last_trade_was_loss
            && current_time < self.last_trade_time + (self.cooldown_seconds as i64)
    }
}

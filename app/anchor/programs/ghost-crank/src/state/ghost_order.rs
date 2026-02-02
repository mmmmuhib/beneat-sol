use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum TriggerCondition {
    Above = 0,
    Below = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum OrderSide {
    Long = 0,
    Short = 1,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum OrderStatus {
    Pending = 0,
    Active = 1,
    Triggered = 2,
    ReadyToExecute = 3,
    Executed = 4,
    Cancelled = 5,
    Expired = 6,
}

impl Default for OrderStatus {
    fn default() -> Self {
        OrderStatus::Pending
    }
}

#[account]
pub struct GhostOrder {
    pub owner: Pubkey,
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: TriggerCondition,
    pub order_side: OrderSide,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub status: OrderStatus,
    pub created_at: i64,
    pub triggered_at: i64,
    pub executed_at: i64,
    pub expiry: i64,
    pub feed_id: [u8; 32],
    pub crank_task_id: u64,
    pub execution_price: i64,
    pub bump: u8,

    // Commitment-based execution fields
    pub params_commitment: [u8; 32],
    pub nonce: u64,
    pub ready_expires_at: i64,

    // Drift delegate PDA info
    pub delegate_pda: Pubkey,
    pub delegate_bump: u8,
    pub drift_user: Pubkey,
}

impl GhostOrder {
    pub const SEED_PREFIX: &'static [u8] = b"ghost_order";
    pub const DELEGATE_SEED_PREFIX: &'static [u8] = b"ghost_delegate";

    pub const LEN: usize = 8 +  // discriminator
        32 +                     // owner
        8 +                      // order_id
        2 +                      // market_index
        8 +                      // trigger_price
        1 +                      // trigger_condition
        1 +                      // order_side
        8 +                      // base_asset_amount
        1 +                      // reduce_only
        1 +                      // status
        8 +                      // created_at
        8 +                      // triggered_at
        8 +                      // executed_at
        8 +                      // expiry
        32 +                     // feed_id
        8 +                      // crank_task_id
        8 +                      // execution_price
        1 +                      // bump
        // Commitment fields
        32 +                     // params_commitment
        8 +                      // nonce
        8 +                      // ready_expires_at
        32 +                     // delegate_pda
        1 +                      // delegate_bump
        32;                      // drift_user

    pub fn is_active(&self) -> bool {
        self.status == OrderStatus::Active
    }

    pub fn is_ready_to_execute(&self) -> bool {
        self.status == OrderStatus::ReadyToExecute
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expiry > 0 && current_time > self.expiry
    }

    pub fn is_ready_expired(&self, current_slot: i64) -> bool {
        self.ready_expires_at > 0 && current_slot > self.ready_expires_at
    }

    pub fn check_trigger(&self, current_price: i64) -> bool {
        match self.trigger_condition {
            TriggerCondition::Above => current_price >= self.trigger_price,
            TriggerCondition::Below => current_price <= self.trigger_price,
        }
    }

    pub fn derive_delegate_pda(owner: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[Self::DELEGATE_SEED_PREFIX, owner.as_ref()],
            program_id,
        )
    }
}

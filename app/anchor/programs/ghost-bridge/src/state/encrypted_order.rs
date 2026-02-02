use anchor_lang::prelude::*;

pub const MAX_ENCRYPTED_DATA_LEN: usize = 256;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
pub enum EncryptedOrderStatus {
    #[default]
    Active = 0,
    Triggered = 1,
    Executed = 2,
    Cancelled = 3,
}

#[account]
pub struct EncryptedOrder {
    pub owner: Pubkey,
    pub order_hash: [u8; 32],
    pub executor_authority: Pubkey,
    pub encrypted_data: [u8; MAX_ENCRYPTED_DATA_LEN],
    pub data_len: u16,
    pub feed_id: [u8; 32],
    pub created_at: i64,
    pub triggered_at: i64,
    pub execution_price: i64,
    pub status: EncryptedOrderStatus,
    pub is_delegated: bool,
    pub bump: u8,
}

impl EncryptedOrder {
    pub const SEED_PREFIX: &'static [u8] = b"encrypted_order";

    pub const LEN: usize = 8 +          // discriminator
        32 +                             // owner
        32 +                             // order_hash
        32 +                             // executor_authority
        MAX_ENCRYPTED_DATA_LEN +         // encrypted_data
        2 +                              // data_len
        32 +                             // feed_id
        8 +                              // created_at
        8 +                              // triggered_at
        8 +                              // execution_price
        1 +                              // status
        1 +                              // is_delegated
        1;                               // bump

    pub fn is_active(&self) -> bool {
        self.status == EncryptedOrderStatus::Active
    }

    pub fn is_triggered(&self) -> bool {
        self.status == EncryptedOrderStatus::Triggered
    }

    pub fn get_encrypted_data(&self) -> &[u8] {
        &self.encrypted_data[..self.data_len as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_account_size() {
        assert_eq!(EncryptedOrder::LEN, 8 + 32 + 32 + 32 + 256 + 2 + 32 + 8 + 8 + 8 + 1 + 1 + 1);
        assert_eq!(EncryptedOrder::LEN, 421);
    }

    #[test]
    fn test_status_transitions() {
        let order = EncryptedOrder {
            status: EncryptedOrderStatus::Active,
            ..Default::default()
        };
        assert!(order.is_active());
        assert!(!order.is_triggered());
    }
}

impl Default for EncryptedOrder {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            order_hash: [0u8; 32],
            executor_authority: Pubkey::default(),
            encrypted_data: [0u8; MAX_ENCRYPTED_DATA_LEN],
            data_len: 0,
            feed_id: [0u8; 32],
            created_at: 0,
            triggered_at: 0,
            execution_price: 0,
            status: EncryptedOrderStatus::Active,
            is_delegated: false,
            bump: 0,
        }
    }
}

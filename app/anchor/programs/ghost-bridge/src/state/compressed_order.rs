use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum TriggerCondition {
    Above = 0,
    Below = 1,
}

impl Default for TriggerCondition {
    fn default() -> Self {
        TriggerCondition::Above
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum OrderSide {
    Long = 0,
    Short = 1,
}

impl Default for OrderSide {
    fn default() -> Self {
        OrderSide::Long
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct CompressedGhostOrder {
    pub owner: Pubkey,
    pub order_id: u64,
    pub market_index: u16,
    pub trigger_price: i64,
    pub trigger_condition: TriggerCondition,
    pub order_side: OrderSide,
    pub base_asset_amount: u64,
    pub reduce_only: bool,
    pub expiry: i64,
    pub feed_id: [u8; 32],
    pub salt: [u8; 16],
}

impl CompressedGhostOrder {
    pub fn compute_hash(&self) -> [u8; 32] {
        let mut data = Vec::with_capacity(144);

        data.extend_from_slice(self.owner.as_ref());
        data.extend_from_slice(&self.order_id.to_le_bytes());
        data.extend_from_slice(&self.market_index.to_le_bytes());
        data.extend_from_slice(&self.trigger_price.to_le_bytes());
        data.push(self.trigger_condition as u8);
        data.push(self.order_side as u8);
        data.extend_from_slice(&self.base_asset_amount.to_le_bytes());
        data.push(if self.reduce_only { 1 } else { 0 });
        data.extend_from_slice(&self.expiry.to_le_bytes());
        data.extend_from_slice(&self.feed_id);
        data.extend_from_slice(&self.salt);

        *blake3::hash(&data).as_bytes()
    }

    pub fn check_trigger(&self, current_price: i64) -> bool {
        match self.trigger_condition {
            TriggerCondition::Above => current_price >= self.trigger_price,
            TriggerCondition::Below => current_price <= self.trigger_price,
        }
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expiry > 0 && current_time > self.expiry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_deterministic() {
        let order = CompressedGhostOrder {
            owner: Pubkey::new_unique(),
            order_id: 1,
            market_index: 0,
            trigger_price: 50000_000000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Short,
            base_asset_amount: 1_000000,
            reduce_only: true,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [1u8; 16],
        };

        let hash1 = order.compute_hash();
        let hash2 = order.compute_hash();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_salt_affects_hash() {
        let order1 = CompressedGhostOrder {
            owner: Pubkey::new_unique(),
            order_id: 1,
            market_index: 0,
            trigger_price: 180_000_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Short,
            base_asset_amount: 1_000000,
            reduce_only: true,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [1u8; 16],
        };

        let order2 = CompressedGhostOrder {
            salt: [2u8; 16],
            ..order1.clone()
        };

        assert_ne!(order1.compute_hash(), order2.compute_hash());
    }

    #[test]
    fn test_trigger_conditions() {
        let order = CompressedGhostOrder {
            trigger_price: 50000,
            trigger_condition: TriggerCondition::Below,
            ..Default::default()
        };

        assert!(order.check_trigger(49000));
        assert!(order.check_trigger(50000));
        assert!(!order.check_trigger(51000));

        let order_above = CompressedGhostOrder {
            trigger_price: 50000,
            trigger_condition: TriggerCondition::Above,
            ..Default::default()
        };

        assert!(!order_above.check_trigger(49000));
        assert!(order_above.check_trigger(50000));
        assert!(order_above.check_trigger(51000));
    }
}

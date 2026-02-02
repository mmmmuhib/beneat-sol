//! Privacy Verification Audit Tests for Ghost Bridge
//!
//! These tests verify the cryptographic integrity and privacy guarantees
//! of the ghost order system on the Rust/Anchor side.

#[cfg(test)]
mod tests {
    use crate::state::{
        CompressedGhostOrder, ExecutorAuthority, OrderSide, TriggerCondition,
        MAX_ORDERS_PER_EXECUTOR, MAX_AUTHORIZED_EXECUTORS,
    };
    use anchor_lang::prelude::Pubkey;

    /// TEST A: Verify hash is deterministic across multiple computations
    #[test]
    fn test_hash_determinism() {
        let owner = Pubkey::new_unique();
        let order = CompressedGhostOrder {
            owner,
            order_id: 12345,
            market_index: 0,
            trigger_price: 180_000_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [42u8; 16],
        };

        let hash1 = order.compute_hash();
        let hash2 = order.compute_hash();

        assert_eq!(hash1, hash2, "Hash must be deterministic");
    }

    /// TEST B: Verify different trigger prices produce different hashes
    #[test]
    fn test_trigger_price_affects_hash() {
        let owner = Pubkey::new_unique();

        let order1 = CompressedGhostOrder {
            owner,
            order_id: 1,
            market_index: 0,
            trigger_price: 180_000_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [1u8; 16],
        };

        let order2 = CompressedGhostOrder {
            trigger_price: 170_000_000,
            ..order1.clone()
        };

        let hash1 = order1.compute_hash();
        let hash2 = order2.compute_hash();

        assert_ne!(hash1, hash2, "Different trigger prices must produce different hashes");
    }

    /// TEST C: Verify hash length is exactly 32 bytes (Blake3)
    #[test]
    fn test_hash_is_32_bytes() {
        let owner = Pubkey::new_unique();
        let order = CompressedGhostOrder {
            owner,
            order_id: 1,
            market_index: 0,
            trigger_price: 50_000_000_000,
            trigger_condition: TriggerCondition::Above,
            order_side: OrderSide::Short,
            base_asset_amount: 1_000_000,
            reduce_only: true,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [3u8; 16],
        };

        let hash = order.compute_hash();
        assert_eq!(hash.len(), 32, "Blake3 hash must be 32 bytes");
    }

    /// TEST D: Verify trigger condition logic matches specification
    #[test]
    fn test_trigger_below_condition() {
        let order = CompressedGhostOrder {
            owner: Pubkey::new_unique(),
            order_id: 1,
            market_index: 0,
            trigger_price: 50_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [4u8; 16],
        };

        assert!(order.check_trigger(49_000), "Below: 49000 < 50000 should trigger");
        assert!(order.check_trigger(50_000), "Below: 50000 <= 50000 should trigger");
        assert!(!order.check_trigger(51_000), "Below: 51000 > 50000 should NOT trigger");
    }

    #[test]
    fn test_trigger_above_condition() {
        let order = CompressedGhostOrder {
            owner: Pubkey::new_unique(),
            order_id: 1,
            market_index: 0,
            trigger_price: 50_000,
            trigger_condition: TriggerCondition::Above,
            order_side: OrderSide::Short,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [5u8; 16],
        };

        assert!(!order.check_trigger(49_000), "Above: 49000 < 50000 should NOT trigger");
        assert!(order.check_trigger(50_000), "Above: 50000 >= 50000 should trigger");
        assert!(order.check_trigger(51_000), "Above: 51000 > 50000 should trigger");
    }

    /// TEST E: Verify expiry logic
    #[test]
    fn test_order_expiry() {
        let now = 1700000000i64;

        let order_expired = CompressedGhostOrder {
            owner: Pubkey::new_unique(),
            order_id: 1,
            market_index: 0,
            trigger_price: 50_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: now - 100,
            feed_id: [0u8; 32],
            salt: [6u8; 16],
        };

        let order_valid = CompressedGhostOrder {
            expiry: now + 100,
            ..order_expired.clone()
        };

        let order_no_expiry = CompressedGhostOrder {
            expiry: 0,
            ..order_expired.clone()
        };

        assert!(order_expired.is_expired(now), "Past expiry should be expired");
        assert!(!order_valid.is_expired(now), "Future expiry should NOT be expired");
        assert!(!order_no_expiry.is_expired(now), "Zero expiry should never expire");
    }

    /// TEST F: Verify ExecutorAuthority hash management
    #[test]
    fn test_executor_add_and_remove_hash() {
        let owner = Pubkey::new_unique();
        let mut executor = create_test_executor(owner);

        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];

        executor.add_order_hash(hash1).unwrap();
        assert_eq!(executor.order_hash_count, 1);
        assert!(executor.has_order_hash(&hash1));

        executor.add_order_hash(hash2).unwrap();
        assert_eq!(executor.order_hash_count, 2);

        executor.remove_order_hash(hash1).unwrap();
        assert_eq!(executor.order_hash_count, 1);
        assert!(!executor.has_order_hash(&hash1));
        assert!(executor.has_order_hash(&hash2));
    }

    /// TEST G: Verify duplicate hash rejection
    #[test]
    fn test_executor_rejects_duplicate_hash() {
        let owner = Pubkey::new_unique();
        let mut executor = create_test_executor(owner);

        let hash = [42u8; 32];

        executor.add_order_hash(hash).unwrap();
        let result = executor.add_order_hash(hash);

        assert!(result.is_err(), "Duplicate hash should be rejected");
    }

    /// TEST H: Verify max orders limit (16)
    #[test]
    fn test_executor_max_orders_limit() {
        let owner = Pubkey::new_unique();
        let mut executor = create_test_executor(owner);

        for i in 0..16 {
            let mut hash = [0u8; 32];
            hash[0] = i as u8;
            executor.add_order_hash(hash).unwrap();
        }

        assert_eq!(executor.order_hash_count, 16);

        let overflow_hash = [255u8; 32];
        let result = executor.add_order_hash(overflow_hash);

        assert!(result.is_err(), "Should reject order when at max capacity (16)");
    }

    /// TEST I: Verify removing non-existent hash fails
    #[test]
    fn test_executor_remove_nonexistent_hash() {
        let owner = Pubkey::new_unique();
        let mut executor = create_test_executor(owner);

        let hash = [99u8; 32];
        let result = executor.remove_order_hash(hash);

        assert!(result.is_err(), "Removing non-existent hash should fail");
    }

    /// TEST J: Verify all order fields affect hash (integrity)
    #[test]
    fn test_all_fields_affect_hash() {
        let owner = Pubkey::new_unique();
        let base_order = CompressedGhostOrder {
            owner,
            order_id: 1,
            market_index: 0,
            trigger_price: 50_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 1700000000,
            feed_id: [0u8; 32],
            salt: [10u8; 16],
        };

        let base_hash = base_order.compute_hash();

        let order_different_id = CompressedGhostOrder {
            order_id: 2,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_id.compute_hash(), "order_id affects hash");

        let order_different_market = CompressedGhostOrder {
            market_index: 1,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_market.compute_hash(), "market_index affects hash");

        let order_different_side = CompressedGhostOrder {
            order_side: OrderSide::Short,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_side.compute_hash(), "order_side affects hash");

        let order_different_condition = CompressedGhostOrder {
            trigger_condition: TriggerCondition::Above,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_condition.compute_hash(), "trigger_condition affects hash");

        let order_different_amount = CompressedGhostOrder {
            base_asset_amount: 2_000_000,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_amount.compute_hash(), "base_asset_amount affects hash");

        let order_different_reduce = CompressedGhostOrder {
            reduce_only: true,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_reduce.compute_hash(), "reduce_only affects hash");

        let order_different_expiry = CompressedGhostOrder {
            expiry: 1800000000,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_expiry.compute_hash(), "expiry affects hash");

        let mut different_feed = [0u8; 32];
        different_feed[0] = 1;
        let order_different_feed = CompressedGhostOrder {
            feed_id: different_feed,
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_feed.compute_hash(), "feed_id affects hash");

        let order_different_salt = CompressedGhostOrder {
            salt: [99u8; 16],
            ..base_order.clone()
        };
        assert_ne!(base_hash, order_different_salt.compute_hash(), "salt affects hash");
    }

    /// TEST K: Verify salt prevents rainbow table attacks
    #[test]
    fn test_salt_rainbow_table_defense() {
        let owner = Pubkey::new_unique();

        let order_salt1 = CompressedGhostOrder {
            owner,
            order_id: 1,
            market_index: 0,
            trigger_price: 180_000_000,
            trigger_condition: TriggerCondition::Below,
            order_side: OrderSide::Long,
            base_asset_amount: 1_000_000,
            reduce_only: false,
            expiry: 0,
            feed_id: [0u8; 32],
            salt: [1u8; 16],
        };

        let order_salt2 = CompressedGhostOrder {
            salt: [2u8; 16],
            ..order_salt1.clone()
        };

        let hash1 = order_salt1.compute_hash();
        let hash2 = order_salt2.compute_hash();

        assert_ne!(
            hash1, hash2,
            "Same order with different salt must produce different hashes (rainbow table defense)"
        );
    }

    fn create_test_executor(owner: Pubkey) -> ExecutorAuthority {
        ExecutorAuthority {
            owner,
            order_count: 0,
            is_delegated: false,
            bump: 255,
            order_hashes: [[0u8; 32]; MAX_ORDERS_PER_EXECUTOR],
            order_hash_count: 0,
            authorized_executors: [Pubkey::default(); MAX_AUTHORIZED_EXECUTORS],
            executor_count: 0,
        }
    }
}

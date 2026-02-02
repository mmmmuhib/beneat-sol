use anchor_lang::prelude::*;

pub const MAX_ORDERS_PER_EXECUTOR: usize = 16;

pub const MAX_AUTHORIZED_EXECUTORS: usize = 4;

#[account]
pub struct ExecutorAuthority {
    pub owner: Pubkey,
    pub order_count: u64,
    pub is_delegated: bool,
    pub bump: u8,
    pub order_hashes: [[u8; 32]; MAX_ORDERS_PER_EXECUTOR],
    pub order_hash_count: u8,
    pub authorized_executors: [Pubkey; MAX_AUTHORIZED_EXECUTORS],
    pub executor_count: u8,
}

impl ExecutorAuthority {
    pub const SEED_PREFIX: &'static [u8] = b"executor";

    pub const LEN: usize = 8 +      // discriminator
        32 +                         // owner
        8 +                          // order_count
        1 +                          // is_delegated
        1 +                          // bump
        (32 * MAX_ORDERS_PER_EXECUTOR) + // order_hashes (16 * 32 = 512)
        1 +                          // order_hash_count
        (32 * MAX_AUTHORIZED_EXECUTORS) + // authorized_executors (4 * 32 = 128)
        1;                           // executor_count

    pub fn add_order_hash(&mut self, hash: [u8; 32]) -> Result<()> {
        require!(
            (self.order_hash_count as usize) < MAX_ORDERS_PER_EXECUTOR,
            crate::errors::GhostBridgeError::MaxOrdersReached
        );

        for i in 0..self.order_hash_count as usize {
            if self.order_hashes[i] == hash {
                return Err(crate::errors::GhostBridgeError::OrderHashExists.into());
            }
        }

        self.order_hashes[self.order_hash_count as usize] = hash;
        self.order_hash_count += 1;
        self.order_count += 1;

        Ok(())
    }

    pub fn remove_order_hash(&mut self, hash: [u8; 32]) -> Result<()> {
        let mut found_index: Option<usize> = None;

        for i in 0..self.order_hash_count as usize {
            if self.order_hashes[i] == hash {
                found_index = Some(i);
                break;
            }
        }

        match found_index {
            Some(idx) => {
                for i in idx..(self.order_hash_count as usize - 1) {
                    self.order_hashes[i] = self.order_hashes[i + 1];
                }
                self.order_hashes[self.order_hash_count as usize - 1] = [0u8; 32];
                self.order_hash_count -= 1;
                Ok(())
            }
            None => Err(crate::errors::GhostBridgeError::OrderHashNotFound.into()),
        }
    }

    pub fn has_order_hash(&self, hash: &[u8; 32]) -> bool {
        for i in 0..self.order_hash_count as usize {
            if &self.order_hashes[i] == hash {
                return true;
            }
        }
        false
    }

    pub fn is_empty(&self) -> bool {
        self.order_hash_count == 0
    }

    pub fn is_authorized_executor(&self, executor: &Pubkey) -> bool {
        for i in 0..self.executor_count as usize {
            if &self.authorized_executors[i] == executor {
                return true;
            }
        }
        false
    }

    pub fn add_authorized_executor(&mut self, executor: Pubkey) -> Result<()> {
        require!(
            (self.executor_count as usize) < MAX_AUTHORIZED_EXECUTORS,
            crate::errors::GhostBridgeError::MaxExecutorsReached
        );

        for i in 0..self.executor_count as usize {
            if self.authorized_executors[i] == executor {
                return Ok(());
            }
        }

        self.authorized_executors[self.executor_count as usize] = executor;
        self.executor_count += 1;
        Ok(())
    }

    pub fn remove_authorized_executor(&mut self, executor: Pubkey) -> Result<()> {
        let mut found_index: Option<usize> = None;

        for i in 0..self.executor_count as usize {
            if self.authorized_executors[i] == executor {
                found_index = Some(i);
                break;
            }
        }

        if let Some(idx) = found_index {
            for i in idx..(self.executor_count as usize - 1) {
                self.authorized_executors[i] = self.authorized_executors[i + 1];
            }
            self.authorized_executors[self.executor_count as usize - 1] = Pubkey::default();
            self.executor_count -= 1;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_executor() -> ExecutorAuthority {
        ExecutorAuthority {
            owner: Pubkey::new_unique(),
            order_count: 0,
            is_delegated: false,
            bump: 255,
            order_hashes: [[0u8; 32]; MAX_ORDERS_PER_EXECUTOR],
            order_hash_count: 0,
            authorized_executors: [Pubkey::default(); MAX_AUTHORIZED_EXECUTORS],
            executor_count: 0,
        }
    }

    #[test]
    fn test_add_and_remove_hash() {
        let mut executor = create_test_executor();
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

    #[test]
    fn test_max_orders_limit() {
        let mut executor = create_test_executor();

        for i in 0..MAX_ORDERS_PER_EXECUTOR {
            let mut hash = [0u8; 32];
            hash[0] = i as u8;
            executor.add_order_hash(hash).unwrap();
        }

        let overflow_hash = [255u8; 32];
        assert!(executor.add_order_hash(overflow_hash).is_err());
    }

    #[test]
    fn test_add_authorized_executor() {
        let mut executor = create_test_executor();
        let tee_pubkey = Pubkey::new_unique();

        executor.add_authorized_executor(tee_pubkey).unwrap();

        assert_eq!(executor.executor_count, 1);
        assert!(executor.is_authorized_executor(&tee_pubkey));
    }

    #[test]
    fn test_remove_authorized_executor() {
        let mut executor = create_test_executor();
        let tee_pubkey = Pubkey::new_unique();

        executor.add_authorized_executor(tee_pubkey).unwrap();
        assert!(executor.is_authorized_executor(&tee_pubkey));

        executor.remove_authorized_executor(tee_pubkey).unwrap();
        assert!(!executor.is_authorized_executor(&tee_pubkey));
        assert_eq!(executor.executor_count, 0);
    }

    #[test]
    fn test_max_executors_limit() {
        let mut executor = create_test_executor();

        for _ in 0..MAX_AUTHORIZED_EXECUTORS {
            executor.add_authorized_executor(Pubkey::new_unique()).unwrap();
        }

        assert_eq!(executor.executor_count, MAX_AUTHORIZED_EXECUTORS as u8);
        assert!(executor.add_authorized_executor(Pubkey::new_unique()).is_err());
    }

    #[test]
    fn test_add_duplicate_executor_is_idempotent() {
        let mut executor = create_test_executor();
        let tee_pubkey = Pubkey::new_unique();

        executor.add_authorized_executor(tee_pubkey).unwrap();
        executor.add_authorized_executor(tee_pubkey).unwrap();

        assert_eq!(executor.executor_count, 1);
    }
}

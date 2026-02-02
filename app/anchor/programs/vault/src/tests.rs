#[cfg(test)]
mod tests {
    use anchor_lang::Space;
    use crate::state::Vault;
    use crate::ID as PROGRAM_ID;
    use litesvm::LiteSVM;
    use solana_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        system_program,
        transaction::Transaction,
    };

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

    fn get_vault_pda(owner: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[Vault::SEED_PREFIX, owner.as_ref()], &PROGRAM_ID)
    }

    fn create_initialize_ix(owner: &Pubkey, vault: &Pubkey, lockout_duration: u32) -> Instruction {
        let discriminator = sighash("initialize");
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&lockout_duration.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn create_deposit_ix(owner: &Pubkey, vault: &Pubkey, amount: u64) -> Instruction {
        let discriminator = sighash("deposit");
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn create_withdraw_ix(owner: &Pubkey, vault: &Pubkey, amount: u64) -> Instruction {
        let discriminator = sighash("withdraw");
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*vault, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        }
    }

    fn create_manual_lock_ix(owner: &Pubkey, vault: &Pubkey) -> Instruction {
        let discriminator = sighash("manual_lock");

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(*owner, true),
                AccountMeta::new(*vault, false),
            ],
            data: discriminator.to_vec(),
        }
    }

    fn create_set_rules_ix(
        owner: &Pubkey,
        vault: &Pubkey,
        daily_loss_limit: u64,
        max_trades_per_day: u8,
        lockout_duration: u32,
    ) -> Instruction {
        let discriminator = sighash("set_rules");
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&daily_loss_limit.to_le_bytes());
        data.push(max_trades_per_day);
        data.extend_from_slice(&lockout_duration.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(*owner, true),
                AccountMeta::new(*vault, false),
            ],
            data,
        }
    }

    fn sighash(name: &str) -> [u8; 8] {
        let preimage = format!("global:{}", name);
        let mut sighash = [0u8; 8];
        sighash.copy_from_slice(
            &solana_sdk::hash::hash(preimage.as_bytes()).to_bytes()[..8],
        );
        sighash
    }

    fn setup_test() -> (LiteSVM, Keypair, Pubkey, u8) {
        let mut svm = LiteSVM::new();
        let program_bytes = include_bytes!("../../../target/deploy/vault.so");
        let _ = svm.add_program(PROGRAM_ID, program_bytes);

        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

        let (vault_pda, bump) = get_vault_pda(&user.pubkey());
        (svm, user, vault_pda, bump)
    }

    fn initialize_vault(svm: &mut LiteSVM, user: &Keypair, vault_pda: &Pubkey, lockout_duration: u32) {
        let init_ix = create_initialize_ix(&user.pubkey(), vault_pda, lockout_duration);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&user.pubkey()),
            &[user],
            blockhash,
        );
        svm.send_transaction(tx).expect("Initialize should succeed");
    }

    #[test]
    fn test_initialize_and_deposit() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let deposit_amount = LAMPORTS_PER_SOL;
        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, deposit_amount);

        let blockhash = svm.latest_blockhash();
        let deposit_tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(deposit_tx);
        assert!(result.is_ok(), "Deposit should succeed");

        let vault_account = svm.get_account(&vault_pda).unwrap();
        let vault_balance_before = svm.minimum_balance_for_rent_exemption(8 + Vault::INIT_SPACE);
        assert!(
            vault_account.lamports >= vault_balance_before,
            "Vault should have at least rent + deposit: expected >= {}, got {}",
            vault_balance_before,
            vault_account.lamports
        );
    }

    #[test]
    fn test_deposit_and_withdraw() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let deposit_amount = LAMPORTS_PER_SOL;
        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, deposit_amount);
        let blockhash = svm.latest_blockhash();
        let deposit_tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(deposit_tx).expect("Deposit should succeed");

        let user_balance_after_deposit = svm.get_account(&user.pubkey()).unwrap().lamports;

        let withdraw_ix = create_withdraw_ix(&user.pubkey(), &vault_pda, deposit_amount);
        let blockhash = svm.latest_blockhash();
        let withdraw_tx = Transaction::new_signed_with_payer(
            &[withdraw_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(withdraw_tx);
        assert!(result.is_ok(), "Withdraw should succeed");

        let user_balance_after_withdraw = svm.get_account(&user.pubkey()).unwrap().lamports;
        assert!(
            user_balance_after_withdraw > user_balance_after_deposit,
            "User should have more SOL after withdraw"
        );
    }

    #[test]
    fn test_withdraw_blocked_when_locked() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let set_rules_ix = create_set_rules_ix(&user.pubkey(), &vault_pda, 0, 0, 3600);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[set_rules_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(tx).expect("Set rules should succeed");

        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let deposit_tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(deposit_tx).expect("Deposit should succeed");

        let lock_ix = create_manual_lock_ix(&user.pubkey(), &vault_pda);
        let blockhash = svm.latest_blockhash();
        let lock_tx = Transaction::new_signed_with_payer(
            &[lock_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(lock_tx).expect("Manual lock should succeed");

        let withdraw_ix = create_withdraw_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL / 2);
        let blockhash = svm.latest_blockhash();
        let withdraw_tx = Transaction::new_signed_with_payer(
            &[withdraw_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(withdraw_tx);
        assert!(result.is_err(), "Withdraw should fail when vault is locked");
    }

    #[test]
    fn test_withdraw_fails_with_insufficient_funds() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let deposit_tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(deposit_tx).expect("Deposit should succeed");

        let withdraw_ix = create_withdraw_ix(&user.pubkey(), &vault_pda, 100 * LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let withdraw_tx = Transaction::new_signed_with_payer(
            &[withdraw_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(withdraw_tx);
        assert!(result.is_err(), "Withdraw should fail with insufficient funds");
    }

    #[test]
    fn test_deposit_fails_without_initialize() {
        let (mut svm, user, vault_pda, _) = setup_test();

        let deposit_ix = create_deposit_ix(&user.pubkey(), &vault_pda, LAMPORTS_PER_SOL);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[deposit_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "Deposit should fail without initialization");
    }

    fn create_swap_ix(owner: &Pubkey, vault: &Pubkey, amount_in: u64, min_out: u64) -> Instruction {
        let discriminator = sighash("swap_with_enforcement");
        let mut data = discriminator.to_vec();
        data.extend_from_slice(&amount_in.to_le_bytes());
        data.extend_from_slice(&min_out.to_le_bytes());

        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*owner, true),
                AccountMeta::new(*vault, false),
            ],
            data,
        }
    }

    #[test]
    fn test_swap_blocked_when_locked() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let lock_ix = create_manual_lock_ix(&user.pubkey(), &vault_pda);
        let blockhash = svm.latest_blockhash();
        let lock_tx = Transaction::new_signed_with_payer(
            &[lock_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(lock_tx).expect("Manual lock should succeed");

        let swap_ix = create_swap_ix(&user.pubkey(), &vault_pda, 1000, 900);
        let blockhash = svm.latest_blockhash();
        let swap_tx = Transaction::new_signed_with_payer(
            &[swap_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(swap_tx);
        assert!(result.is_err(), "Swap should fail when vault is locked");
    }

    #[test]
    fn test_swap_blocked_during_cooldown() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let set_rules_ix = create_set_rules_ix(&user.pubkey(), &vault_pda, 1000000, 10, 3600);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[set_rules_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(tx).expect("Set rules should succeed");

        let mut vault_account = svm.get_account(&vault_pda).unwrap();
        let last_trade_was_loss_offset = calculate_last_trade_was_loss_offset();
        vault_account.data[last_trade_was_loss_offset] = 1;

        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let time_bytes = current_time.to_le_bytes();
        let last_trade_time_offset = last_trade_was_loss_offset + 1;
        vault_account.data[last_trade_time_offset..last_trade_time_offset + 8].copy_from_slice(&time_bytes);

        svm.set_account(vault_pda, vault_account).unwrap();

        let swap_ix = create_swap_ix(&user.pubkey(), &vault_pda, 1000, 900);
        let blockhash = svm.latest_blockhash();
        let swap_tx = Transaction::new_signed_with_payer(
            &[swap_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(swap_tx);
        assert!(result.is_err(), "Swap should fail during cooldown period");
    }

    #[test]
    fn test_swap_blocked_at_trade_limit() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let set_rules_ix = create_set_rules_ix(&user.pubkey(), &vault_pda, 1000000, 2, 3600);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[set_rules_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(tx).expect("Set rules should succeed");

        for i in 0..2 {
            let swap_ix = create_swap_ix(&user.pubkey(), &vault_pda, 1000 + i, 900);
            let blockhash = svm.latest_blockhash();
            let swap_tx = Transaction::new_signed_with_payer(
                &[swap_ix],
                Some(&user.pubkey()),
                &[&user],
                blockhash,
            );
            svm.send_transaction(swap_tx).expect(&format!("Swap {} should succeed", i + 1));
        }

        let swap_ix = create_swap_ix(&user.pubkey(), &vault_pda, 1002, 900);
        let blockhash = svm.latest_blockhash();
        let swap_tx = Transaction::new_signed_with_payer(
            &[swap_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(swap_tx);
        assert!(result.is_err(), "Swap should fail when trade limit exceeded");
    }

    #[test]
    fn test_swap_success_updates_tracking() {
        let (mut svm, user, vault_pda, _) = setup_test();

        initialize_vault(&mut svm, &user, &vault_pda, 3600);

        let set_rules_ix = create_set_rules_ix(&user.pubkey(), &vault_pda, 1000000, 10, 3600);
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[set_rules_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );
        svm.send_transaction(tx).expect("Set rules should succeed");

        let vault_before = svm.get_account(&vault_pda).unwrap();
        let trades_today_offset = calculate_trades_today_offset();
        let trades_before = vault_before.data[trades_today_offset];

        let swap_ix = create_swap_ix(&user.pubkey(), &vault_pda, 1000, 900);
        let blockhash = svm.latest_blockhash();
        let swap_tx = Transaction::new_signed_with_payer(
            &[swap_ix],
            Some(&user.pubkey()),
            &[&user],
            blockhash,
        );

        let result = svm.send_transaction(swap_tx);
        assert!(result.is_ok(), "Swap should succeed");

        let vault_after = svm.get_account(&vault_pda).unwrap();
        let trades_after = vault_after.data[trades_today_offset];

        assert_eq!(trades_after, trades_before + 1, "trades_today should increment by 1");
    }

    fn calculate_trades_today_offset() -> usize {
        8 +  // discriminator
        32 + // owner (Pubkey)
        1 +  // bump (u8)
        1 +  // is_locked (bool)
        8 +  // lockout_until (i64)
        4 +  // lockout_count (u32)
        4 +  // lockout_duration (u32)
        8 +  // daily_loss_limit (u64)
        1    // max_trades_per_day (u8)
    }

    fn calculate_last_trade_was_loss_offset() -> usize {
        calculate_trades_today_offset() +
        1 +  // trades_today (u8)
        8 +  // session_start (i64)
        8 +  // total_deposited (u64)
        8    // total_withdrawn (u64)
    }
}

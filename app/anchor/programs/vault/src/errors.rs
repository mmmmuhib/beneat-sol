use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Vault is currently locked")]
    VaultLocked,
    #[msg("Lockout period has not expired")]
    LockoutNotExpired,
    #[msg("Daily trade limit exceeded")]
    TradeLimitExceeded,
    #[msg("Daily loss limit exceeded")]
    LossLimitExceeded,
    #[msg("Insufficient funds in vault")]
    InsufficientFunds,
    #[msg("Invalid amount specified")]
    InvalidAmount,
    #[msg("Vault already initialized")]
    VaultAlreadyInitialized,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid lockout duration")]
    InvalidLockoutDuration,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Cooldown period is active after loss")]
    CooldownActive,
    #[msg("Position size exceeds maximum allowed")]
    ExceedsMaxPosition,
    #[msg("Swap execution failed")]
    SwapFailed,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid Jupiter program")]
    InvalidJupiterProgram,
    #[msg("Swap is already in progress")]
    SwapAlreadyInProgress,
    #[msg("No swap is currently in progress")]
    NoSwapInProgress,
}

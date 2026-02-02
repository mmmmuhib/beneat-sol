use anchor_lang::prelude::*;

#[error_code]
pub enum GhostBridgeError {
    #[msg("Executor authority already initialized")]
    ExecutorAlreadyInitialized,

    #[msg("Executor authority not found")]
    ExecutorNotFound,

    #[msg("Maximum orders per executor reached (16)")]
    MaxOrdersReached,

    #[msg("Order hash already exists")]
    OrderHashExists,

    #[msg("Order hash not found in executor")]
    OrderHashNotFound,

    #[msg("Order hash mismatch - data does not match stored hash")]
    OrderHashMismatch,

    #[msg("Order has expired")]
    OrderExpired,

    #[msg("Trigger condition not met")]
    TriggerConditionNotMet,

    #[msg("Invalid trigger condition")]
    InvalidTriggerCondition,

    #[msg("Unauthorized - only executor authority owner can perform this action")]
    Unauthorized,

    #[msg("Light Protocol CPI failed")]
    LightCpiFailed,

    #[msg("Drift CPI failed")]
    DriftCpiFailed,

    #[msg("Magic Action execution failed")]
    MagicActionFailed,

    #[msg("Invalid order data")]
    InvalidOrderData,

    #[msg("Executor is delegated - cannot modify directly")]
    ExecutorDelegated,

    #[msg("Executor is not delegated")]
    ExecutorNotDelegated,

    #[msg("Encrypted data exceeds maximum length")]
    EncryptedDataTooLong,

    #[msg("Order is not in triggered state")]
    OrderNotTriggered,

    #[msg("Order is not active")]
    OrderNotActive,

    #[msg("Crank scheduling failed")]
    CrankSchedulingFailed,

    #[msg("Executor not authorized to trigger this order")]
    ExecutorNotAuthorized,

    #[msg("Maximum authorized executors reached (4)")]
    MaxExecutorsReached,

    #[msg("Invalid Pyth price feed account")]
    InvalidPriceFeed,
}

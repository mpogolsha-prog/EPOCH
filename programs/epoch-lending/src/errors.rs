use anchor_lang::prelude::*;

#[error_code]
pub enum EpochError {
    #[msg("Invalid term: must be 7, 14, or 30 days")]
    InvalidTerm,
    #[msg("Invalid rate: must be greater than 0")]
    InvalidRate,
    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,
    #[msg("Insufficient collateral: does not meet required ratio")]
    InsufficientCollateral,
    #[msg("Orders cannot be matched: lend min rate exceeds borrow max rate")]
    OrdersDoNotMatch,
    #[msg("Order is not open")]
    OrderNotOpen,
    #[msg("Loan is not active")]
    LoanNotActive,
    #[msg("Loan has not matured yet")]
    LoanNotMatured,
    #[msg("Loan is not eligible for liquidation: collateral ratio above threshold")]
    NotLiquidatable,
    #[msg("Oracle price is stale: exceeds maximum age")]
    StalePriceOracle,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized: signer does not match expected authority")]
    Unauthorized,
    #[msg("Market term mismatch between orders")]
    TermMismatch,
    #[msg("Market mismatch between orders")]
    MarketMismatch,
}

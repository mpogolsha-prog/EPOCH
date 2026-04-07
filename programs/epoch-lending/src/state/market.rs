use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Term length in days (7, 14, or 30)
    pub term_days: u16,
    /// Collateral token mint (SOL/wSOL for MVP)
    pub collateral_mint: Pubkey,
    /// Lending token mint (USDC)
    pub usdc_mint: Pubkey,
    /// Authority that created this market
    pub authority: Pubkey,
    /// Required collateral ratio in basis points (15000 = 150%)
    pub collateral_ratio_bps: u16,
    /// Liquidation threshold in basis points (12000 = 120%)
    pub liquidation_threshold_bps: u16,
    /// Protocol fee in basis points on matched volume
    pub protocol_fee_bps: u16,
    /// Running counter for order IDs
    pub next_order_id: u64,
    /// Running counter for loan IDs
    pub next_loan_id: u64,
    /// Total number of active lend orders
    pub active_lend_orders: u32,
    /// Total number of active borrow orders
    pub active_borrow_orders: u32,
    /// Total number of active loans
    pub active_loans: u32,
    /// PDA bump seed
    pub bump: u8,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";
}

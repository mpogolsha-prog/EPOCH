use anchor_lang::prelude::*;

use super::lend_order::OrderStatus;

#[account]
#[derive(InitSpace)]
pub struct BorrowOrder {
    /// Market this order belongs to
    pub market: Pubkey,
    /// Owner (borrower) of this order
    pub owner: Pubkey,
    /// USDC amount to borrow (in token base units, 6 decimals)
    pub amount: u64,
    /// Maximum acceptable APY rate in basis points (e.g., 850 = 8.5%)
    pub max_rate_bps: u16,
    /// SOL collateral deposited (in lamports)
    pub collateral_amount: u64,
    /// Order status
    pub status: OrderStatus,
    /// Sequential order ID within the market
    pub order_id: u64,
    /// Unix timestamp when order was created
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl BorrowOrder {
    pub const SEED_PREFIX: &'static [u8] = b"borrow_order";
}

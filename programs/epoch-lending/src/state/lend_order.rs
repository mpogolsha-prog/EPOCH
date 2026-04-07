use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderStatus {
    Open,
    Filled,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct LendOrder {
    /// Market this order belongs to
    pub market: Pubkey,
    /// Owner (lender) of this order
    pub owner: Pubkey,
    /// USDC amount to lend (in token base units, 6 decimals)
    pub amount: u64,
    /// Minimum acceptable APY rate in basis points (e.g., 800 = 8.0%)
    pub min_rate_bps: u16,
    /// Order status
    pub status: OrderStatus,
    /// Sequential order ID within the market
    pub order_id: u64,
    /// Unix timestamp when order was created
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl LendOrder {
    pub const SEED_PREFIX: &'static [u8] = b"lend_order";
}

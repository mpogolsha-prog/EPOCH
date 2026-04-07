use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoanStatus {
    Active,
    Repaid,
    Liquidated,
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    /// Market this loan belongs to
    pub market: Pubkey,
    /// Lender address
    pub lender: Pubkey,
    /// Borrower address
    pub borrower: Pubkey,
    /// Original lend order PDA
    pub lend_order: Pubkey,
    /// Original borrow order PDA
    pub borrow_order: Pubkey,
    /// USDC principal amount (in token base units, 6 decimals)
    pub principal: u64,
    /// Fixed APY rate in basis points (e.g., 800 = 8.0%)
    pub rate_bps: u16,
    /// Term length in days
    pub term_days: u16,
    /// SOL collateral locked (in lamports)
    pub collateral_amount: u64,
    /// Unix timestamp when loan was created (maturity = start_time + term_days * 86400)
    pub start_time: i64,
    /// Unix timestamp of maturity
    pub maturity: i64,
    /// Loan status
    pub status: LoanStatus,
    /// Sequential loan ID within the market
    pub loan_id: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl Loan {
    pub const SEED_PREFIX: &'static [u8] = b"loan";

    /// Calculate interest owed: principal * rate_bps * term_days / (10000 * 365)
    pub fn interest_due(&self) -> Result<u64> {
        let interest = (self.principal as u128)
            .checked_mul(self.rate_bps as u128)
            .unwrap()
            .checked_mul(self.term_days as u128)
            .unwrap()
            .checked_div(10_000u128 * 365u128)
            .unwrap();
        Ok(interest as u64)
    }
}

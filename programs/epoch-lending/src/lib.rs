use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk");

#[program]
pub mod epoch_lending {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        term_days: u16,
        collateral_ratio_bps: u16,
        liquidation_threshold_bps: u16,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        instructions::create_market::handle_create_market(
            ctx,
            term_days,
            collateral_ratio_bps,
            liquidation_threshold_bps,
            protocol_fee_bps,
        )
    }

    pub fn place_lend_order(
        ctx: Context<PlaceLendOrder>,
        amount: u64,
        min_rate_bps: u16,
    ) -> Result<()> {
        instructions::place_lend_order::handle_place_lend_order(ctx, amount, min_rate_bps)
    }

    pub fn place_borrow_order(
        ctx: Context<PlaceBorrowOrder>,
        amount: u64,
        max_rate_bps: u16,
        collateral_amount: u64,
    ) -> Result<()> {
        instructions::place_borrow_order::handle_place_borrow_order(
            ctx,
            amount,
            max_rate_bps,
            collateral_amount,
        )
    }

    pub fn match_orders(ctx: Context<MatchOrders>) -> Result<()> {
        instructions::match_orders::handle_match_orders(ctx)
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        instructions::repay_loan::handle_repay_loan(ctx)
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        instructions::liquidate::handle_liquidate(ctx)
    }

    /// Mock liquidation for localnet testing — bypasses Pyth oracle,
    /// accepts a manual SOL price in USDC 6-decimal units.
    pub fn mock_liquidate(
        ctx: Context<MockLiquidate>,
        sol_price_usdc: u64,
    ) -> Result<()> {
        instructions::mock_liquidate::handle_mock_liquidate(ctx, sol_price_usdc)
    }
}

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::errors::EpochError;
use crate::state::{Loan, Market};
use crate::state::loan::LoanStatus;

use super::liquidate::execute_liquidation;

const SOL_DECIMALS: u128 = 1_000_000_000; // 10^9

/// Mock liquidation for localnet testing — accepts a manual SOL price
/// instead of reading from Pyth oracle.
///
/// `sol_price_usdc` is the SOL price in USDC 6-decimal units
/// (e.g., 150_000_000 = $150.00).
pub fn handle_mock_liquidate(
    ctx: Context<MockLiquidate>,
    sol_price_usdc: u64,
) -> Result<()> {
    let loan = &ctx.accounts.loan;
    require!(loan.status == LoanStatus::Active, EpochError::LoanNotActive);
    require!(sol_price_usdc > 0, EpochError::StalePriceOracle);

    // collateral_value = collateral_amount * sol_price / 10^9
    let collateral_value_usdc = (loan.collateral_amount as u128)
        .checked_mul(sol_price_usdc as u128)
        .ok_or(EpochError::MathOverflow)?
        .checked_div(SOL_DECIMALS)
        .ok_or(EpochError::MathOverflow)?;

    // Grab AccountInfo refs before mutable borrows
    let market_info = ctx.accounts.market.to_account_info();
    let liquidator_info = ctx.accounts.liquidator_collateral_account.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();

    execute_liquidation(
        &mut ctx.accounts.loan,
        &mut ctx.accounts.market,
        &ctx.accounts.collateral_vault,
        &liquidator_info,
        &market_info,
        &token_program_info,
        collateral_value_usdc,
    )
}

#[derive(Accounts)]
pub struct MockLiquidate<'info> {
    #[account(
        mut,
        constraint = loan.market == market.key() @ EpochError::MarketMismatch,
        constraint = loan.status == LoanStatus::Active @ EpochError::LoanNotActive,
    )]
    pub loan: Account<'info, Loan>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = collateral_vault.mint == market.collateral_mint,
        constraint = collateral_vault.owner == market.key(),
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = liquidator_collateral_account.mint == market.collateral_mint,
        constraint = liquidator_collateral_account.owner == liquidator.key(),
    )]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

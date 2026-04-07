use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::errors::EpochError;
use crate::state::{Loan, Market};
use crate::state::loan::LoanStatus;

/// Pyth SOL/USD price feed ID (same on mainnet and devnet)
const SOL_USD_FEED_ID: &str =
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

/// Maximum acceptable age for Pyth price data (30 seconds)
const MAX_PRICE_AGE_SECONDS: u64 = 30;

/// Shared liquidation logic used by both `liquidate` (Pyth) and `mock_liquidate`.
///
/// `collateral_value_usdc` is the collateral's current value in USDC 6-decimal units.
pub fn execute_liquidation<'info>(
    loan: &mut Account<'info, Loan>,
    market: &mut Account<'info, Market>,
    collateral_vault: &Account<'info, TokenAccount>,
    liquidator_collateral_account: &AccountInfo<'info>,
    market_info: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    collateral_value_usdc: u128,
) -> Result<()> {
    // --- LTV check ---
    // ltv_bps = principal * 10_000 / collateral_value
    // If collateral is worthless, the loan is unconditionally liquidatable.
    if collateral_value_usdc > 0 {
        let ltv_bps = (loan.principal as u128)
            .checked_mul(10_000)
            .ok_or(EpochError::MathOverflow)?
            .checked_div(collateral_value_usdc)
            .ok_or(EpochError::MathOverflow)?;

        require!(
            ltv_bps > market.liquidation_threshold_bps as u128,
            EpochError::NotLiquidatable
        );
    }

    // --- Transfer collateral from vault to liquidator ---
    // The vault is owned by the market PDA, so we sign with market seeds.
    let term_bytes = market.term_days.to_le_bytes();
    let market_bump = [market.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        Market::SEED_PREFIX,
        &term_bytes,
        market.collateral_mint.as_ref(),
        &market_bump,
    ]];

    let transfer_accounts = Transfer {
        from: collateral_vault.to_account_info(),
        to: liquidator_collateral_account.clone(),
        authority: market_info.clone(),
    };
    token::transfer(
        CpiContext::new_with_signer(token_program.clone(), transfer_accounts, signer_seeds),
        loan.collateral_amount,
    )?;

    // --- Update state ---
    loan.status = LoanStatus::Liquidated;
    market.active_loans = market.active_loans.saturating_sub(1);

    msg!(
        "Loan #{} liquidated: {} collateral seized, LTV exceeded {}bps threshold",
        loan.loan_id,
        loan.collateral_amount,
        market.liquidation_threshold_bps,
    );

    Ok(())
}

pub fn handle_liquidate(ctx: Context<Liquidate>) -> Result<()> {
    let loan = &ctx.accounts.loan;
    require!(loan.status == LoanStatus::Active, EpochError::LoanNotActive);

    // --- Read SOL/USD price from Pyth ---
    let price_update = &ctx.accounts.price_update;
    let feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)
        .map_err(|_| error!(EpochError::StalePriceOracle))?;
    let price_data = price_update
        .get_price_no_older_than(&Clock::get()?, MAX_PRICE_AGE_SECONDS, &feed_id)
        .map_err(|_| error!(EpochError::StalePriceOracle))?;

    require!(price_data.price > 0, EpochError::StalePriceOracle);

    // --- Calculate collateral value in USDC (6 decimals) ---
    // Formula: value_usdc_6dec = collateral_lamports * pyth_price * 10^(exponent - 3)
    // For typical exponent = -8: divide by 10^11
    let numerator = (loan.collateral_amount as u128)
        .checked_mul(price_data.price as u128)
        .ok_or(EpochError::MathOverflow)?;

    let adjustment = (price_data.exponent as i64) - 3;
    let collateral_value_usdc: u128 = if adjustment >= 0 {
        numerator
            .checked_mul(10u128.pow(adjustment as u32))
            .ok_or(EpochError::MathOverflow)?
    } else {
        numerator
            .checked_div(10u128.pow((-adjustment) as u32))
            .ok_or(EpochError::MathOverflow)?
    };

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
pub struct Liquidate<'info> {
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

    /// Pyth price feed account for SOL/USD
    pub price_update: Account<'info, PriceUpdateV2>,

    #[account(mut)]
    pub liquidator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

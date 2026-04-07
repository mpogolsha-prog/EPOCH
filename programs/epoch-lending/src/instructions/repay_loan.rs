use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::EpochError;
use crate::state::{Loan, Market};
use crate::state::loan::LoanStatus;

/// Hardcoded treasury address for protocol fee collection.
/// Replace with a governance-controlled PDA in production.
const TREASURY_PUBKEY: &str = "EPocHxHquRVgMov168cFmKnLx6FkSDCXCQmeFtjJaPgA";

pub fn handle_repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
    let loan = &ctx.accounts.loan;
    require!(loan.status == LoanStatus::Active, EpochError::LoanNotActive);

    let interest = loan.interest_due()?;
    let total_repayment = loan
        .principal
        .checked_add(interest)
        .ok_or(EpochError::MathOverflow)?;

    // Protocol fee: 10 bps of principal
    let protocol_fee = loan
        .principal
        .checked_mul(10)
        .ok_or(EpochError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(EpochError::MathOverflow)?;

    // 1. Transfer USDC (principal + interest) from borrower to lender
    let repay_accounts = Transfer {
        from: ctx.accounts.borrower_usdc_account.to_account_info(),
        to: ctx.accounts.lender_usdc_account.to_account_info(),
        authority: ctx.accounts.borrower.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), repay_accounts),
        total_repayment,
    )?;

    // 2. Transfer protocol fee from borrower to treasury
    if protocol_fee > 0 {
        let fee_accounts = Transfer {
            from: ctx.accounts.borrower_usdc_account.to_account_info(),
            to: ctx.accounts.treasury_usdc_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), fee_accounts),
            protocol_fee,
        )?;
    }

    // 3. Return collateral from vault to borrower (market PDA signs)
    let market = &ctx.accounts.market;
    let term_bytes = market.term_days.to_le_bytes();
    let market_bump = [market.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        Market::SEED_PREFIX,
        &term_bytes,
        market.collateral_mint.as_ref(),
        &market_bump,
    ]];

    let collateral_accounts = Transfer {
        from: ctx.accounts.collateral_vault.to_account_info(),
        to: ctx.accounts.borrower_wsol_account.to_account_info(),
        authority: ctx.accounts.market.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            collateral_accounts,
            signer_seeds,
        ),
        loan.collateral_amount,
    )?;

    // 4. Update state
    let loan = &mut ctx.accounts.loan;
    loan.status = LoanStatus::Repaid;

    let market = &mut ctx.accounts.market;
    market.active_loans = market.active_loans.saturating_sub(1);

    msg!(
        "Loan #{} repaid: {} principal + {} interest, {} fee, {} collateral returned",
        loan.loan_id,
        loan.principal,
        interest,
        protocol_fee,
        loan.collateral_amount
    );

    Ok(())
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(
        mut,
        constraint = loan.borrower == borrower.key() @ EpochError::Unauthorized,
        constraint = loan.status == LoanStatus::Active @ EpochError::LoanNotActive,
        constraint = loan.market == market.key() @ EpochError::MarketMismatch,
    )]
    pub loan: Account<'info, Loan>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = borrower_usdc_account.owner == borrower.key(),
        constraint = borrower_usdc_account.mint == market.usdc_mint,
    )]
    pub borrower_usdc_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = lender_usdc_account.owner == loan.lender,
        constraint = lender_usdc_account.mint == market.usdc_mint,
    )]
    pub lender_usdc_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = treasury_usdc_account.mint == market.usdc_mint,
    )]
    pub treasury_usdc_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = collateral_vault.mint == market.collateral_mint,
        constraint = collateral_vault.owner == market.key(),
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = borrower_wsol_account.mint == market.collateral_mint,
        constraint = borrower_wsol_account.owner == borrower.key(),
    )]
    pub borrower_wsol_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub borrower: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

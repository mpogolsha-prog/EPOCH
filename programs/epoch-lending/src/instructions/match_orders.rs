use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::EpochError;
use crate::state::{LendOrder, BorrowOrder, Loan, Market};
use crate::state::lend_order::OrderStatus;
use crate::state::loan::LoanStatus;

pub fn handle_match_orders(ctx: Context<MatchOrders>) -> Result<()> {
    let lend_order = &ctx.accounts.lend_order;
    let borrow_order = &ctx.accounts.borrow_order;

    // Validate both orders are open
    require!(lend_order.status == OrderStatus::Open, EpochError::OrderNotOpen);
    require!(borrow_order.status == OrderStatus::Open, EpochError::OrderNotOpen);

    // Validate same market
    require!(
        lend_order.market == borrow_order.market,
        EpochError::MarketMismatch
    );

    // Matching condition: lend_min_rate <= borrow_max_rate
    require!(
        lend_order.min_rate_bps <= borrow_order.max_rate_bps,
        EpochError::OrdersDoNotMatch
    );

    // Execution rate: maker (lender) gets their price
    let execution_rate_bps = lend_order.min_rate_bps;

    // Use the smaller amount (partial fills in future iteration)
    let matched_amount = lend_order.amount.min(borrow_order.amount);

    // Capture immutable values and AccountInfo refs before mutable borrows
    let collateral_amount = borrow_order.collateral_amount;
    let lender_key = lend_order.owner;
    let borrower_key = borrow_order.owner;
    let lend_order_key = ctx.accounts.lend_order.key();
    let borrow_order_key = ctx.accounts.borrow_order.key();
    let market_info = ctx.accounts.market.to_account_info();
    let vault_info = ctx.accounts.vault_usdc_account.to_account_info();
    let borrower_usdc_info = ctx.accounts.borrower_usdc_account.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();

    let market = &mut ctx.accounts.market;
    let loan_id = market.next_loan_id;
    market.next_loan_id = market
        .next_loan_id
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;
    market.active_loans = market
        .active_loans
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;

    let clock = Clock::get()?;
    let start_time = clock.unix_timestamp;
    let maturity = start_time
        .checked_add((market.term_days as i64).checked_mul(86400).unwrap())
        .ok_or(EpochError::MathOverflow)?;

    // Transfer USDC from vault to borrower (market PDA signs as vault owner)
    let term_bytes = market.term_days.to_le_bytes();
    let market_bump = [market.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        Market::SEED_PREFIX,
        &term_bytes,
        market.collateral_mint.as_ref(),
        &market_bump,
    ]];

    let transfer_accounts = Transfer {
        from: vault_info,
        to: borrower_usdc_info,
        authority: market_info,
    };
    token::transfer(
        CpiContext::new_with_signer(token_program_info, transfer_accounts, signer_seeds),
        matched_amount,
    )?;

    // Create loan
    let loan = &mut ctx.accounts.loan;
    loan.market = market.key();
    loan.lender = lender_key;
    loan.borrower = borrower_key;
    loan.lend_order = lend_order_key;
    loan.borrow_order = borrow_order_key;
    loan.principal = matched_amount;
    loan.rate_bps = execution_rate_bps;
    loan.term_days = market.term_days;
    loan.collateral_amount = collateral_amount;
    loan.start_time = start_time;
    loan.maturity = maturity;
    loan.status = LoanStatus::Active;
    loan.loan_id = loan_id;
    loan.bump = ctx.bumps.loan;

    // Mark orders as filled
    let lend_order = &mut ctx.accounts.lend_order;
    lend_order.status = OrderStatus::Filled;

    let borrow_order = &mut ctx.accounts.borrow_order;
    borrow_order.status = OrderStatus::Filled;

    msg!(
        "Orders matched: {} USDC @ {}bps, loan #{}, matures {}",
        matched_amount,
        execution_rate_bps,
        loan_id,
        maturity
    );

    Ok(())
}

#[derive(Accounts)]
pub struct MatchOrders<'info> {
    #[account(
        init,
        payer = matcher,
        space = 8 + Loan::INIT_SPACE,
        seeds = [
            Loan::SEED_PREFIX,
            market.key().as_ref(),
            &market.next_loan_id.to_le_bytes(),
        ],
        bump,
    )]
    pub loan: Account<'info, Loan>,

    #[account(mut)]
    pub lend_order: Account<'info, LendOrder>,

    #[account(mut)]
    pub borrow_order: Account<'info, BorrowOrder>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = vault_usdc_account.mint == market.usdc_mint,
        constraint = vault_usdc_account.owner == market.key(),
    )]
    pub vault_usdc_account: Account<'info, TokenAccount>,

    /// CHECK: borrower's USDC token account — validated by mint constraint
    #[account(
        mut,
        constraint = borrower_usdc_account.mint == market.usdc_mint,
        constraint = borrower_usdc_account.owner == borrow_order.owner,
    )]
    pub borrower_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub matcher: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

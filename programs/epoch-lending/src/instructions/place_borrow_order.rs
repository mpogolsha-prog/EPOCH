use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::EpochError;
use crate::state::{BorrowOrder, Market};
use crate::state::lend_order::OrderStatus;

// TODO: Replace with Pyth oracle price feed integration.
// Hardcoded SOL/USDC price for localnet/devnet testing only.
const HARDCODED_SOL_PRICE_USDC: u64 = 150_000_000; // 150 USDC (6 decimals)
const SOL_DECIMALS: u128 = 1_000_000_000; // 10^9 lamports per SOL

pub fn handle_place_borrow_order(
    ctx: Context<PlaceBorrowOrder>,
    amount: u64,
    max_rate_bps: u16,
    collateral_amount: u64,
) -> Result<()> {
    require!(amount > 0, EpochError::InvalidAmount);
    require!(max_rate_bps > 0, EpochError::InvalidRate);
    require!(collateral_amount > 0, EpochError::InvalidAmount);

    let market = &mut ctx.accounts.market;

    // --- Collateral sufficiency check ---
    // collateral_value_usdc = collateral_amount (lamports) * sol_price (usdc base) / 10^9
    let collateral_value_usdc = (collateral_amount as u128)
        .checked_mul(HARDCODED_SOL_PRICE_USDC as u128)
        .ok_or(EpochError::MathOverflow)?
        .checked_div(SOL_DECIMALS)
        .ok_or(EpochError::MathOverflow)?;

    // required = borrow_amount * collateral_ratio_bps / 10_000
    let required_collateral_usdc = (amount as u128)
        .checked_mul(market.collateral_ratio_bps as u128)
        .ok_or(EpochError::MathOverflow)?
        .checked_div(10_000u128)
        .ok_or(EpochError::MathOverflow)?;

    require!(
        collateral_value_usdc >= required_collateral_usdc,
        EpochError::InsufficientCollateral
    );

    // --- Transfer wSOL collateral from borrower to vault ---
    let cpi_accounts = Transfer {
        from: ctx.accounts.borrower_wsol_account.to_account_info(),
        to: ctx.accounts.collateral_vault.to_account_info(),
        authority: ctx.accounts.borrower.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer(CpiContext::new(cpi_program, cpi_accounts), collateral_amount)?;

    // --- Create order ---
    let order_id = market.next_order_id;
    market.next_order_id = market
        .next_order_id
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;
    market.active_borrow_orders = market
        .active_borrow_orders
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;

    let order = &mut ctx.accounts.borrow_order;
    order.market = market.key();
    order.owner = ctx.accounts.borrower.key();
    order.amount = amount;
    order.max_rate_bps = max_rate_bps;
    order.collateral_amount = collateral_amount;
    order.status = OrderStatus::Open;
    order.order_id = order_id;
    order.created_at = Clock::get()?.unix_timestamp;
    order.bump = ctx.bumps.borrow_order;

    msg!(
        "Borrow order placed: {} USDC @ {}bps max, {} collateral, order #{}",
        amount,
        max_rate_bps,
        collateral_amount,
        order_id
    );

    Ok(())
}

#[derive(Accounts)]
pub struct PlaceBorrowOrder<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + BorrowOrder::INIT_SPACE,
        seeds = [
            BorrowOrder::SEED_PREFIX,
            market.key().as_ref(),
            borrower.key().as_ref(),
            &market.next_order_id.to_le_bytes(),
        ],
        bump,
    )]
    pub borrow_order: Account<'info, BorrowOrder>,

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
        constraint = borrower_wsol_account.mint == market.collateral_mint,
        constraint = borrower_wsol_account.owner == borrower.key(),
    )]
    pub borrower_wsol_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub borrower: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

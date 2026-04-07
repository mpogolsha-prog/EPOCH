use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::EpochError;
use crate::state::{LendOrder, Market};
use crate::state::lend_order::OrderStatus;

pub fn handle_place_lend_order(
    ctx: Context<PlaceLendOrder>,
    amount: u64,
    min_rate_bps: u16,
) -> Result<()> {
    require!(amount > 0, EpochError::InvalidAmount);
    require!(min_rate_bps > 0, EpochError::InvalidRate);

    let market = &mut ctx.accounts.market;
    let order_id = market.next_order_id;
    market.next_order_id = market
        .next_order_id
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;
    market.active_lend_orders = market
        .active_lend_orders
        .checked_add(1)
        .ok_or(EpochError::MathOverflow)?;

    // Transfer USDC from lender to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.lender_usdc_account.to_account_info(),
        to: ctx.accounts.vault_usdc_account.to_account_info(),
        authority: ctx.accounts.lender.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

    let order = &mut ctx.accounts.lend_order;
    order.market = market.key();
    order.owner = ctx.accounts.lender.key();
    order.amount = amount;
    order.min_rate_bps = min_rate_bps;
    order.status = OrderStatus::Open;
    order.order_id = order_id;
    order.created_at = Clock::get()?.unix_timestamp;
    order.bump = ctx.bumps.lend_order;

    msg!(
        "Lend order placed: {} USDC @ {}bps min, order #{}",
        amount,
        min_rate_bps,
        order_id
    );

    Ok(())
}

#[derive(Accounts)]
pub struct PlaceLendOrder<'info> {
    #[account(
        init,
        payer = lender,
        space = 8 + LendOrder::INIT_SPACE,
        seeds = [
            LendOrder::SEED_PREFIX,
            market.key().as_ref(),
            lender.key().as_ref(),
            &market.next_order_id.to_le_bytes(),
        ],
        bump,
    )]
    pub lend_order: Account<'info, LendOrder>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = lender_usdc_account.mint == market.usdc_mint,
        constraint = lender_usdc_account.owner == lender.key(),
    )]
    pub lender_usdc_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_usdc_account.mint == market.usdc_mint,
    )]
    pub vault_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lender: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

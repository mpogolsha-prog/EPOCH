use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::errors::EpochError;
use crate::state::Market;

pub fn handle_create_market(
    ctx: Context<CreateMarket>,
    term_days: u16,
    collateral_ratio_bps: u16,
    liquidation_threshold_bps: u16,
    protocol_fee_bps: u16,
) -> Result<()> {
    require!(
        term_days == 7 || term_days == 14 || term_days == 30,
        EpochError::InvalidTerm
    );

    let market = &mut ctx.accounts.market;
    market.term_days = term_days;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.usdc_mint = ctx.accounts.usdc_mint.key();
    market.authority = ctx.accounts.authority.key();
    market.collateral_ratio_bps = collateral_ratio_bps;
    market.liquidation_threshold_bps = liquidation_threshold_bps;
    market.protocol_fee_bps = protocol_fee_bps;
    market.next_order_id = 0;
    market.next_loan_id = 0;
    market.active_lend_orders = 0;
    market.active_borrow_orders = 0;
    market.active_loans = 0;
    market.bump = ctx.bumps.market;

    msg!(
        "Market created: {} day term, collateral ratio {}bps",
        term_days,
        collateral_ratio_bps
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(term_days: u16)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            Market::SEED_PREFIX,
            &term_days.to_le_bytes(),
            collateral_mint.key().as_ref(),
        ],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// Collateral token mint (wSOL for MVP)
    pub collateral_mint: Account<'info, Mint>,

    /// Lending token mint (USDC)
    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

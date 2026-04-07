import { AgentProfile } from "./agents/types";

export interface RateQuote {
  lendRateBps: number;
  borrowRateBps: number;
  orderAmount: number; // USDC lamports (6 decimals)
}

export function calculateRates(kaminoRateBps: number, profile: AgentProfile): RateQuote {
  const lendRateBps = kaminoRateBps + profile.fixedPremiumBps;
  const borrowRateBps = lendRateBps + profile.spreadBps;
  const orderAmount = Math.floor(profile.capitalUsdc * 1e6 * profile.maxExposurePct);

  return { lendRateBps, borrowRateBps, orderAmount };
}

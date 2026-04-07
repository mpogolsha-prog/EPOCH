import { AgentProfile, AgentState } from "./types";
import { getKaminoRate } from "../rateOracle";
import { calculateRates } from "../riskModel";

const capitalUsdc = parseInt(process.env.AGENT_CAPITAL_USDC || "10000", 10);
const termDays = parseInt(process.env.ORDER_TERM_DAYS || "30", 10);

export const profile: AgentProfile = {
  name: "Conservative Carl",
  emoji: "\u{1F916}",
  fixedPremiumBps: 75,
  spreadBps: 75,
  maxExposurePct: 0.2,
  capitalUsdc,
  keypairPath: process.env.CARL_KEYPAIR_PATH || "~/.config/solana/carl.json",
};

export async function runCycle(
  agentProfile: AgentProfile,
  apiBaseUrl: string,
  paidFetch: typeof fetch | null,
): Promise<AgentState> {
  const state: AgentState = {
    name: agentProfile.name,
    emoji: agentProfile.emoji,
    lendRateBps: 0,
    borrowRateBps: 0,
    orderAmount: 0,
    ordersPlaced: 0,
    dryRun: !paidFetch,
  };

  try {
    // 1. Read current orderbook (free endpoint)
    const obRes = await fetch(`${apiBaseUrl}/orderbook/${termDays}d`);
    if (!obRes.ok) {
      state.error = `Orderbook fetch failed: ${obRes.status}`;
      return state;
    }

    // 2. Get Kamino variable rate
    const kaminoRate = await getKaminoRate();

    // 3. Calculate fair fixed rates
    const quote = calculateRates(kaminoRate, agentProfile);
    state.lendRateBps = quote.lendRateBps;
    state.borrowRateBps = quote.borrowRateBps;
    state.orderAmount = quote.orderAmount;

    // 4. Place lend order via x402-paid POST
    if (paidFetch) {
      const lendRes = await paidFetch(`${apiBaseUrl}/place-lend-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: quote.orderAmount,
          minRateBps: quote.lendRateBps,
          termDays,
        }),
      });

      if (lendRes.ok) {
        state.ordersPlaced++;
      } else {
        const err = await lendRes.text();
        console.warn(`[${agentProfile.name}] Lend order failed: ${err}`);
      }
    } else {
      console.log(`[${agentProfile.name}] DRY RUN: would place lend order — ${quote.orderAmount / 1e6} USDC @ ${(quote.lendRateBps / 100).toFixed(2)}%`);
    }

    return state;
  } catch (err: any) {
    state.error = err.message;
    return state;
  }
}

import { AgentProfile, AgentState } from "./types.js";
import { getKaminoRate } from "../rateOracle.js";
import { calculateRates } from "../riskModel.js";

const capitalUsdc = parseInt(process.env.AGENT_CAPITAL_USDC || "10000", 10);
const termDays = parseInt(process.env.ORDER_TERM_DAYS || "30", 10);

export const profile: AgentProfile = {
  name: "Aggressive Alice",
  emoji: "\u{1F916}",
  fixedPremiumBps: 25,
  spreadBps: 100,
  maxExposurePct: 0.4,
  capitalUsdc,
  keypairPath: process.env.ALICE_KEYPAIR_PATH || "~/.config/solana/alice.json",
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
    const obRes = await fetch(`${apiBaseUrl}/orderbook/${termDays}d`);
    if (!obRes.ok) {
      state.error = `Orderbook fetch failed: ${obRes.status}`;
      return state;
    }

    const kaminoRate = await getKaminoRate();
    const quote = calculateRates(kaminoRate, agentProfile);
    state.lendRateBps = quote.lendRateBps;
    state.borrowRateBps = quote.borrowRateBps;
    state.orderAmount = quote.orderAmount;

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

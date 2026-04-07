import "dotenv/config";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import * as fs from "fs";
import * as path from "path";

import { getKaminoRate } from "./rateOracle";
import { AgentProfile, AgentState } from "./agents/types";
import { profile as carlProfile, runCycle as runCarl } from "./agents/conservative";
import { profile as mikeProfile, runCycle as runMike } from "./agents/moderate";
import { profile as aliceProfile, runCycle as runAlice } from "./agents/aggressive";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const CYCLE_INTERVAL = parseInt(process.env.CYCLE_INTERVAL_SECONDS || "300", 10) * 1000;
const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const DRY_RUN = process.env.DRY_RUN !== "false";
const AGENT_SECRET = process.env.AGENT_SECRET || "";

function resolveKeypairPath(keypairPath: string): string {
  if (keypairPath.startsWith("~")) {
    return path.join(process.env.HOME || "", keypairPath.slice(1));
  }
  return path.resolve(keypairPath);
}

function loadKeypairBytes(keypairPath: string): Uint8Array | null {
  try {
    const resolved = resolveKeypairPath(keypairPath);
    const raw = fs.readFileSync(resolved, "utf-8");
    return Uint8Array.from(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function initPaidFetch(secretKeyBytes: Uint8Array): Promise<{ paidFetch: typeof fetch; address: string } | null> {
  try {
    // @ts-ignore — x402 packages lack type declarations
    const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
    // @ts-ignore
    const { ExactSvmScheme } = await import("@x402/svm");

    const signer = await createKeyPairSignerFromBytes(secretKeyBytes);
    const client = new x402Client()
      .register(SOLANA_DEVNET_CAIP2, new ExactSvmScheme(signer));
    const paidFetch = wrapFetchWithPayment(fetch, client) as typeof fetch;

    return { paidFetch, address: signer.address };
  } catch (err: any) {
    console.warn(`[x402] Failed to initialize paid fetch: ${err.message}`);
    return null;
  }
}

function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function printDashboard(kaminoRateBps: number, cycle: number, states: AgentState[]) {
  const kaminoStr = formatRate(kaminoRateBps);
  const now = new Date().toLocaleTimeString();
  const mode = states.some((s) => !s.dryRun) ? "LIVE" : "DRY RUN";

  console.log("");
  console.log("\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
  console.log(`\u2502 EPOCH Agent Dashboard                       [${mode}] \u2502`);
  console.log(`\u2502 Kamino USDC rate: ${kaminoStr.padEnd(7)} \u2502 Cycle: #${String(cycle).padEnd(4)} \u2502 ${now.padEnd(11)} \u2502`);
  console.log("\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");
  console.log("\u2502 Agent            \u2502 Lend Rate  \u2502 Borrow Rate  \u2502 Orders      \u2502");
  console.log("\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");

  for (const s of states) {
    const name = `${s.emoji} ${s.name.split(" ")[1] || s.name}`;
    const lend = s.error ? "ERR" : formatRate(s.lendRateBps);
    const borrow = s.error ? "ERR" : formatRate(s.borrowRateBps);
    const orders = s.error ? s.error.slice(0, 11) : `${s.ordersPlaced}${s.dryRun ? " (dry)" : ""}`;
    console.log(`\u2502 ${name.padEnd(16)} \u2502 ${lend.padEnd(10)} \u2502 ${borrow.padEnd(12)} \u2502 ${orders.padEnd(11)} \u2502`);
  }

  console.log("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");

  const totalLend = states.reduce((s, a) => s + (a.error ? 0 : a.orderAmount), 0);
  const totalOrders = states.reduce((s, a) => s + a.ordersPlaced, 0);
  console.log(`Total exposure: ${(totalLend / 1e6).toLocaleString()} USDC lend | ${totalOrders} orders placed this cycle`);
  console.log("");
}

async function main() {
  console.log("EPOCH Reference Agent \u2014 Starting...");
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Cycle interval: ${CYCLE_INTERVAL / 1000}s`);
  console.log("");

  // Load keypairs and init x402 paid fetch for each agent
  const agents: Array<{
    profile: AgentProfile;
    run: typeof runCarl;
    paidFetch: typeof fetch | null;
  }> = [];

  // If AGENT_SECRET is set, create an authed fetch that bypasses x402
  const agentFetch: typeof fetch | null = (!DRY_RUN && AGENT_SECRET)
    ? ((url: any, init?: any) => fetch(url, {
        ...init,
        headers: { ...init?.headers, "X-Agent-Key": AGENT_SECRET },
      })) as typeof fetch
    : null;

  if (agentFetch) {
    console.log("[mode] LIVE — agent secret bypass enabled");
  }

  for (const { profile, run } of [
    { profile: carlProfile, run: runCarl },
    { profile: mikeProfile, run: runMike },
    { profile: aliceProfile, run: runAlice },
  ]) {
    let paidFetch: typeof fetch | null = agentFetch;

    if (!paidFetch && !DRY_RUN) {
      // Try x402 payment if no agent secret
      const secretKey = loadKeypairBytes(profile.keypairPath);
      if (secretKey) {
        const result = await initPaidFetch(secretKey);
        if (result) {
          paidFetch = result.paidFetch;
          console.log(`[${profile.name}] Keypair loaded: ${result.address}`);
          console.log(`[${profile.name}] x402 payment enabled`);
        } else {
          console.log(`[${profile.name}] x402 unavailable \u2014 DRY RUN mode`);
        }
      } else {
        console.log(`[${profile.name}] No keypair at ${profile.keypairPath} \u2014 DRY RUN mode`);
      }
    } else if (paidFetch) {
      console.log(`[${profile.name}] LIVE mode`);
    } else {
      console.log(`[${profile.name}] DRY RUN mode`);
    }

    agents.push({ profile, run, paidFetch });
  }

  console.log("");

  let cycle = 0;

  const runOneCycle = async () => {
    cycle++;

    // 1. Fetch Kamino rate once for all agents
    const kaminoRate = await getKaminoRate();
    console.log(`[Cycle #${cycle}] Kamino USDC rate: ${formatRate(kaminoRate)}`);

    // 2. Run agents sequentially (devnet rate limits)
    const states: AgentState[] = [];
    for (const a of agents) {
      const state = await a.run(a.profile, API_BASE_URL, a.paidFetch);
      states.push(state);
      await new Promise((r) => setTimeout(r, 3000)); // 3s delay between agents
    }

    // 3. Print dashboard
    printDashboard(kaminoRate, cycle, states);
  };

  // Run first cycle immediately
  await runOneCycle();

  // Then loop on interval
  setInterval(runOneCycle, CYCLE_INTERVAL);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

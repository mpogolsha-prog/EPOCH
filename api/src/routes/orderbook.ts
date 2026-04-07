import { Router, Request, Response } from "express";
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import {
  fetchAllMarkets,
  fetchLendOrders,
  fetchBorrowOrders,
  DeserializedLendOrder,
  DeserializedBorrowOrder,
} from "../lib/solana.js";

const router = Router();

const STATUS_OPEN = 0;

function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// --- Agent identification ---

interface AgentInfo {
  name: string;
  pubkey: string;
}

function loadAgentPubkey(keypairPath: string): string | null {
  try {
    const resolved = keypairPath.startsWith("~")
      ? path.join(process.env.HOME || "", keypairPath.slice(1))
      : path.resolve(keypairPath);
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

const AGENT_DEFS = [
  { name: "Carl", envKey: "CARL_KEYPAIR_PATH", default: "~/.config/solana/carl.json" },
  { name: "Mike", envKey: "MIKE_KEYPAIR_PATH", default: "~/.config/solana/mike.json" },
  { name: "Alice", envKey: "ALICE_KEYPAIR_PATH", default: "~/.config/solana/alice.json" },
];

const AGENTS: AgentInfo[] = [];
for (const def of AGENT_DEFS) {
  const pubkey = loadAgentPubkey(process.env[def.envKey] || def.default);
  if (pubkey) AGENTS.push({ name: def.name, pubkey });
}

const agentPubkeyToName = new Map(AGENTS.map((a) => [a.pubkey, a.name]));

// Server keypair (seed script deployer) — seed orders use this as owner
const serverPubkey = loadAgentPubkey(
  process.env.SERVER_KEYPAIR_PATH || "~/.config/solana/id.json"
);

// Agent rate profiles: seed orders at these rates map to agent personas
const AGENT_RATE_PROFILES: Record<number, string> = {
  281: "Carl",   // Conservative: +75bps
  256: "Mike",   // Moderate: +50bps
  231: "Alice",  // Aggressive: +25bps
};

function getAgentInfo(owner: string, rateBps: number): { source: "agent" | "user"; agentName: string | null } {
  // Direct match: order placed by a running agent
  if (agentPubkeyToName.has(owner)) {
    return { source: "agent", agentName: agentPubkeyToName.get(owner)! };
  }
  // Seed match: order placed by server at an agent rate profile
  if (owner === serverPubkey && AGENT_RATE_PROFILES[rateBps]) {
    return { source: "agent", agentName: AGENT_RATE_PROFILES[rateBps] };
  }
  return { source: "user", agentName: null };
}

// GET /orderbook/:term — FREE, reads real on-chain data via getProgramAccounts
router.get("/:term", async (req: Request, res: Response) => {
  try {
    const { term } = req.params;
    const normalized = term.replace("d", "");
    const termDays = parseInt(normalized, 10);

    if (![7, 14, 30].includes(termDays)) {
      res.status(400).json({
        error: "Invalid term",
        message: "Term must be 7d, 14d, or 30d",
        validTerms: ["7d", "14d", "30d"],
      });
      return;
    }

    // 1. Find all Market accounts, filter by term
    const allMarkets = await fetchAllMarkets();
    const markets = allMarkets.filter((m) => m.termDays === termDays);

    if (markets.length === 0) {
      res.json({
        term: `${termDays}d`,
        market: null,
        lendOrders: [],
        borrowOrders: [],
        bestLendRate: null,
        bestBorrowRate: null,
        spreadBps: null,
        totalLendVolume: 0,
        totalBorrowVolume: 0,
        message: `No market found for ${termDays}d term on devnet`,
      });
      return;
    }

    // For MVP, use the first matching market
    const market = markets[0];

    // 2. Fetch lend and borrow orders in parallel
    const [rawLendOrders, rawBorrowOrders] = await Promise.all([
      fetchLendOrders(market.pubkey),
      fetchBorrowOrders(market.pubkey),
    ]);

    // 3. Filter to Open orders only
    const lendOrders = rawLendOrders
      .filter((o) => o.status === STATUS_OPEN)
      .sort((a, b) => a.minRateBps - b.minRateBps);

    const borrowOrders = rawBorrowOrders
      .filter((o) => o.status === STATUS_OPEN)
      .sort((a, b) => b.maxRateBps - a.maxRateBps);

    // 4. Compute summary stats
    const bestLendRate =
      lendOrders.length > 0
        ? Math.min(...lendOrders.map((o) => o.minRateBps))
        : null;

    const bestBorrowRate =
      borrowOrders.length > 0
        ? Math.max(...borrowOrders.map((o) => o.maxRateBps))
        : null;

    const spreadBps =
      bestBorrowRate !== null && bestLendRate !== null
        ? bestBorrowRate - bestLendRate
        : null;

    const totalLendVolume = lendOrders.reduce((s, o) => s + o.amount, 0);
    const totalBorrowVolume = borrowOrders.reduce((s, o) => s + o.amount, 0);

    res.json({
      term: `${termDays}d`,
      market: {
        pubkey: market.pubkey,
        collateralRatioBps: market.collateralRatioBps,
        liquidationThresholdBps: market.liquidationThresholdBps,
        protocolFeeBps: market.protocolFeeBps,
        activeLendOrders: market.activeLendOrders,
        activeBorrowOrders: market.activeBorrowOrders,
        activeLoans: market.activeLoans,
      },
      lendOrders: lendOrders.map(formatLendOrder),
      borrowOrders: borrowOrders.map(formatBorrowOrder),
      bestLendRate: bestLendRate !== null ? formatRate(bestLendRate) : null,
      bestBorrowRate:
        bestBorrowRate !== null ? formatRate(bestBorrowRate) : null,
      spreadBps,
      totalLendVolume,
      totalBorrowVolume,
    });
  } catch (err: any) {
    console.error("Orderbook fetch error:", err.message);
    res.status(500).json({
      error: "Failed to fetch orderbook",
      message: err.message,
    });
  }
});

function formatLendOrder(o: DeserializedLendOrder) {
  const { source, agentName } = getAgentInfo(o.owner, o.minRateBps);
  return {
    pubkey: o.pubkey,
    owner: o.owner,
    amount: o.amount,
    amountUsdc: o.amount / 1e6,
    minRateBps: o.minRateBps,
    minRate: formatRate(o.minRateBps),
    orderId: o.orderId,
    createdAt: new Date(o.createdAt * 1000).toISOString(),
    source,
    agentName,
  };
}

function formatBorrowOrder(o: DeserializedBorrowOrder) {
  const { source, agentName } = getAgentInfo(o.owner, o.maxRateBps);
  return {
    pubkey: o.pubkey,
    owner: o.owner,
    amount: o.amount,
    amountUsdc: o.amount / 1e6,
    maxRateBps: o.maxRateBps,
    maxRate: formatRate(o.maxRateBps),
    collateralAmount: o.collateralAmount,
    collateralSol: o.collateralAmount / 1e9,
    orderId: o.orderId,
    createdAt: new Date(o.createdAt * 1000).toISOString(),
    source,
    agentName,
  };
}

export default router;

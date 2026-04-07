"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "@/lib/idl.json";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton
    ),
  { ssr: false }
);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://epoch-production-2c7b.up.railway.app";
const DEVNET_RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(idl.address);

interface Order {
  pubkey: string;
  owner: string;
  amount: number;
  amountUsdc: number;
  minRateBps?: number;
  maxRateBps?: number;
  minRate?: string;
  maxRate?: string;
  orderId: number;
  createdAt: string;
  source: "agent" | "user";
  agentName: string | null;
}

interface OrderbookData {
  term: string;
  lendOrders: Order[];
  borrowOrders: Order[];
  totalLendVolume: number;
  totalBorrowVolume: number;
  bestLendRate: string | null;
  bestBorrowRate: string | null;
  spreadBps: number | null;
  market: {
    pubkey: string;
    usdcMint: string;
    collateralRatioBps: number;
    liquidationThresholdBps: number;
    protocolFeeBps: number;
    activeLendOrders: number;
    activeBorrowOrders: number;
    activeLoans: number;
  } | null;
}

function formatUSDC(rawAmount: number): string {
  const usdc = rawAmount / 1e6;
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(2)}M`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}K`;
  return `$${usdc.toFixed(2)}`;
}

function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function SourceBadge({ order }: { order: Order }) {
  if (order.source === "agent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-medium text-teal-400">
        agent{order.agentName ? ` \u00b7 ${order.agentName}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
      user
    </span>
  );
}

export default function Home() {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Order form state
  const [orderAmount, setOrderAmount] = useState("");
  const [orderRate, setOrderRate] = useState("");
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  useEffect(() => {
    async function fetchOrderbook() {
      try {
        const res = await fetch(`${API_BASE}/orderbook/30d`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      }
    }

    fetchOrderbook();
    const interval = setInterval(fetchOrderbook, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setOrderStatus(null);

    if (!publicKey || !anchorWallet) {
      setOrderStatus("Connect your wallet to place orders.");
      return;
    }

    if (!data?.market) {
      setOrderStatus("Market data not available. Please try again.");
      return;
    }

    const amountUsdc = parseFloat(orderAmount);
    const ratePct = parseFloat(orderRate);
    if (isNaN(amountUsdc) || amountUsdc <= 0) {
      setOrderStatus("Enter a valid amount.");
      return;
    }
    if (isNaN(ratePct) || ratePct <= 0) {
      setOrderStatus("Enter a valid rate.");
      return;
    }

    setOrderLoading(true);

    try {
      const connection = new Connection(DEVNET_RPC, "confirmed");
      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });
      const program = new Program(idl as any, provider);

      const marketPubkey = new PublicKey(data.market.pubkey);
      const usdcMint = new PublicKey(data.market.usdcMint);

      // Amount in USDC base units (6 decimals)
      const amountBn = new BN(Math.round(amountUsdc * 1e6));
      // Rate in basis points (e.g., 8.5% -> 850)
      const minRateBps = Math.round(ratePct * 100);

      // Derive lender's USDC ATA
      const lenderUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        publicKey
      );

      // Derive vault USDC account (ATA of market PDA, allowOwnerOffCurve)
      const vaultUsdcAccount = await getAssociatedTokenAddress(
        usdcMint,
        marketPubkey,
        true // allowOwnerOffCurve
      );

      // Fetch market to get nextOrderId for PDA derivation
      const marketAccount = await (program.account as any).market.fetch(
        marketPubkey
      );
      const nextOrderId = marketAccount.nextOrderId as BN;

      // Derive lendOrder PDA
      const [lendOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("lend_order"),
          marketPubkey.toBuffer(),
          publicKey.toBuffer(),
          nextOrderId.toArrayLike(Buffer, "le", 8),
        ],
        PROGRAM_ID
      );

      // Build the transaction
      const tx = await program.methods
        .placeLendOrder(amountBn, minRateBps)
        .accounts({
          lendOrder: lendOrderPda,
          market: marketPubkey,
          lenderUsdcAccount,
          vaultUsdcAccount,
          lender: publicKey,
        })
        .transaction();

      // Send via wallet adapter (Phantom signs)
      const signature = await sendTransaction(tx, connection);

      // Wait for confirmation
      await connection.confirmTransaction(signature, "confirmed");

      setOrderStatus(
        `Order placed! Signature: ${signature.slice(0, 8)}... — ` +
          `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );
      setOrderAmount("");
      setOrderRate("");
    } catch (err: any) {
      console.error("Place order error:", err);
      const msg =
        err?.message || err?.toString() || "Transaction failed";
      setOrderStatus(`Error: ${msg}`);
    } finally {
      setOrderLoading(false);
    }
  }

  const allOrders = data
    ? [...data.lendOrders, ...data.borrowOrders]
    : [];

  const bestLendRateBps = data?.lendOrders.length
    ? Math.min(...data.lendOrders.map((o) => o.minRateBps ?? Infinity))
    : null;

  const agentOrderCount = allOrders.filter((o) => o.source === "agent").length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" height="36" alt="EpochFi" className="h-9" />
            <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-medium text-teal-400 ring-1 ring-teal-500/30 ring-inset">
              devnet
            </span>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to load orderbook: {error}
          </div>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Depth"
            value={data ? formatUSDC(data.totalLendVolume) : "\u2014"}
          />
          <MetricCard
            label="Active Orders"
            value={data ? String(data.lendOrders.length) : "\u2014"}
          />
          <MetricCard
            label="Best Lend Rate"
            value={data?.bestLendRate ?? "\u2014"}
            highlight
          />
          <MetricCard
            label="Agent Orders"
            value={data ? String(agentOrderCount) : "\u2014"}
          />
        </div>

        {/* Place Lend Order form */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-5">
          <h2 className="text-lg font-semibold text-white mb-4">
            Place Lend Order
          </h2>
          <form onSubmit={handlePlaceOrder} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="100"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Min Rate (% APY)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="8.0"
                  value={orderRate}
                  onChange={(e) => setOrderRate(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!publicKey || orderLoading}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {orderLoading
                ? "Placing Order..."
                : publicKey
                  ? "Place Order"
                  : "Connect Wallet to Place Orders"}
            </button>
            {orderStatus && (
              <p
                className={`text-sm ${
                  orderStatus.startsWith("Error")
                    ? "text-red-400"
                    : "text-green-400"
                }`}
              >
                {orderStatus}
              </p>
            )}
          </form>
        </div>

        {/* Orderbook table */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">
              Orderbook — 30d Term
            </h2>
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 font-medium">Side</th>
                  <th className="px-6 py-3 font-medium">Amount (USDC)</th>
                  <th className="px-6 py-3 font-medium">Rate</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {allOrders.length > 0 ? (
                  allOrders.map((order) => {
                    const rateStr = order.minRate ?? order.maxRate ?? "\u2014";
                    const side = order.minRateBps !== undefined ? "lend" : "borrow";
                    return (
                      <tr
                        key={order.pubkey}
                        className="transition-colors hover:bg-gray-800/50"
                      >
                        <td className="px-6 py-3">
                          <SourceBadge order={order} />
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={
                              side === "lend"
                                ? "text-green-400"
                                : "text-orange-400"
                            }
                          >
                            {side}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-gray-300">
                          {formatUSDC(order.amount)}
                        </td>
                        <td className="px-6 py-3 font-mono text-green-400">
                          {rateStr}
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
                            open
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      {error ? "Unable to load data" : "Loading orderbook..."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kamino comparison bar */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-400">
                Rate Comparison
              </span>
            </div>
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Kamino variable:</span>{" "}
              <span className="text-orange-400">2.07%</span>
              <span className="mx-2 text-gray-600">{"\u2192"}</span>
              <span className="text-gray-500">EPOCH fixed from</span>{" "}
              <span className="text-green-400 font-semibold">
                {bestLendRateBps !== null && bestLendRateBps !== Infinity
                  ? formatRate(bestLendRateBps)
                  : "\u2014"}
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          highlight ? "text-green-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

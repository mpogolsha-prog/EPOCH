"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
            <h1 className="text-2xl font-bold tracking-tight text-white">
              EPOCH
            </h1>
            <span className="inline-flex items-center rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-medium text-teal-400 ring-1 ring-teal-500/30 ring-inset">
              devnet
            </span>
          </div>
          <button
            disabled
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
          >
            Connect Wallet
          </button>
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
                    const rateStr = order.minRate ?? order.maxRate ?? "—";
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

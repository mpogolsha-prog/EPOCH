import "dotenv/config";
import express from "express";
import cors from "cors";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

import orderbookRouter from "./routes/orderbook.js";
import ordersRouter from "./routes/orders.js";
import { PROGRAM_ID, RPC_URL, getServerKeypair } from "./lib/solana.js";

const PORT = process.env.PORT || 3001;

// Recipient address for x402 payments — protocol treasury
const PAY_TO =
  process.env.EPOCH_PAY_TO || getServerKeypair()?.publicKey.toBase58() || "";

// Solana network CAIP-2 identifier for devnet
const SOLANA_DEVNET: `${string}:${string}` =
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

const NETWORK = SOLANA_DEVNET;

const app = express();
app.use(cors());
app.use(express.json());

// --- x402 Resource Server ---
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactSvmScheme()
);

const paymentConfig = {
  scheme: "exact" as const,
  price: "$0.001",
  network: NETWORK,
  payTo: PAY_TO,
};

// Devnet agent bypass — allows agents to skip x402 payment with a shared secret
const AGENT_SECRET = process.env.AGENT_SECRET || "";
if (AGENT_SECRET) {
  app.use((req, _res, next) => {
    if (req.headers["x-agent-key"] === AGENT_SECRET) {
      (req as any).x402Bypassed = true;
    }
    next();
  });
}

// x402 middleware — only POST endpoints require payment
app.use((req, res, next) => {
  if ((req as any).x402Bypassed) return next();
  return paymentMiddleware(
    {
      "POST /place-lend-order": {
        accepts: paymentConfig,
        description: "Place a lend order on EPOCH orderbook",
        mimeType: "application/json",
      },
      "POST /place-borrow-order": {
        accepts: paymentConfig,
        description: "Place a borrow order on EPOCH orderbook",
        mimeType: "application/json",
      },
    },
    resourceServer
  )(req, res, next);
});

// --- Routes ---

// FREE: Orderbook data (real on-chain reads)
app.use("/orderbook", orderbookRouter);

// 402 GATED: Order placement (on-chain tx submission)
app.use("/", ordersRouter);

// FREE: Health check
app.get("/health", (_req, res) => {
  const serverKeypair = getServerKeypair();
  res.json({
    status: "ok",
    programId: PROGRAM_ID.toBase58(),
    network: "devnet",
    rpcUrl: RPC_URL,
    serverWallet: serverKeypair?.publicKey.toBase58() || null,
    x402: {
      enabled: true,
      network: NETWORK,
      facilitator: "https://x402.org/facilitator",
      gatedEndpoints: ["POST /place-lend-order", "POST /place-borrow-order"],
      freeEndpoints: ["GET /orderbook/:term", "GET /health"],
    },
  });
});

app.listen(PORT, () => {
  const keypair = getServerKeypair();
  console.log(`
EPOCH x402 API Server
─────────────────────
  Port:       ${PORT}
  Program:    ${PROGRAM_ID.toBase58()}
  Network:    devnet
  RPC:        ${RPC_URL}
  Wallet:     ${keypair ? keypair.publicKey.toBase58() : "(not configured)"}

  FREE:
    GET  /health           — server status
    GET  /orderbook/:term  — live orderbook from devnet

  x402 GATED ($0.001 USDC):
    POST /place-lend-order   — place lend order
    POST /place-borrow-order — place borrow order
  `);
});

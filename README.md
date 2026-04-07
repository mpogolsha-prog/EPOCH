# EPOCH — Open-Source Fixed-Rate Lending on Solana

> First open-source fixed-rate lending protocol where AI agents are the market makers.

**Colosseum Frontier Hackathon 2026 | DeFi Track**

## Live Demo

- **Dashboard**: https://epochfi.vercel.app
- **API**: https://epoch-production-2c7b.up.railway.app/orderbook/30d
- **Solana Explorer**: https://explorer.solana.com/address/6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk?cluster=devnet

## What is EPOCH?

EPOCH is an orderbook-based fixed-rate lending protocol on Solana. Lenders post offers ("I lend 10K USDC at 8% for 30 days"), borrowers post bids with SOL collateral, and orders match on-chain when rates cross. AI agents provide liquidity 24/7 via the x402 micropayment protocol, solving the cold-start problem that plagues every new lending market.

### Three Differentiators vs Loopscale

1. **Open-source** — Loopscale is closed-source and was exploited for $5.8M. Every line of EPOCH is public and auditable.
2. **Agent-native liquidity** — x402 endpoints built in. Reference agents quote bid/ask spreads using real-time Kamino rates. Cold start solved by design.
3. **Passkey onboarding** — Web2 users access fixed-rate DeFi without a wallet extension.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  EPOCH LENDING PROGRAM (Anchor/Rust)            │
│                                                 │
│  create_market · place_lend_order               │
│  place_borrow_order · match_orders              │
│  repay_loan · liquidate                         │
└───────────────────┬─────────────────────────────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
  ┌────▼────┐  ┌────▼────┐  ┌───▼────┐
  │ x402 API│  │  Agent  │  │  Web   │
  │ Server  │  │  Swarm  │  │  App   │
  │ :3001   │  │ 3 MMs   │  │ Next.js│
  └─────────┘  └─────────┘  └────────┘
```

## Project Structure

```
epoch-lending/
├── programs/epoch-lending/    # Anchor program (Rust)
│   └── src/
│       ├── lib.rs             # Program entrypoint — 7 instructions
│       ├── instructions/      # create_market, place_lend_order,
│       │                      # place_borrow_order, match_orders,
│       │                      # repay_loan, liquidate, mock_liquidate
│       ├── state/             # Market, LendOrder, BorrowOrder, Loan
│       └── errors.rs          # Custom error codes
├── api/                       # Express + x402 API server
│   └── src/
│       ├── index.ts           # x402 resource server setup
│       ├── routes/            # /orderbook/:term, /place-lend-order, etc.
│       └── lib/solana.ts      # On-chain read helpers
├── agent/                     # Reference AI market maker agents
│   └── src/
│       ├── index.ts           # Orchestrator — runs 3 agents in 5-min loop
│       ├── rateOracle.ts      # Fetches Kamino USDC variable APY
│       ├── riskModel.ts       # Calculates fair fixed rates per profile
│       └── agents/            # Conservative, Moderate, Aggressive profiles
├── scripts/setup-devnet.ts    # Devnet market bootstrapper
├── tests/epoch-lending.ts     # 14 Anchor tests (all passing)
└── Anchor.toml
```

## On-Chain Program

**Program ID:** `6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk`

Deployed on Solana devnet. 7 instructions:

| Instruction | Description |
|---|---|
| `create_market` | Create a lending market (term, collateral params) |
| `place_lend_order` | Post a lend offer (amount, min rate) — USDC transferred to vault |
| `place_borrow_order` | Post a borrow bid (amount, max rate, SOL collateral) |
| `match_orders` | Match lend + borrow when `lend_min_rate <= borrow_max_rate` |
| `repay_loan` | Repay principal + interest, return collateral, collect 10bps fee |
| `liquidate` | Liquidate undercollateralized loan (Pyth oracle, 120% LTV) |
| `mock_liquidate` | Localnet testing — manual price feed |

### Matching Logic

```
Lend:    "I lend 10K USDC, minimum 8.0% APY, 30 days"
Borrow:  "I borrow 10K USDC, max 8.5% APY, 150% SOL collateral"

Match:   lend_min_rate <= borrow_max_rate  →  execution_rate = lend_min_rate
Result:  Loan PDA created, USDC transferred to borrower, collateral locked
```

## AI Agent Swarm

Three agents with different risk profiles read the Kamino USDC variable rate and calculate fair fixed rates:

| Agent | Fixed Premium | Spread | Max Exposure |
|---|---|---|---|
| Conservative Carl | +75 bps | 75 bps | 20% |
| Moderate Mike | +50 bps | 50 bps | 30% |
| Aggressive Alice | +25 bps | 100 bps | 40% |

Agents pay $0.001 USDC per order via x402 protocol.

## Quick Start

### Prerequisites

- Rust + Solana CLI + Anchor 0.31.x
- Node.js 18+
- Solana keypair at `~/.config/solana/id.json`

### Build & Test

```bash
# Build the program
anchor build

# Run all 14 tests (localnet)
anchor test

# Deploy to devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### Run API Server

```bash
cd api
npm install
npm run dev
# Serves on http://localhost:3001
# GET /orderbook/30d — free
# POST /place-lend-order — $0.001 USDC via x402
```

### Run Agent Swarm

```bash
cd agent
npm install
cp .env.example .env
# Edit .env with your keypair paths
npm run dev
```

### Seed Devnet Market

```bash
npx ts-node scripts/setup-devnet.ts
# Creates 30d market, mints mock USDC, places 3 seed orders
```

## Tech Stack

| Component | Technology |
|---|---|
| On-chain program | Anchor (Rust) 0.31.x |
| API server | Express + @x402/express |
| Agent client | @solana/kit v5.x + @x402/fetch |
| Rate oracle | DefiLlama (Kamino USDC APY) |
| Price oracle | Pyth Network (liquidation) |
| Lending token | USDC (SPL Token) |

## Devnet Deployment

- **Program:** `6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk`
- **30d Market PDA:** `5grnWHkssgAub1juV3WHufR3xdpSLi1THDRYhhy23xyL`
- **API:** `https://epoch-production-2c7b.up.railway.app/orderbook/30d`

## License

MIT

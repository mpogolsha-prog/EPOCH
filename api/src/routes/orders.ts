import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  fetchAllMarkets,
  getProgram,
  getServerKeypair,
  findATA,
} from "../lib/solana.js";

const router = Router();

function requireProgram(res: Response): anchor.Program | null {
  const program = getProgram();
  if (!program) {
    res.status(503).json({
      error: "Server keypair not configured",
      message:
        "Set SERVER_KEYPAIR_PATH in .env to a funded Solana keypair file to enable order placement.",
    });
    return null;
  }
  return program;
}

// POST /place-lend-order — 402 gated, submits on-chain tx
router.post("/place-lend-order", async (req: Request, res: Response) => {
  const { amount, minRateBps, termDays } = req.body;

  if (!amount || !minRateBps || !termDays) {
    res.status(400).json({
      error: "Missing required fields",
      required: ["amount", "minRateBps", "termDays"],
    });
    return;
  }

  if (![7, 14, 30].includes(termDays)) {
    res.status(400).json({
      error: "Invalid termDays",
      message: "Must be 7, 14, or 30",
    });
    return;
  }

  if (amount <= 0 || minRateBps <= 0) {
    res.status(400).json({
      error: "Invalid values",
      message: "amount and minRateBps must be positive",
    });
    return;
  }

  const program = requireProgram(res);
  if (!program) return;
  const keypair = getServerKeypair()!;

  try {
    // Find the market for this term
    const allMarkets = await fetchAllMarkets();
    const market = allMarkets.find((m) => m.termDays === termDays);
    if (!market) {
      res.status(404).json({
        error: "Market not found",
        message: `No market exists for ${termDays}d term on devnet. Create one first.`,
      });
      return;
    }

    const marketPubkey = new PublicKey(market.pubkey);
    const usdcMint = new PublicKey(market.usdcMint);

    // Derive accounts
    const lenderUsdcAccount = findATA(usdcMint, keypair.publicKey);

    // Vault = ATA of the market PDA
    const vaultUsdcAccount = findATA(usdcMint, marketPubkey);

    // Submit instruction
    const tx = await program.methods
      .placeLendOrder(new anchor.BN(amount), minRateBps)
      .accounts({
        market: marketPubkey,
        lenderUsdcAccount,
        vaultUsdcAccount,
        lender: keypair.publicKey,
      })
      .rpc();

    res.json({
      success: true,
      txSignature: tx,
      message: `Lend order placed: ${amount / 1e6} USDC @ ${(minRateBps / 100).toFixed(2)}% min, ${termDays}d term`,
      order: {
        type: "lend",
        amount,
        amountUsdc: amount / 1e6,
        minRateBps,
        termDays,
        owner: keypair.publicKey.toBase58(),
        market: market.pubkey,
      },
      explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("place_lend_order error:", err);
    res.status(500).json({
      error: "Transaction failed",
      message: err.message,
      logs: err.logs || undefined,
    });
  }
});

// POST /place-borrow-order — 402 gated, submits on-chain tx
router.post("/place-borrow-order", async (req: Request, res: Response) => {
  const { amount, maxRateBps, termDays, collateralAmount } = req.body;

  if (!amount || !maxRateBps || !termDays || !collateralAmount) {
    res.status(400).json({
      error: "Missing required fields",
      required: ["amount", "maxRateBps", "termDays", "collateralAmount"],
    });
    return;
  }

  if (![7, 14, 30].includes(termDays)) {
    res.status(400).json({
      error: "Invalid termDays",
      message: "Must be 7, 14, or 30",
    });
    return;
  }

  if (amount <= 0 || maxRateBps <= 0 || collateralAmount <= 0) {
    res.status(400).json({
      error: "Invalid values",
      message: "amount, maxRateBps, and collateralAmount must be positive",
    });
    return;
  }

  const program = requireProgram(res);
  if (!program) return;
  const keypair = getServerKeypair()!;

  try {
    const allMarkets = await fetchAllMarkets();
    const market = allMarkets.find((m) => m.termDays === termDays);
    if (!market) {
      res.status(404).json({
        error: "Market not found",
        message: `No market exists for ${termDays}d term on devnet. Create one first.`,
      });
      return;
    }

    const marketPubkey = new PublicKey(market.pubkey);
    const collateralMint = new PublicKey(market.collateralMint);

    // Borrower's wSOL account
    const borrowerWsolAccount = findATA(collateralMint, keypair.publicKey);

    // Collateral vault = ATA of market PDA for collateral mint
    const collateralVault = findATA(collateralMint, marketPubkey);

    const tx = await program.methods
      .placeBorrowOrder(
        new anchor.BN(amount),
        maxRateBps,
        new anchor.BN(collateralAmount)
      )
      .accounts({
        market: marketPubkey,
        collateralVault,
        borrowerWsolAccount,
        borrower: keypair.publicKey,
      })
      .rpc();

    res.json({
      success: true,
      txSignature: tx,
      message: `Borrow order placed: ${amount / 1e6} USDC @ ${(maxRateBps / 100).toFixed(2)}% max, ${termDays}d, ${collateralAmount / 1e9} SOL collateral`,
      order: {
        type: "borrow",
        amount,
        amountUsdc: amount / 1e6,
        maxRateBps,
        termDays,
        collateralAmount,
        collateralSol: collateralAmount / 1e9,
        owner: keypair.publicKey.toBase58(),
        market: market.pubkey,
      },
      explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("place_borrow_order error:", err);
    res.status(500).json({
      error: "Transaction failed",
      message: err.message,
      logs: err.logs || undefined,
    });
  }
});

export default router;

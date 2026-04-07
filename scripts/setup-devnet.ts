import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

// --- Config ---
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.SERVER_KEYPAIR_PATH || path.join(process.env.HOME!, ".config/solana/id.json");
const IDL_PATH = path.resolve(__dirname, "../target/idl/epoch_lending.json");

// Known devnet USDC-like mint (we'll use our own for testing)
// wSOL mint on devnet
const NATIVE_WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

async function main() {
  // Load keypair
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  console.log("Wallet:", keypair.publicKey.toBase58());

  // Set up provider
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new anchor.Program(idl, provider);
  console.log("Program:", program.programId.toBase58());

  // --- Step 1: Create mock USDC mint (we own it so we can mint freely) ---
  console.log("\n--- Creating mock USDC mint ---");
  const usdcMint = await createMint(connection, keypair, keypair.publicKey, null, 6);
  console.log("USDC Mint:", usdcMint.toBase58());

  // --- Step 2: Create mock collateral mint (wSOL stand-in) ---
  console.log("\n--- Creating mock collateral mint ---");
  const collateralMint = await createMint(connection, keypair, keypair.publicKey, null, 9);
  console.log("Collateral Mint:", collateralMint.toBase58());

  // --- Step 3: Create 30d market ---
  console.log("\n--- Creating 30d market ---");
  const termDays = 30;
  const termBytes = Buffer.from(new Uint8Array(new Uint16Array([termDays]).buffer));

  const [marketPda, marketBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), termBytes, collateralMint.toBuffer()],
    program.programId
  );
  console.log("Market PDA:", marketPda.toBase58());

  try {
    await program.methods
      .createMarket(
        termDays,    // term_days
        15000,       // collateral_ratio_bps (150%)
        12000,       // liquidation_threshold_bps (120%)
        10           // protocol_fee_bps (0.10%)
      )
      .accounts({
        market: marketPda,
        collateralMint: collateralMint,
        usdcMint: usdcMint,
        authority: keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("30d market created!");
  } catch (e: any) {
    console.log("Market creation error:", e.message);
  }

  // --- Step 4: Create token accounts ---
  console.log("\n--- Setting up token accounts ---");

  // USDC vault (owned by market PDA)
  const vaultUsdc = await getOrCreateAssociatedTokenAccount(
    connection, keypair, usdcMint, marketPda, true
  );
  console.log("USDC Vault:", vaultUsdc.address.toBase58());

  // Collateral vault (owned by market PDA)
  const collateralVault = await getOrCreateAssociatedTokenAccount(
    connection, keypair, collateralMint, marketPda, true
  );
  console.log("Collateral Vault:", collateralVault.address.toBase58());

  // Lender's USDC account
  const lenderUsdc = await getOrCreateAssociatedTokenAccount(
    connection, keypair, usdcMint, keypair.publicKey
  );
  console.log("Lender USDC:", lenderUsdc.address.toBase58());

  // --- Step 5: Mint USDC to our wallet and place lend orders ---
  console.log("\n--- Minting USDC and placing orders ---");
  const MINT_AMOUNT = 100_000_000_000; // 100,000 USDC
  await mintTo(connection, keypair, usdcMint, lenderUsdc.address, keypair.publicKey, MINT_AMOUNT);
  console.log("Minted 100,000 USDC to wallet");

  // Place 3 lend orders at different rates (simulating the agent spread)
  const orders = [
    { amount: 20_000_000_000, rateBps: 281, label: "Conservative (2.81%)" },
    { amount: 30_000_000_000, rateBps: 256, label: "Moderate (2.56%)" },
    { amount: 40_000_000_000, rateBps: 231, label: "Aggressive (2.31%)" },
  ];

  // Get current market state to know order IDs
  const marketState = await (program.account as any).market.fetch(marketPda);
  let nextOrderId = marketState.nextOrderId.toNumber();

  for (const order of orders) {
    const orderIdBytes = new anchor.BN(nextOrderId).toArrayLike(Buffer, "le", 8);
    const [lendOrderPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("lend_order"),
        marketPda.toBuffer(),
        keypair.publicKey.toBuffer(),
        orderIdBytes,
      ],
      program.programId
    );

    try {
      const tx = await program.methods
        .placeLendOrder(new anchor.BN(order.amount), order.rateBps)
        .accounts({
          lendOrder: lendOrderPda,
          market: marketPda,
          lenderUsdcAccount: lenderUsdc.address,
          vaultUsdcAccount: vaultUsdc.address,
          lender: keypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  Lend order #${nextOrderId} placed: ${order.label} — ${order.amount / 1e6} USDC @ ${order.rateBps}bps — tx: ${tx.slice(0, 20)}...`);
      nextOrderId++;
    } catch (e: any) {
      console.log(`  Order failed: ${e.message}`);
    }
  }

  // --- Summary ---
  console.log("\n=== DEVNET SETUP COMPLETE ===");
  console.log(`Program:         ${program.programId.toBase58()}`);
  console.log(`Market (30d):    ${marketPda.toBase58()}`);
  console.log(`USDC Mint:       ${usdcMint.toBase58()}`);
  console.log(`Collateral Mint: ${collateralMint.toBase58()}`);
  console.log(`USDC Vault:      ${vaultUsdc.address.toBase58()}`);
  console.log(`Collateral Vault: ${collateralVault.address.toBase58()}`);
  console.log(`Orders placed:   ${orders.length} lend orders`);
  console.log(`\nVerify: curl http://localhost:3001/orderbook/30d`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});

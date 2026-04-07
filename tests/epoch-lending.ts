import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { EpochLending } from "../target/types/epoch_lending";

describe("epoch-lending", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.EpochLending as Program<EpochLending>;
  const authority = provider.wallet as anchor.Wallet;
  const payer = (authority as any).payer as Keypair;

  let usdcMint: PublicKey;
  let collateralMint: PublicKey; // mock wSOL

  // Separate keypairs for lender and borrower
  const lender = Keypair.generate();
  const borrower = Keypair.generate();

  // Treasury keypair for protocol fee collection
  const treasury = Keypair.generate();

  const TERM_7_DAYS = 7;
  const COLLATERAL_RATIO_BPS = 15000; // 150%
  const LIQUIDATION_THRESHOLD_BPS = 12000; // 120%
  const PROTOCOL_FEE_BPS = 10; // 0.10%

  // Market PDA — derived once, reused across tests
  let marketPda: PublicKey;
  let marketBump: number;

  // Vault accounts
  let vaultUsdcAccount: PublicKey;
  let collateralVaultAccount: PublicKey;

  // User token accounts
  let lenderUsdcAccount: PublicKey;
  let borrowerWsolAccount: PublicKey;
  let borrowerUsdcAccount: PublicKey;
  let treasuryUsdcAccount: PublicKey;

  before(async () => {
    // Fund lender, borrower, and treasury with SOL for tx fees
    const airdropLender = await provider.connection.requestAirdrop(
      lender.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    const airdropBorrower = await provider.connection.requestAirdrop(
      borrower.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    const airdropTreasury = await provider.connection.requestAirdrop(
      treasury.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropLender);
    await provider.connection.confirmTransaction(airdropBorrower);
    await provider.connection.confirmTransaction(airdropTreasury);

    // Create mock USDC mint (6 decimals)
    usdcMint = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      6
    );

    // Create mock collateral mint (wSOL stand-in, 9 decimals)
    collateralMint = await createMint(
      provider.connection,
      payer,
      authority.publicKey,
      null,
      9
    );

    // Derive market PDA
    [marketPda, marketBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        Buffer.from(new Uint8Array(new Uint16Array([TERM_7_DAYS]).buffer)),
        collateralMint.toBuffer(),
      ],
      program.programId
    );

    console.log("USDC Mint:", usdcMint.toBase58());
    console.log("Collateral Mint:", collateralMint.toBase58());
    console.log("Market PDA:", marketPda.toBase58());
  });

  describe("create_market", () => {
    it("creates a 7-day market", async () => {
      const tx = await program.methods
        .createMarket(
          TERM_7_DAYS,
          COLLATERAL_RATIO_BPS,
          LIQUIDATION_THRESHOLD_BPS,
          PROTOCOL_FEE_BPS
        )
        .accounts({
          market: marketPda,
          collateralMint: collateralMint,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("create_market tx:", tx);

      const market = await program.account.market.fetch(marketPda);
      expect(market.termDays).to.equal(TERM_7_DAYS);
      expect(market.collateralRatioBps).to.equal(COLLATERAL_RATIO_BPS);
      expect(market.liquidationThresholdBps).to.equal(LIQUIDATION_THRESHOLD_BPS);
      expect(market.protocolFeeBps).to.equal(PROTOCOL_FEE_BPS);
      expect(market.collateralMint.toBase58()).to.equal(collateralMint.toBase58());
      expect(market.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
      expect(market.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(market.nextOrderId.toNumber()).to.equal(0);
      expect(market.nextLoanId.toNumber()).to.equal(0);
      expect(market.activeLendOrders).to.equal(0);
      expect(market.activeBorrowOrders).to.equal(0);
      expect(market.activeLoans).to.equal(0);
      expect(market.bump).to.equal(marketBump);
    });

    it("rejects invalid term (10 days)", async () => {
      const invalidTerm = 10;
      const [invalidMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          Buffer.from(new Uint8Array(new Uint16Array([invalidTerm]).buffer)),
          collateralMint.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .createMarket(
            invalidTerm,
            COLLATERAL_RATIO_BPS,
            LIQUIDATION_THRESHOLD_BPS,
            PROTOCOL_FEE_BPS
          )
          .accounts({
            market: invalidMarketPda,
            collateralMint: collateralMint,
            usdcMint: usdcMint,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown InvalidTerm error");
      } catch (err) {
        expect(err.toString()).to.include("InvalidTerm");
      }
    });
  });

  describe("place_lend_order", () => {
    const LEND_AMOUNT = 10_000_000_000; // 10,000 USDC (6 decimals)
    const MIN_RATE_BPS = 800; // 8.0% APY

    before(async () => {
      // Create lender's USDC token account and fund it
      lenderUsdcAccount = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        lender.publicKey
      );

      await mintTo(
        provider.connection,
        payer,
        usdcMint,
        lenderUsdcAccount,
        authority.publicKey, // mint authority
        LEND_AMOUNT
      );

      // Create USDC vault owned by the market PDA
      vaultUsdcAccount = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        marketPda,
        Keypair.generate() // use a random keypair for the account address
      );

      console.log("Lender USDC account:", lenderUsdcAccount.toBase58());
      console.log("Vault USDC account:", vaultUsdcAccount.toBase58());
    });

    it("places a lend order for 10,000 USDC at 8%", async () => {
      // order_id will be 0 (first order in this market)
      const orderIdBytes = new BN(0).toArrayLike(Buffer, "le", 8);

      const [lendOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("lend_order"),
          marketPda.toBuffer(),
          lender.publicKey.toBuffer(),
          orderIdBytes,
        ],
        program.programId
      );

      const tx = await program.methods
        .placeLendOrder(new BN(LEND_AMOUNT), MIN_RATE_BPS)
        .accounts({
          lendOrder: lendOrderPda,
          market: marketPda,
          lenderUsdcAccount: lenderUsdcAccount,
          vaultUsdcAccount: vaultUsdcAccount,
          lender: lender.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lender])
        .rpc();

      console.log("place_lend_order tx:", tx);

      // Verify lend order
      const order = await program.account.lendOrder.fetch(lendOrderPda);
      expect(order.market.toBase58()).to.equal(marketPda.toBase58());
      expect(order.owner.toBase58()).to.equal(lender.publicKey.toBase58());
      expect(order.amount.toNumber()).to.equal(LEND_AMOUNT);
      expect(order.minRateBps).to.equal(MIN_RATE_BPS);
      expect(order.orderId.toNumber()).to.equal(0);
      expect(JSON.stringify(order.status)).to.equal(JSON.stringify({ open: {} }));

      // Verify USDC transferred to vault
      const vaultInfo = await getAccount(provider.connection, vaultUsdcAccount);
      expect(Number(vaultInfo.amount)).to.equal(LEND_AMOUNT);

      const lenderInfo = await getAccount(provider.connection, lenderUsdcAccount);
      expect(Number(lenderInfo.amount)).to.equal(0);

      // Verify market counters updated
      const market = await program.account.market.fetch(marketPda);
      expect(market.nextOrderId.toNumber()).to.equal(1);
      expect(market.activeLendOrders).to.equal(1);

      console.log("Lend order PDA:", lendOrderPda.toBase58());
    });
  });

  describe("place_borrow_order", () => {
    const BORROW_AMOUNT = 5_000_000_000; // 5,000 USDC (6 decimals)
    const MAX_RATE_BPS = 850; // 8.5% APY
    // At hardcoded $150/SOL, 150% of 5000 USDC = 7500 USDC = 50 SOL
    const COLLATERAL_AMOUNT = new BN(50).mul(new BN(10).pow(new BN(9))); // 50 SOL in base units (9 decimals)

    before(async () => {
      // Create borrower's wSOL token account and fund it
      borrowerWsolAccount = await createAccount(
        provider.connection,
        payer,
        collateralMint,
        borrower.publicKey
      );

      // Mint 100 mock wSOL to borrower (plenty of collateral)
      const mintAmount = new BN(100).mul(new BN(10).pow(new BN(9)));
      await mintTo(
        provider.connection,
        payer,
        collateralMint,
        borrowerWsolAccount,
        authority.publicKey, // mint authority
        BigInt(mintAmount.toString())
      );

      // Create collateral vault owned by the market PDA
      collateralVaultAccount = await createAccount(
        provider.connection,
        payer,
        collateralMint,
        marketPda,
        Keypair.generate()
      );

      console.log("Borrower wSOL account:", borrowerWsolAccount.toBase58());
      console.log("Collateral vault:", collateralVaultAccount.toBase58());
    });

    it("places a borrow order for 5,000 USDC at 8.5% with 50 SOL collateral", async () => {
      // order_id will be 1 (second order in this market, after the lend order)
      const orderIdBytes = new BN(1).toArrayLike(Buffer, "le", 8);

      const [borrowOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("borrow_order"),
          marketPda.toBuffer(),
          borrower.publicKey.toBuffer(),
          orderIdBytes,
        ],
        program.programId
      );

      const tx = await program.methods
        .placeBorrowOrder(new BN(BORROW_AMOUNT), MAX_RATE_BPS, COLLATERAL_AMOUNT)
        .accounts({
          borrowOrder: borrowOrderPda,
          market: marketPda,
          collateralVault: collateralVaultAccount,
          borrowerWsolAccount: borrowerWsolAccount,
          borrower: borrower.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      console.log("place_borrow_order tx:", tx);

      // Verify borrow order
      const order = await program.account.borrowOrder.fetch(borrowOrderPda);
      expect(order.market.toBase58()).to.equal(marketPda.toBase58());
      expect(order.owner.toBase58()).to.equal(borrower.publicKey.toBase58());
      expect(order.amount.toNumber()).to.equal(BORROW_AMOUNT);
      expect(order.maxRateBps).to.equal(MAX_RATE_BPS);
      expect(order.collateralAmount.toString()).to.equal(COLLATERAL_AMOUNT.toString());
      expect(order.orderId.toNumber()).to.equal(1);
      expect(JSON.stringify(order.status)).to.equal(JSON.stringify({ open: {} }));

      // Verify wSOL transferred to collateral vault
      const vaultInfo = await getAccount(provider.connection, collateralVaultAccount);
      expect(vaultInfo.amount.toString()).to.equal(COLLATERAL_AMOUNT.toString());

      // Verify market counters updated
      const market = await program.account.market.fetch(marketPda);
      expect(market.nextOrderId.toNumber()).to.equal(2);
      expect(market.activeLendOrders).to.equal(1);
      expect(market.activeBorrowOrders).to.equal(1);

      console.log("Borrow order PDA:", borrowOrderPda.toBase58());
    });

    it("rejects borrow order with insufficient collateral", async () => {
      // 10 SOL at $150 = $1500, but borrowing 5000 USDC needs $7500 at 150%
      const insufficientCollateral = new BN(10).mul(new BN(10).pow(new BN(9)));

      // order_id would be 2
      const orderIdBytes = new BN(2).toArrayLike(Buffer, "le", 8);

      const [borrowOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("borrow_order"),
          marketPda.toBuffer(),
          borrower.publicKey.toBuffer(),
          orderIdBytes,
        ],
        program.programId
      );

      try {
        await program.methods
          .placeBorrowOrder(new BN(BORROW_AMOUNT), MAX_RATE_BPS, insufficientCollateral)
          .accounts({
            borrowOrder: borrowOrderPda,
            market: marketPda,
            collateralVault: collateralVaultAccount,
            borrowerWsolAccount: borrowerWsolAccount,
            borrower: borrower.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([borrower])
          .rpc();

        expect.fail("Should have thrown InsufficientCollateral error");
      } catch (err) {
        expect(err.toString()).to.include("InsufficientCollateral");
      }
    });
  });

  describe("orderbook state verification", () => {
    it("both orders exist on-chain with correct state", async () => {
      // Fetch all lend orders
      const lendOrders = await program.account.lendOrder.all([
        { memcmp: { offset: 8, bytes: marketPda.toBase58() } },
      ]);
      expect(lendOrders.length).to.equal(1);
      expect(lendOrders[0].account.amount.toNumber()).to.equal(10_000_000_000);
      expect(lendOrders[0].account.minRateBps).to.equal(800);

      // Fetch all borrow orders
      const borrowOrders = await program.account.borrowOrder.all([
        { memcmp: { offset: 8, bytes: marketPda.toBase58() } },
      ]);
      expect(borrowOrders.length).to.equal(1);
      expect(borrowOrders[0].account.amount.toNumber()).to.equal(5_000_000_000);
      expect(borrowOrders[0].account.maxRateBps).to.equal(850);

      // Verify market aggregate state
      const market = await program.account.market.fetch(marketPda);
      expect(market.activeLendOrders).to.equal(1);
      expect(market.activeBorrowOrders).to.equal(1);
      expect(market.activeLoans).to.equal(0);
      expect(market.nextOrderId.toNumber()).to.equal(2);

      console.log("Orderbook verified: 1 lend order, 1 borrow order");
    });
  });

  // ============================================================
  // match_orders — creates a Loan from the lend + borrow orders
  // and transfers USDC from vault to borrower
  // ============================================================
  describe("match_orders", () => {
    const BORROW_AMOUNT = 5_000_000_000; // matched amount = min(10K, 5K) = 5K

    let loanPda: PublicKey;

    before(async () => {
      // Create borrower's USDC account to receive matched funds
      borrowerUsdcAccount = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        borrower.publicKey
      );

      console.log("Borrower USDC account:", borrowerUsdcAccount.toBase58());
    });

    it("matches lend and borrow orders into a loan", async () => {
      // Re-derive order PDAs
      const lendOrderIdBytes = new BN(0).toArrayLike(Buffer, "le", 8);
      const [lendOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("lend_order"),
          marketPda.toBuffer(),
          lender.publicKey.toBuffer(),
          lendOrderIdBytes,
        ],
        program.programId
      );

      const borrowOrderIdBytes = new BN(1).toArrayLike(Buffer, "le", 8);
      const [borrowOrderPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("borrow_order"),
          marketPda.toBuffer(),
          borrower.publicKey.toBuffer(),
          borrowOrderIdBytes,
        ],
        program.programId
      );

      // Loan PDA: loan_id = 0 (first loan)
      const loanIdBytes = new BN(0).toArrayLike(Buffer, "le", 8);
      [loanPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("loan"),
          marketPda.toBuffer(),
          loanIdBytes,
        ],
        program.programId
      );

      // Record balances before match
      const borrowerUsdcBefore = await getAccount(provider.connection, borrowerUsdcAccount);
      expect(Number(borrowerUsdcBefore.amount)).to.equal(0);

      const vaultBefore = await getAccount(provider.connection, vaultUsdcAccount);
      expect(Number(vaultBefore.amount)).to.equal(10_000_000_000);

      const tx = await program.methods
        .matchOrders()
        .accounts({
          loan: loanPda,
          lendOrder: lendOrderPda,
          borrowOrder: borrowOrderPda,
          market: marketPda,
          vaultUsdcAccount: vaultUsdcAccount,
          borrowerUsdcAccount: borrowerUsdcAccount,
          matcher: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("match_orders tx:", tx);

      // Verify loan created
      const loan = await program.account.loan.fetch(loanPda);
      expect(loan.market.toBase58()).to.equal(marketPda.toBase58());
      expect(loan.lender.toBase58()).to.equal(lender.publicKey.toBase58());
      expect(loan.borrower.toBase58()).to.equal(borrower.publicKey.toBase58());
      expect(loan.principal.toNumber()).to.equal(BORROW_AMOUNT); // min(10K, 5K)
      expect(loan.rateBps).to.equal(800); // lend_min_rate (maker gets their price)
      expect(loan.termDays).to.equal(7);
      expect(loan.collateralAmount.toString()).to.equal(
        new BN(50).mul(new BN(10).pow(new BN(9))).toString()
      );
      expect(JSON.stringify(loan.status)).to.equal(JSON.stringify({ active: {} }));
      expect(loan.loanId.toNumber()).to.equal(0);

      // Verify orders marked filled
      const lendOrder = await program.account.lendOrder.fetch(lendOrderPda);
      expect(JSON.stringify(lendOrder.status)).to.equal(JSON.stringify({ filled: {} }));

      const borrowOrder = await program.account.borrowOrder.fetch(borrowOrderPda);
      expect(JSON.stringify(borrowOrder.status)).to.equal(JSON.stringify({ filled: {} }));

      // Verify market counters
      const market = await program.account.market.fetch(marketPda);
      expect(market.activeLoans).to.equal(1);
      expect(market.nextLoanId.toNumber()).to.equal(1);

      console.log("Loan PDA:", loanPda.toBase58());
    });

    it("borrower received USDC from vault after match", async () => {
      // Borrower should have received the matched amount (5,000 USDC)
      const borrowerUsdcInfo = await getAccount(provider.connection, borrowerUsdcAccount);
      expect(Number(borrowerUsdcInfo.amount)).to.equal(BORROW_AMOUNT);

      // Vault should have 10K - 5K = 5K remaining (excess from larger lend order)
      const vaultInfo = await getAccount(provider.connection, vaultUsdcAccount);
      expect(Number(vaultInfo.amount)).to.equal(10_000_000_000 - BORROW_AMOUNT);

      console.log(
        "USDC transfer verified: borrower received",
        BORROW_AMOUNT / 1e6,
        "USDC"
      );
    });
  });

  // ============================================================
  // repay_loan — borrower repays principal + interest,
  // collateral returned, protocol fee collected
  // ============================================================
  describe("repay_loan", () => {
    const PRINCIPAL = 5_000_000_000; // 5,000 USDC
    const RATE_BPS = 800; // 8% APY
    const TERM_DAYS = 7;
    // interest = principal * rate_bps * term_days / (10000 * 365)
    // = 5_000_000_000 * 800 * 7 / 3_650_000 = 7_671_232 (truncated)
    const EXPECTED_INTEREST = Math.floor(
      (PRINCIPAL * RATE_BPS * TERM_DAYS) / (10_000 * 365)
    );
    const TOTAL_REPAYMENT = PRINCIPAL + EXPECTED_INTEREST;
    // Protocol fee = principal * 10 / 10000 = 5_000_000 (0.10%)
    const EXPECTED_FEE = Math.floor((PRINCIPAL * 10) / 10_000);

    let loanPda: PublicKey;
    const COLLATERAL_AMOUNT = new BN(50).mul(new BN(10).pow(new BN(9))); // 50 SOL

    before(async () => {
      // Derive loan PDA
      const loanIdBytes = new BN(0).toArrayLike(Buffer, "le", 8);
      [loanPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), marketPda.toBuffer(), loanIdBytes],
        program.programId
      );

      // Borrower needs USDC to repay (principal + interest + fee)
      // They already have 5K USDC from the match, need more for interest + fee
      const additionalUsdc = EXPECTED_INTEREST + EXPECTED_FEE;
      await mintTo(
        provider.connection,
        payer,
        usdcMint,
        borrowerUsdcAccount,
        authority.publicKey,
        additionalUsdc
      );

      // Create treasury USDC account for protocol fee
      treasuryUsdcAccount = await createAccount(
        provider.connection,
        payer,
        usdcMint,
        treasury.publicKey
      );

      console.log("Treasury USDC account:", treasuryUsdcAccount.toBase58());
      console.log("Expected interest:", EXPECTED_INTEREST);
      console.log("Expected fee:", EXPECTED_FEE);
    });

    it("borrower repays loan — principal, interest, fee, collateral returned", async () => {
      // Record balances before repay
      const lenderUsdcBefore = await getAccount(provider.connection, lenderUsdcAccount);
      const lenderBalanceBefore = Number(lenderUsdcBefore.amount);

      const borrowerWsolBefore = await getAccount(provider.connection, borrowerWsolAccount);
      const borrowerWsolBalanceBefore = Number(borrowerWsolBefore.amount);

      const collateralVaultBefore = await getAccount(provider.connection, collateralVaultAccount);
      expect(collateralVaultBefore.amount.toString()).to.equal(COLLATERAL_AMOUNT.toString());

      const tx = await program.methods
        .repayLoan()
        .accounts({
          loan: loanPda,
          market: marketPda,
          borrowerUsdcAccount: borrowerUsdcAccount,
          lenderUsdcAccount: lenderUsdcAccount,
          treasuryUsdcAccount: treasuryUsdcAccount,
          collateralVault: collateralVaultAccount,
          borrowerWsolAccount: borrowerWsolAccount,
          borrower: borrower.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower])
        .rpc();

      console.log("repay_loan tx:", tx);

      // Verify loan is repaid
      const loan = await program.account.loan.fetch(loanPda);
      expect(JSON.stringify(loan.status)).to.equal(JSON.stringify({ repaid: {} }));

      // Verify market active loans decremented
      const market = await program.account.market.fetch(marketPda);
      expect(market.activeLoans).to.equal(0);
    });

    it("lender received principal + interest", async () => {
      const lenderUsdcInfo = await getAccount(provider.connection, lenderUsdcAccount);
      // Lender had 0 USDC (all went to vault), now should have principal + interest
      expect(Number(lenderUsdcInfo.amount)).to.equal(TOTAL_REPAYMENT);
      console.log(
        "Lender received:",
        TOTAL_REPAYMENT / 1e6,
        "USDC (principal + interest)"
      );
    });

    it("borrower wSOL balance restored after repay", async () => {
      const borrowerWsolInfo = await getAccount(provider.connection, borrowerWsolAccount);
      // Borrower started with 100 SOL, deposited 50 SOL as collateral, got 50 back
      // So balance should be back to 100 SOL
      const expectedBalance = new BN(100).mul(new BN(10).pow(new BN(9)));
      expect(borrowerWsolInfo.amount.toString()).to.equal(expectedBalance.toString());

      // Collateral vault should be empty
      const vaultInfo = await getAccount(provider.connection, collateralVaultAccount);
      expect(Number(vaultInfo.amount)).to.equal(0);

      console.log("Collateral returned: 50 SOL back to borrower");
    });

    it("treasury received protocol fee", async () => {
      const treasuryInfo = await getAccount(provider.connection, treasuryUsdcAccount);
      expect(Number(treasuryInfo.amount)).to.equal(EXPECTED_FEE);
      console.log(
        "Treasury fee:",
        EXPECTED_FEE / 1e6,
        "USDC (",
        EXPECTED_FEE,
        "lamports)"
      );
    });
  });

  // ============================================================
  // mock_liquidate — test liquidation with manual SOL price
  // Requires a new loan since the previous one was repaid
  // ============================================================
  describe("mock_liquidate", () => {
    const liquidator = Keypair.generate();
    let liquidatorWsolAccount: PublicKey;
    let loanPda: PublicKey;

    const LEND_AMOUNT_2 = 5_000_000_000; // 5,000 USDC
    const BORROW_AMOUNT_2 = 5_000_000_000;
    const MIN_RATE_2 = 800;
    const MAX_RATE_2 = 850;
    const COLLATERAL_2 = new BN(50).mul(new BN(10).pow(new BN(9))); // 50 SOL

    before(async () => {
      // Fund liquidator with SOL for tx fees
      const airdrop = await provider.connection.requestAirdrop(
        liquidator.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      // Create liquidator's wSOL token account to receive collateral
      liquidatorWsolAccount = await createAccount(
        provider.connection,
        payer,
        collateralMint,
        liquidator.publicKey
      );

      // --- Set up a fresh loan for liquidation testing ---

      // Fund lender with more USDC
      await mintTo(
        provider.connection,
        payer,
        usdcMint,
        lenderUsdcAccount,
        authority.publicKey,
        LEND_AMOUNT_2
      );

      // Fund borrower with more wSOL collateral
      await mintTo(
        provider.connection,
        payer,
        collateralMint,
        borrowerWsolAccount,
        authority.publicKey,
        BigInt(COLLATERAL_2.toString())
      );

      // Place a new lend order (order_id = 2)
      const lendOrderIdBytes = new BN(2).toArrayLike(Buffer, "le", 8);
      const [lendOrderPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("lend_order"),
          marketPda.toBuffer(),
          lender.publicKey.toBuffer(),
          lendOrderIdBytes,
        ],
        program.programId
      );

      await program.methods
        .placeLendOrder(new BN(LEND_AMOUNT_2), MIN_RATE_2)
        .accounts({
          lendOrder: lendOrderPda2,
          market: marketPda,
          lenderUsdcAccount: lenderUsdcAccount,
          vaultUsdcAccount: vaultUsdcAccount,
          lender: lender.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lender])
        .rpc();

      // Place a new borrow order (order_id = 3)
      const borrowOrderIdBytes = new BN(3).toArrayLike(Buffer, "le", 8);
      const [borrowOrderPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("borrow_order"),
          marketPda.toBuffer(),
          borrower.publicKey.toBuffer(),
          borrowOrderIdBytes,
        ],
        program.programId
      );

      await program.methods
        .placeBorrowOrder(new BN(BORROW_AMOUNT_2), MAX_RATE_2, COLLATERAL_2)
        .accounts({
          borrowOrder: borrowOrderPda2,
          market: marketPda,
          collateralVault: collateralVaultAccount,
          borrowerWsolAccount: borrowerWsolAccount,
          borrower: borrower.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      // Match the new orders into loan_id = 1
      const loanIdBytes = new BN(1).toArrayLike(Buffer, "le", 8);
      [loanPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("loan"), marketPda.toBuffer(), loanIdBytes],
        program.programId
      );

      await program.methods
        .matchOrders()
        .accounts({
          loan: loanPda,
          lendOrder: lendOrderPda2,
          borrowOrder: borrowOrderPda2,
          market: marketPda,
          vaultUsdcAccount: vaultUsdcAccount,
          borrowerUsdcAccount: borrowerUsdcAccount,
          matcher: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Liquidator:", liquidator.publicKey.toBase58());
      console.log("Liquidator wSOL account:", liquidatorWsolAccount.toBase58());
      console.log("Loan to liquidate:", loanPda.toBase58());
    });

    it("rejects liquidation when LTV is healthy (SOL at $150)", async () => {
      // At $150/SOL: collateral = 50 SOL = $7,500
      // LTV = 5000 * 10000 / 7500 = 6666 bps = 66.7% — well below 120%
      const solPrice150 = new BN(150_000_000); // $150 in USDC 6-dec

      try {
        await program.methods
          .mockLiquidate(solPrice150)
          .accounts({
            loan: loanPda,
            market: marketPda,
            collateralVault: collateralVaultAccount,
            liquidatorCollateralAccount: liquidatorWsolAccount,
            liquidator: liquidator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([liquidator])
          .rpc();

        expect.fail("Should have thrown NotLiquidatable error");
      } catch (err) {
        expect(err.toString()).to.include("NotLiquidatable");
        console.log("Correctly rejected: LTV 66.7% < 120% threshold");
      }

      // Verify loan is still active
      const loan = await program.account.loan.fetch(loanPda);
      expect(JSON.stringify(loan.status)).to.equal(JSON.stringify({ active: {} }));
    });

    it("allows liquidation when LTV > 120% (SOL at $80)", async () => {
      // At $80/SOL: collateral = 50 SOL = $4,000
      // LTV = 5000 * 10000 / 4000 = 12500 bps = 125% — above 120%
      const solPrice80 = new BN(80_000_000); // $80 in USDC 6-dec

      // Record vault balance before liquidation
      const vaultBefore = await getAccount(provider.connection, collateralVaultAccount);
      const collateralAmount = vaultBefore.amount;

      const tx = await program.methods
        .mockLiquidate(solPrice80)
        .accounts({
          loan: loanPda,
          market: marketPda,
          collateralVault: collateralVaultAccount,
          liquidatorCollateralAccount: liquidatorWsolAccount,
          liquidator: liquidator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([liquidator])
        .rpc();

      console.log("mock_liquidate tx:", tx);

      // Verify loan is now liquidated
      const loan = await program.account.loan.fetch(loanPda);
      expect(JSON.stringify(loan.status)).to.equal(JSON.stringify({ liquidated: {} }));

      // Verify collateral transferred to liquidator
      const liquidatorInfo = await getAccount(provider.connection, liquidatorWsolAccount);
      expect(liquidatorInfo.amount.toString()).to.equal(collateralAmount.toString());

      // Verify vault is empty
      const vaultAfter = await getAccount(provider.connection, collateralVaultAccount);
      expect(Number(vaultAfter.amount)).to.equal(0);

      // Verify market active loans decremented
      const market = await program.account.market.fetch(marketPda);
      expect(market.activeLoans).to.equal(0);

      console.log(
        "Liquidation successful: 50 SOL collateral transferred to liquidator"
      );
    });
  });
});

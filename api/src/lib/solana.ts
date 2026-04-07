import {
  Connection,
  PublicKey,
  Keypair,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk"
);

export const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

export const connection = new Connection(RPC_URL, "confirmed");

// 8-byte Anchor account discriminators (from IDL)
export const DISCRIMINATORS = {
  LendOrder: Buffer.from([81, 43, 9, 95, 239, 151, 195, 173]),
  BorrowOrder: Buffer.from([42, 155, 26, 16, 5, 172, 213, 173]),
  Market: Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]),
};

export interface DeserializedLendOrder {
  pubkey: string;
  market: string;
  owner: string;
  amount: number;
  minRateBps: number;
  status: number;
  orderId: number;
  createdAt: number;
}

export interface DeserializedBorrowOrder {
  pubkey: string;
  market: string;
  owner: string;
  amount: number;
  maxRateBps: number;
  collateralAmount: number;
  status: number;
  orderId: number;
  createdAt: number;
}

export interface DeserializedMarket {
  pubkey: string;
  termDays: number;
  collateralMint: string;
  usdcMint: string;
  authority: string;
  collateralRatioBps: number;
  liquidationThresholdBps: number;
  protocolFeeBps: number;
  nextOrderId: number;
  nextLoanId: number;
  activeLendOrders: number;
  activeBorrowOrders: number;
  activeLoans: number;
}

// --- Deserialization (manual Borsh parsing) ---

export function deserializeLendOrder(
  pubkey: PublicKey,
  data: Buffer
): DeserializedLendOrder {
  let o = 8; // skip discriminator
  const market = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const owner = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const amount = Number(data.readBigUInt64LE(o));
  o += 8;
  const minRateBps = data.readUInt16LE(o);
  o += 2;
  const status = data.readUInt8(o);
  o += 1;
  const orderId = Number(data.readBigUInt64LE(o));
  o += 8;
  const createdAt = Number(data.readBigInt64LE(o));

  return {
    pubkey: pubkey.toBase58(),
    market: market.toBase58(),
    owner: owner.toBase58(),
    amount,
    minRateBps,
    status,
    orderId,
    createdAt,
  };
}

export function deserializeBorrowOrder(
  pubkey: PublicKey,
  data: Buffer
): DeserializedBorrowOrder {
  let o = 8;
  const market = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const owner = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const amount = Number(data.readBigUInt64LE(o));
  o += 8;
  const maxRateBps = data.readUInt16LE(o);
  o += 2;
  const collateralAmount = Number(data.readBigUInt64LE(o));
  o += 8;
  const status = data.readUInt8(o);
  o += 1;
  const orderId = Number(data.readBigUInt64LE(o));
  o += 8;
  const createdAt = Number(data.readBigInt64LE(o));

  return {
    pubkey: pubkey.toBase58(),
    market: market.toBase58(),
    owner: owner.toBase58(),
    amount,
    maxRateBps,
    collateralAmount,
    status,
    orderId,
    createdAt,
  };
}

export function deserializeMarket(
  pubkey: PublicKey,
  data: Buffer
): DeserializedMarket {
  let o = 8;
  const termDays = data.readUInt16LE(o);
  o += 2;
  const collateralMint = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const usdcMint = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const authority = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const collateralRatioBps = data.readUInt16LE(o);
  o += 2;
  const liquidationThresholdBps = data.readUInt16LE(o);
  o += 2;
  const protocolFeeBps = data.readUInt16LE(o);
  o += 2;
  const nextOrderId = Number(data.readBigUInt64LE(o));
  o += 8;
  const nextLoanId = Number(data.readBigUInt64LE(o));
  o += 8;
  const activeLendOrders = data.readUInt32LE(o);
  o += 4;
  const activeBorrowOrders = data.readUInt32LE(o);
  o += 4;
  const activeLoans = data.readUInt32LE(o);

  return {
    pubkey: pubkey.toBase58(),
    termDays,
    collateralMint: collateralMint.toBase58(),
    usdcMint: usdcMint.toBase58(),
    authority: authority.toBase58(),
    collateralRatioBps,
    liquidationThresholdBps,
    protocolFeeBps,
    nextOrderId,
    nextLoanId,
    activeLendOrders,
    activeBorrowOrders,
    activeLoans,
  };
}

// --- getProgramAccounts helpers ---

export async function fetchAllMarkets(): Promise<DeserializedMarket[]> {
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(DISCRIMINATORS.Market) } },
  ];

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });
  return accounts.map((a) => deserializeMarket(a.pubkey, a.account.data as Buffer));
}

export async function fetchLendOrders(
  marketPubkey: string
): Promise<DeserializedLendOrder[]> {
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(DISCRIMINATORS.LendOrder) } },
    { memcmp: { offset: 8, bytes: marketPubkey } },
  ];

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });
  return accounts.map((a) => deserializeLendOrder(a.pubkey, a.account.data as Buffer));
}

export async function fetchBorrowOrders(
  marketPubkey: string
): Promise<DeserializedBorrowOrder[]> {
  const filters: GetProgramAccountsFilter[] = [
    { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(DISCRIMINATORS.BorrowOrder) } },
    { memcmp: { offset: 8, bytes: marketPubkey } },
  ];

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });
  return accounts.map((a) => deserializeBorrowOrder(a.pubkey, a.account.data as Buffer));
}

// --- ATA derivation (avoids ESM-only @solana/spl-token import) ---

const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export function findATA(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// --- Anchor program for tx submission ---

let _program: anchor.Program | null | undefined;
let _serverKeypair: Keypair | null | undefined;

export function getServerKeypair(): Keypair | null {
  if (_serverKeypair !== undefined) return _serverKeypair;

  // Option 1: JSON string in env var (for Railway / cloud deploys)
  const keypairJson = process.env.SERVER_KEYPAIR;
  if (keypairJson) {
    try {
      const raw = JSON.parse(keypairJson);
      _serverKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
      return _serverKeypair;
    } catch {
      _serverKeypair = null;
      return null;
    }
  }

  // Option 2: file path (for local dev)
  const keypairPath = process.env.SERVER_KEYPAIR_PATH;
  if (!keypairPath) {
    _serverKeypair = null;
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    _serverKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
    return _serverKeypair;
  } catch {
    _serverKeypair = null;
    return null;
  }
}

export function getProgram(): anchor.Program | null {
  if (_program !== undefined) return _program;

  const keypair = getServerKeypair();
  if (!keypair) {
    _program = null;
    return null;
  }

  try {
    let idl: any;

    // Option 1: IDL as env var (JSON string)
    if (process.env.EPOCH_IDL) {
      idl = JSON.parse(process.env.EPOCH_IDL);
    } else {
      // Option 2: bundled IDL at api/idl/ (works locally and on Railway)
      const bundledPath = path.resolve(__dirname, "../../idl/epoch_lending.json");
      // Option 3: repo root target/ (local dev fallback)
      const repoPath = path.resolve(__dirname, "../../../target/idl/epoch_lending.json");
      const idlPath = fs.existsSync(bundledPath) ? bundledPath : repoPath;
      idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    }

    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    _program = new anchor.Program(idl, provider);
    return _program;
  } catch {
    _program = null;
    return null;
  }
}

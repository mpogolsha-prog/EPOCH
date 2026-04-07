#!/bin/bash
# Deploy epoch-lending to Solana devnet
# Run: chmod +x deploy-devnet.sh && ./deploy-devnet.sh

set -e

export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$HOME/.cargo/bin:$PATH"

echo "=== EPOCH Lending — Devnet Deploy ==="

# 1. Switch to devnet
echo "→ Setting Solana CLI to devnet..."
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json

# 2. Check balance, airdrop if needed
BALANCE=$(solana balance | awk '{print $1}')
echo "→ Current balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
  echo "→ Airdropping 5 SOL..."
  solana airdrop 5 || solana airdrop 2 || solana airdrop 1
  sleep 2
  echo "→ New balance: $(solana balance)"
fi

# 3. Build
echo "→ Building program..."
anchor build

# 4. Deploy
echo "→ Deploying to devnet..."
anchor deploy --provider.cluster devnet

# 5. Get program ID and save to .env
PROGRAM_ID=$(solana-keygen pubkey target/deploy/epoch_lending-keypair.json)
echo "→ Program ID: $PROGRAM_ID"

# Save to .env files
echo "PROGRAM_ID=$PROGRAM_ID" > .env
echo "PROGRAM_ID=$PROGRAM_ID" >> api/.env
echo "RPC_URL=https://api.devnet.solana.com" >> api/.env
echo "SERVER_KEYPAIR_PATH=$HOME/.config/solana/id.json" >> api/.env
echo "PORT=3001" >> api/.env

echo ""
echo "=== Deploy complete ==="
echo "Program ID: $PROGRAM_ID"
echo "Saved to .env and api/.env"
echo ""
echo "To start the API server:"
echo "  cd api && npm run dev"

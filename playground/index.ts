import { PNPClient } from 'pnp-sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { decode } from 'bs58'

const RPC_URL = 'https://api.devnet.solana.com'
// const RPC_URL = 'https://api.mainnet-beta.solana.com'
// const RPC_URL = 'https://api.mainnet-beta.solana.com'

const COLLATERAL_MINT = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'

// For write operations (with private key)
const privateKey = decode(process.env.PRIVATE_KEY || '')
const client = new PNPClient(RPC_URL, privateKey)

const keypair = Keypair.fromSecretKey(privateKey)
console.log('Keypair:', keypair.publicKey.toBase58())

async function fetchGlobal() {
  const global = await client.fetchGlobalConfig()

  console.log('Global:', global)

  return global
}

async function main() {
  // Market parameters
  const question = 'Will I get 1 million dollars by the end of 2025'
  const side = 'yes' // 'yes' or 'no'
  const initialAmount = 1_000_000n // 1 USDC (6 decimals)
  const creatorSideCap = 5_000_000n // 5 USDC max for creator's side
  const endTime = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) // 30 days
  const collateralMint = new PublicKey(COLLATERAL_MINT) // USDC-dev

  // Create P2P market
  const result = await client.createP2PMarketGeneral({
    question,
    initialAmount,
    side,
    creatorSideCap,
    endTime,
    collateralTokenMint: collateralMint,
  })

  console.log('P2P market created successfully!')
  console.log('Signature:', result.signature)
  console.log('Market Address:', result.market)
  console.log('Yes Token Mint:', result.yesTokenMint)
  console.log('No Token Mint:', result.noTokenMint)
}

main().catch(console.error)

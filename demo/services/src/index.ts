import { Elysia } from 'elysia'
import { PNPClient } from 'pnp-sdk'
import { Connection, PublicKey } from '@solana/web3.js'

const PRIVATE_KEY = process.env.PRIVATE_KEY
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com'
const COLLATERAL_MINT = process.env.COLLATERAL_MINT || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr' // USDC Devnet

const client = new PNPClient(RPC_URL, PRIVATE_KEY)
const connection = new Connection(RPC_URL)

interface CreateMarketRequest {
  question: string
  initialLiquidity: number // in smallest units (e.g., 10000000 = 10 USDC with 6 decimals)
  endTime: number // in seconds from now
  settlerAddress?: string // optional, defaults to client's signer address
  yesOddsBps?: number // optional, defaults to 5000 (50%)
  collateralMint?: string // optional, defaults to USDC devnet
}

interface CreateMarketResponse {
  success: boolean
  market?: string
  signature?: string
  question?: string
  network?: string
  explorerUrl?: string
  txUrl?: string
  error?: string
}

interface SettleMarketRequest {
  market: string // market address
  yesWinner: boolean // true if YES option won, false if NO option won
}

interface SettleMarketResponse {
  success: boolean
  market?: string
  signature?: string
  winner?: 'YES' | 'NO'
  network?: string
  explorerUrl?: string
  txUrl?: string
  error?: string
}

const app = new Elysia()
  .get('/', () => ({
    message: 'PNP Market Creation Service',
    version: '1.0.0',
    endpoints: {
      'POST /market/create': 'Create a prediction market using PnP',
      'POST /market/settle': 'Settle/resolve a prediction market',
    },
  }))
  .post('/market/create', async ({ body }): Promise<CreateMarketResponse> => {
    const marketData = body as CreateMarketRequest
    try {
      if (!PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY environment variable is required')
      }

      if (!client.signer) {
        throw new Error('PNP client signer not available')
      }

      const {
        question,
        initialLiquidity,
        endTime,
        settlerAddress,
        yesOddsBps = 5000, // 50% default
        collateralMint = COLLATERAL_MINT,
      } = marketData

      // Validate required fields
      if (!question || !initialLiquidity || !endTime) {
        throw new Error('Missing required fields: question, initialLiquidity, endTime')
      }

      // Parse addresses
      const collateralMintPubkey = new PublicKey(collateralMint)
      const settlerPubkey = settlerAddress 
        ? new PublicKey(settlerAddress) 
        : client.signer.publicKey

      // Calculate end time (current time + endTime seconds)
      const endTimeUnix = BigInt(Math.floor(Date.now() / 1000) + endTime)
      const initialLiquidityBigInt = BigInt(initialLiquidity)

      console.log('Creating market with:', {
        question,
        initialLiquidity: initialLiquidityBigInt.toString(),
        endTime: new Date(Number(endTimeUnix) * 1000).toISOString(),
        settlerAddress: settlerPubkey.toBase58(),
        collateralMint: collateralMintPubkey.toBase58(),
        yesOddsBps,
      })

      // Create market with custom oracle
      const createMarketRes = await client.createMarketWithCustomOracle({
        question,
        initialLiquidity: initialLiquidityBigInt,
        endTime: endTimeUnix,
        collateralMint: collateralMintPubkey,
        settlerAddress: settlerPubkey,
        yesOddsBps,
      })

      console.log('Market created, confirming transaction...')
      await connection.confirmTransaction(createMarketRes.signature)

      // Set market as resolvable (optional but recommended)
      try {
        await client.setMarketResolvable(new PublicKey(createMarketRes.market.toBase58()), true)
        console.log('Market set as resolvable')
      } catch (error) {
        console.warn('Failed to set market as resolvable:', error)
        // Continue even if this fails
      }

      const isDevnet = client.client.isDevnet
      const cluster = isDevnet ? 'devnet' : 'mainnet'
      const marketAddress = createMarketRes.market.toBase58()

      return {
        success: true,
        market: marketAddress,
        signature: createMarketRes.signature,
        question,
        network: cluster,
        explorerUrl: `https://explorer.solana.com/address/${marketAddress}?cluster=${cluster}`,
        txUrl: `https://explorer.solana.com/tx/${createMarketRes.signature}?cluster=${cluster}`,
      }
    } catch (error) {
      console.error('Error creating market:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  })
  .post('/market/settle', async ({ body }): Promise<SettleMarketResponse> => {
    const settleData = body as SettleMarketRequest
    try {
      if (!PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY environment variable is required')
      }

      if (!client.signer) {
        throw new Error('PNP client signer not available')
      }

      const { market, yesWinner } = settleData

      // Validate required fields
      if (!market || typeof yesWinner !== 'boolean') {
        throw new Error('Missing required fields: market (address), yesWinner (boolean)')
      }

      // Parse market address
      const marketPubkey = new PublicKey(market)

      console.log('Settling market:', {
        market: marketPubkey.toBase58(),
        yesWinner,
        winner: yesWinner ? 'YES' : 'NO',
      })

      // Settle the market
      const settleRes = await client.settleMarket({
        market: marketPubkey,
        yesWinner,
      })

      console.log('Market settled, confirming transaction...')
      await connection.confirmTransaction(settleRes.signature)

      const isDevnet = client.client.isDevnet
      const cluster = isDevnet ? 'devnet' : 'mainnet'

      return {
        success: true,
        market: marketPubkey.toBase58(),
        signature: settleRes.signature,
        winner: yesWinner ? 'YES' : 'NO',
        network: cluster,
        explorerUrl: `https://explorer.solana.com/address/${marketPubkey.toBase58()}?cluster=${cluster}`,
        txUrl: `https://explorer.solana.com/tx/${settleRes.signature}?cluster=${cluster}`,
      }
    } catch (error) {
      console.error('Error settling market:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  })
  .listen(3000)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)

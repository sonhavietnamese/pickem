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

interface MarketDataResponse {
  success: boolean
  market?: {
    address: string
    question: string
    resolved: boolean
    resolvable: boolean
    endTime: string
    winningTokenId?: number | null
    yesTokenMint: string
    noTokenMint: string
    yesReserves?: string
    noReserves?: string
    totalVolume?: string
    yesPrice?: number
    noPrice?: number
  }
  error?: string
}

const app = new Elysia()
  .get('/', () => ({
    message: 'PNP Market Creation Service',
    version: '1.0.0',
    endpoints: {
      'POST /market/create': 'Create a prediction market using PnP',
      'POST /market/settle': 'Settle/resolve a prediction market',
      'GET /market/:address': 'Get market data by address',
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
      const settlerPubkey = settlerAddress ? new PublicKey(settlerAddress) : client.signer.publicKey

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
  .get('/market/:address', async ({ params }): Promise<MarketDataResponse> => {
    const { address } = params
    try {
      if (!address) {
        throw new Error('Market address is required')
      }

      // console.log('Fetching market data for address:', address)

      const marketPubkey = new PublicKey(address)

      // Fetch market data from PnP
      const marketData = await client.fetchMarket(marketPubkey)

      if (!marketData || !(marketData as any).account) {
        throw new Error('Market not found')
      }

      const account = (marketData as any).account

      // Parse winning_token_id (can be {"Yes": {}} or {"No": {}})
      let winningTokenId: number | null = null
      if (account.winning_token_id) {
        if (account.winning_token_id.Yes !== undefined) {
          winningTokenId = 0 // YES
        } else if (account.winning_token_id.No !== undefined) {
          winningTokenId = 1 // NO
        }
      }

      // Parse token supplies from hex strings
      let yesReserves: string | undefined
      let noReserves: string | undefined
      let totalVolume: string | undefined
      let yesPrice: number | undefined
      let noPrice: number | undefined

      try {
        // Parse hex strings to numbers (token supplies)
        // Handle hex strings (remove '0x' prefix if present, handle numbers)
        const parseHex = (value: any): number => {
          if (value === null || value === undefined) {
            return 0
          }
          // If already a number, return it
          if (typeof value === 'number') {
            return value
          }
          // Convert to string and parse
          const hexStr = String(value)
          // Ensure it's actually a string with startsWith method
          if (typeof hexStr !== 'string' || !hexStr) {
            return 0
          }
          const cleaned = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr
          const parsed = parseInt(cleaned, 16)
          return isNaN(parsed) ? 0 : parsed
        }

        const yesSupplyNum = parseHex(account.yes_token_supply_minted)
        const noSupplyNum = parseHex(account.no_token_supply_minted)
        const totalSupply = yesSupplyNum + noSupplyNum

        yesReserves = yesSupplyNum.toString()
        noReserves = noSupplyNum.toString()

        // Use market_reserves as total volume (in smallest units, decimal string)
        // market_reserves represents the total liquidity in the market
        // Handle market_reserves as string or number
        if (account.market_reserves !== undefined && account.market_reserves !== null) {
          totalVolume =
            typeof account.market_reserves === 'string' ? account.market_reserves : account.market_reserves.toString()
        } else {
          totalVolume = totalSupply.toString()
        }

        // Calculate prices from token supplies (normalized to 0-1)
        // Price represents the probability/odds based on token supply ratio
        if (totalSupply > 0) {
          yesPrice = yesSupplyNum / totalSupply
          noPrice = noSupplyNum / totalSupply
        } else if (account.market_reserves) {
          // If no tokens minted yet, use initial liquidity split (default 50/50)
          const marketReserves =
            typeof account.market_reserves === 'string'
              ? parseInt(account.market_reserves, 10)
              : account.market_reserves
          if (marketReserves > 0) {
            yesPrice = 0.5 // Default 50/50 split
            noPrice = 0.5
          }
        }
      } catch (error) {
        console.warn('Could not parse market reserves:', error)
      }

      const isDevnet = client.client.isDevnet
      const cluster = isDevnet ? 'devnet' : 'mainnet'

      return {
        success: true,
        market: {
          address: marketPubkey.toBase58(),
          question: account.question || '',
          resolved: account.resolved ?? false,
          resolvable: account.resolvable ?? false,
          endTime: account.end_time?.toString() || '0',
          winningTokenId,
          yesTokenMint: account.yes_token_mint?.toString() || '',
          noTokenMint: account.no_token_mint?.toString() || '',
          yesReserves,
          noReserves,
          totalVolume,
          yesPrice,
          noPrice,
        },
      }
    } catch (error) {
      console.error('Error fetching market data:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  })
  .listen(3000)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)

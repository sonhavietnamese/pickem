import { PublicKey } from '@solana/web3.js'
import { eq } from 'drizzle-orm'
import { APIError } from 'encore.dev/api'
import StreamerService from '../streamers/streamer.service'
import { db } from './database'
import { COLLATERAL_MINT, connection, MASTER_KEYPAIR, pnp } from './libs'
import { CreateMarketDto, MarketResponse } from './market.interface'
import { markets } from './schema'

const MarketsService = {
  create: async (data: CreateMarketDto): Promise<MarketResponse> => {
    // check user is streamer aka streamer exists
    const streamer = await StreamerService.findByUsername(data.username)
    if (!streamer.success) {
      throw APIError.aborted(streamer.message || 'Streamer not found')
    }

    const initialLiquidity = BigInt(data.initialLiquidity)
    const endTime = BigInt(Math.floor(Date.now() / 1000) + data.endTime) // 1 minute
    const collateralMint = COLLATERAL_MINT
    const settlerAddress = MASTER_KEYPAIR.publicKey
    const yesOddsBps = 5000

    const createMarketRes = await pnp.createMarketWithCustomOracle({
      question: data.question,
      initialLiquidity: initialLiquidity,
      endTime: endTime,
      collateralMint: collateralMint,
      settlerAddress: settlerAddress,
      yesOddsBps: yesOddsBps,
    })

    await connection.confirmTransaction(createMarketRes.signature)

    const setResolvableRes = await pnp.setMarketResolvable(new PublicKey(createMarketRes.market.toBase58()), true)

    const result = {
      network: pnp.client.isDevnet ? 'devnet' : 'mainnet',
      market: createMarketRes.market.toBase58(),
      signature: createMarketRes.signature,
      question: data.question,
      customOracle: settlerAddress.toBase58(),
      collateralMint: COLLATERAL_MINT.toBase58(),
      initialLiquidity: initialLiquidity.toString(),
      endTime: new Date(Number(endTime) * 1000).toISOString(),
      explorerUrl: `https://explorer.solana.com/address/${createMarketRes.market.toBase58()}?cluster=devnet`,
      txUrl: `https://explorer.solana.com/tx/${createMarketRes.signature}?cluster=devnet`,
    } as MarketResponse['result']

    // save market to database
    await db.insert(markets).values({
      streamer: data.username,
      market: createMarketRes.market.toBase58(),
    })

    return {
      success: true,
      result: {
        market: createMarketRes.market.toBase58(),
      },
    }
  },

  getMarketsByStreamer: async (streamer: string): Promise<MarketResponse> => {
    const marketResult = await db.select().from(markets).where(eq(markets.streamer, streamer))

    return {
      success: true,
      result: marketResult,
    }
  },
}

export default MarketsService

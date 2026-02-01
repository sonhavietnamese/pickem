import { CronJob } from 'encore.dev/cron'
import { api } from 'encore.dev/api'
import MarketsService from './market.service'
import { CREATOR_API_URL, DEFAULT_USERNAME, INITIAL_LIQUIDITY } from './secrets'

interface MarketAPIResponse {
  frame_id: number
  id: number
  question: string
  duration_minutes: number
  options: string[]
  baseline_value: string
  prediction_type: string
}

export const createMarketFromAPI = api({}, async () => {
  try {
    // Get secrets (Encore secrets are string values)
    const username = DEFAULT_USERNAME
    const apiUrl = CREATOR_API_URL
    const initialLiquidityStr = INITIAL_LIQUIDITY.toString() // 10 USDC (6 decimals)
    const initialLiquidity = parseInt(initialLiquidityStr, 10)

    // Call the Python FastAPI service
    const response = await fetch(`${apiUrl}/market/${username}`)

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const marketData = (await response.json()) as MarketAPIResponse

    console.log(`[Cron] Creating market for ${username}:`, {
      question: marketData.question,
      duration_minutes: marketData.duration_minutes,
      frame_id: marketData.frame_id,
    })

    // Convert duration_minutes to seconds for endTime
    const endTimeSeconds = marketData.duration_minutes * 60

    // Create market using PnP
    const result = await MarketsService.create({
      username,
      question: marketData.question,
      initialLiquidity,
      endTime: endTimeSeconds,
    })

    console.log(`[Cron] Market created successfully:`, result)

    return {
      success: true,
      message: 'Market created successfully',
      result,
    }
  } catch (error) {
    console.error('[Cron] Error creating market:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
})

// Cron job that runs every 3 minutes
const _ = new CronJob('create-market-every-5min', {
  title: 'Create prediction market every 5 minutes',
  every: '5m',
  endpoint: createMarketFromAPI,
})

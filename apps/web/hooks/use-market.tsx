'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { env } from '@/env'

// Types
export interface MarketDto {
  /** Market address */
  market: string
  /** Streamer username */
  streamer?: string
}

export interface CreateMarketDto {
  /** Username of the streamer */
  username: string
  /** The question for the market */
  question: string
  /** Initial liquidity amount */
  initialLiquidity: number
  /** End time in seconds */
  endTime: number
}

export interface CreateMarketResponse {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** The result of the market creation */
  result?: {
    /** Network (devnet/mainnet) */
    network: string
    /** Market address */
    market: string
    /** Transaction signature */
    signature: string
    /** The question */
    question: string
    /** Custom oracle address */
    customOracle: string
    /** Collateral mint address */
    collateralMint: string
    /** Initial liquidity amount */
    initialLiquidity: string
    /** End time as ISO string */
    endTime: string
    /** Explorer URL for the market */
    explorerUrl: string
    /** Transaction URL */
    txUrl: string
  }
}

export interface MarketResponse {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** Market data */
  result?: MarketDto | MarketDto[]
}

const API_BASE_URL = env.NEXT_PUBLIC_API_URL

// Query keys
export const marketKeys = {
  all: ['markets'] as const,
  lists: () => [...marketKeys.all, 'list'] as const,
  detail: (marketId: string) =>
    [...marketKeys.all, 'detail', marketId] as const,
  byUsername: () => [...marketKeys.all, 'username'] as const,
  username: (username: string) =>
    [...marketKeys.byUsername(), username] as const,
}

// API functions
async function getMarketsByUsername(
  username: string
): Promise<MarketResponse> {
  const response = await fetch(
    `${API_BASE_URL}/markets/username/${encodeURIComponent(username)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch markets' }))
    throw new Error(error.message || 'Failed to fetch markets')
  }

  return response.json()
}

async function createMarket(
  data: CreateMarketDto
): Promise<CreateMarketResponse> {
  const response = await fetch(`${API_BASE_URL}/markets/create-market`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to create market' }))
    throw new Error(error.message || 'Failed to create market')
  }

  return response.json()
}

// Hook options
interface UseMarketOptions {
  /** Fetch markets for a specific username */
  username?: string | null | undefined
}

// Main hook
export function useMarket(options?: UseMarketOptions) {
  const queryClient = useQueryClient()

  // Query for markets by username (enabled when username is provided)
  const marketUsername = options?.username
  const getByUsernameQuery = useQuery({
    queryKey: marketKeys.username(marketUsername ?? ''),
    queryFn: () => {
      if (!marketUsername) {
        throw new Error('Username is required')
      }
      return getMarketsByUsername(marketUsername)
    },
    enabled: !!marketUsername,
  })

  // Create mutation
  const create = useMutation({
    mutationFn: createMarket,
    onSuccess: (data, variables) => {
      // Invalidate market lists and optionally cache the new market
      queryClient.invalidateQueries({ queryKey: marketKeys.lists() })
      if (data.result?.market) {
        queryClient.setQueryData(marketKeys.detail(data.result.market), data)
      }
      // Invalidate markets by username
      queryClient.invalidateQueries({
        queryKey: marketKeys.username(variables.username),
      })
    },
  })

  return {
    // Query results
    getByUsername: getByUsernameQuery,
    // Mutations
    create,
  }
}

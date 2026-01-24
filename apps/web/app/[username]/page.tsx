'use client'

import { useMarket } from '@/hooks/use-market'
import { useStreamer } from '@/hooks/use-streamer'
import { env } from '@/env'
import { useQuery } from '@tanstack/react-query'
import { use, useMemo } from 'react'

interface PageProps {
  params: Promise<{
    username: string
  }>
}

// Component to fetch and display individual market details
function MarketCard({ marketAddress }: { marketAddress: string }) {
  const { data: marketData, isLoading, isError } = useQuery({
    queryKey: ['market-detail', marketAddress],
    queryFn: async () => {
      const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/markets/${marketAddress}`)
      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: 'Failed to fetch market',
        }))
        throw new Error(error.message || 'Failed to fetch market')
      }
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch market')
      }
      return {
        question: data.result.question,
        resolved: data.result.resolved,
        resolvable: data.result.resolvable,
        endTime: BigInt(data.result.endTime),
        winningTokenId: data.result.winningTokenId,
        creator: data.result.creator,
        yesTokenMint: data.result.yesTokenMint,
        noTokenMint: data.result.noTokenMint,
      }
    },
    retry: 2,
    staleTime: 60 * 1000, // 1 minute
  })

  const isEnded = useMemo(() => {
    if (!marketData?.endTime) return false
    const now = new Date().getTime()
    return now > Number(marketData.endTime) * 1000
  }, [marketData])

  const getStatusBadge = () => {
    if (isLoading) {
      return (
        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
          Loading...
        </span>
      )
    }
    if (isError) {
      return (
        <span className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded">
          Error
        </span>
      )
    }
    if (!marketData) return null

    if (marketData.resolved) {
      let winningToken = 'N/A'
      const tokenId = marketData.winningTokenId
      if (typeof tokenId === 'string') {
        winningToken = tokenId.toUpperCase()
      } else if (typeof tokenId === 'number') {
        winningToken = String(tokenId)
      } else if (tokenId && typeof tokenId === 'object') {
        // Handle Record case - convert to string representation
        winningToken = JSON.stringify(tokenId)
      }
      return (
        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
          Resolved: {winningToken}
        </span>
      )
    }
    if (!marketData.resolvable) {
      return (
        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
          Not Resolvable
        </span>
      )
    }
    if (isEnded) {
      return (
        <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded">
          Ended (Pending Resolution)
        </span>
      )
    }
    return (
      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
        Active
      </span>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {marketData ? (
            <>
              <h3 className="font-semibold mb-2 text-lg">{marketData.question}</h3>
              <div className="flex flex-wrap gap-2 mb-2">{getStatusBadge()}</div>
              <div className="space-y-1 text-sm text-gray-600">
                {marketData.endTime && (
                  <p>
                    End Time:{' '}
                    {new Date(Number(marketData.endTime) * 1000).toLocaleString()}
                  </p>
                )}
                <p className="font-mono text-xs break-all">
                  Address: {marketAddress}
                </p>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold mb-2">Market</h3>
              <p className="text-sm text-gray-600 font-mono break-all">
                {marketAddress}
              </p>
              {getStatusBadge()}
            </>
          )}
        </div>
        <a
          href={`https://explorer.solana.com/address/${marketAddress}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 text-sm ml-4 whitespace-nowrap"
        >
          View →
        </a>
      </div>
    </div>
  )
}

export default function Page({ params }: PageProps) {
  const { username } = use(params)
  const { getByUsername: getStreamer } = useStreamer({ username })
  const { getByUsername: getMarkets } = useMarket({ username })

  // Loading state
  if (getStreamer.isLoading || getMarkets.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    )
  }

  // Error state
  if (getStreamer.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">
          Error: {getStreamer.error?.message || 'Failed to load streamer'}
        </div>
      </div>
    )
  }

  // Check if streamer was found
  const streamer = getStreamer.data?.success
    ? Array.isArray(getStreamer.data.result)
      ? getStreamer.data.result[0]
      : getStreamer.data.result
    : null

  // Not found state
  if (!getStreamer.data?.success || !streamer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Streamer not found</div>
      </div>
    )
  }

  // Get markets data
  const markets = getMarkets.data?.success
    ? Array.isArray(getMarkets.data.result)
      ? getMarkets.data.result
      : getMarkets.data.result
        ? [getMarkets.data.result]
        : []
    : []

  // Found - show streamer and markets
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Streamer Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{streamer.username}</h1>
        </div>

        {/* Markets Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Markets</h2>

          {getMarkets.isError && (
            <div className="text-red-500 mb-4">
              Error loading markets:{' '}
              {getMarkets.error?.message || 'Failed to load markets'}
            </div>
          )}

          {markets.length === 0 && !getMarkets.isLoading && (
            <div className="text-gray-500 py-8 text-center">
              No markets found for this streamer
            </div>
          )}

          {markets.length > 0 && (
            <div className="grid gap-4">
              {markets.map((market) => (
                <MarketCard key={market.market} marketAddress={market.market} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

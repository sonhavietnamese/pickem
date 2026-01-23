'use client'

import { useMarket } from '@/hooks/use-market'
import { useStreamer } from '@/hooks/use-streamer'
import { use } from 'react'

interface PageProps {
  params: Promise<{
    username: string
  }>
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
                <div
                  key={market.market}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2">Market</h3>
                      <p className="text-sm text-gray-600 font-mono break-all">
                        {market.market}
                      </p>
                    </div>
                    <a
                      href={`https://explorer.solana.com/address/${market.market}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 text-sm ml-4"
                    >
                      View →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

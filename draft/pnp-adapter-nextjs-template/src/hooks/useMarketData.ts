'use client'

import { useQuery } from '@tanstack/react-query'
import { getMarketData, getMarketVersion, getPrice } from 'pnp-adapter'
import { useSolanaWallet } from './useSolanaWallet'

export function useMarketData(marketAddress: string | null) {
  const { connection } = useSolanaWallet()

  return useQuery({
    queryKey: ['marketData', marketAddress],
    queryFn: async () => {
      if (!marketAddress) return null

      const [data, version, yesPrice, noPrice] = await Promise.all([
        getMarketData(connection, marketAddress),
        getMarketVersion(connection, marketAddress),
        getPrice(connection, marketAddress, 'yes'),
        getPrice(connection, marketAddress, 'no'),
      ])

      return {
        ...data,
        version,
        yesPrice,
        noPrice,
      }
    },
    enabled: !!marketAddress,
    refetchInterval: 10000,
  })
}

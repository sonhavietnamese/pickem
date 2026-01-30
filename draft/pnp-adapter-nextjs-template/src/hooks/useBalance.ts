'use client'

import { useQuery } from '@tanstack/react-query'
import { getUSDCBalance } from 'pnp-adapter'
import { useSolanaWallet } from './useSolanaWallet'

export function useBalance() {
  const { connection, address, isConnected } = useSolanaWallet()

  return useQuery({
    queryKey: ['balance', address],
    queryFn: async () => {
      if (!address) return 0
      return getUSDCBalance(connection, address)
    },
    enabled: isConnected && !!address,
    refetchInterval: 30000,
  })
}

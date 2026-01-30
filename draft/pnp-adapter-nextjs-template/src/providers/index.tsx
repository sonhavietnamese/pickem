'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  )

  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!privyAppId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card text-center">
          <h2 className="text-xl font-bold text-red-500 mb-2">
            Configuration Error
          </h2>
          <p className="text-zinc-400">
            Missing NEXT_PUBLIC_PRIVY_APP_ID environment variable.
            <br />
            Please check your .env file.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
          logo: 'https://pnp.exchange/logo.png',
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
        },
        // Only wallet login
        loginMethods: ['wallet'],
        // Disable embedded wallets entirely
        embeddedWallets: {
          createOnLogin: 'off',
        },
        // Solana wallets only
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        // Solana clusters
        solanaClusters: [
          {
            name: 'devnet',
            rpcUrl: 'https://api.devnet.solana.com',
          },
        ],
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyProvider>
  )
}

'use client'

import { useMemo } from 'react'
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth'
import { Connection, Transaction } from '@solana/web3.js'
import type { Wallet } from 'pnp-adapter'

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

export function useSolanaWallet() {
  const { authenticated, ready } = usePrivy()
  const { wallets } = useSolanaWallets()

  const connection = useMemo(() => {
    return new Connection(RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    })
  }, [])

  const activeWallet = useMemo(() => {
    if (!wallets.length) return null
    // Prefer external wallet over embedded
    return wallets.find((w) => w.walletClientType !== 'privy') || wallets[0]
  }, [wallets])

  const sdkWallet: Wallet | null = useMemo(() => {
    if (!activeWallet) return null

    return {
      address: activeWallet.address,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        try {
          // Log transaction for debugging
          console.log('Signing transaction with wallet:', activeWallet.walletClientType)
          console.log('Fee payer:', tx.feePayer?.toString())
          console.log('Instructions count:', tx.instructions.length)

          const signedTx = await activeWallet.signTransaction(tx)
          return signedTx as Transaction
        } catch (error: any) {
          console.error('Wallet sign error details:', error)

          // Try to extract more meaningful error
          const msg = error?.message || String(error)

          if (msg.includes('User rejected') || msg.includes('rejected')) {
            throw new Error('Transaction rejected by user')
          }
          if (msg.includes('insufficient') || msg.includes('Insufficient')) {
            throw new Error('Insufficient balance for transaction')
          }
          if (msg.includes('simulation') || msg.includes('Simulation')) {
            throw new Error('Transaction simulation failed - check account balances and permissions')
          }

          throw new Error(`Wallet signing failed: ${msg}`)
        }
      },
    }
  }, [activeWallet])

  return {
    connection,
    wallet: sdkWallet,
    address: activeWallet?.address || null,
    isConnected: authenticated && ready && !!activeWallet,
    isLoading: !ready,
    walletType: activeWallet?.walletClientType || null,
  }
}

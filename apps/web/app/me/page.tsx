'use client'

import { env } from '@/env'
import { useFund } from '@/hooks/use-fund'
import { useStreamer } from '@/hooks/use-streamer'
import { useLogin, usePrivy, useSigners } from '@privy-io/react-auth'
import { useMarket } from '@/hooks/use-market'

export default function Page() {
  const { ready } = usePrivy()
  const { addSigners } = useSigners()
  const { login } = useLogin({
    onComplete: async ({ user }) => {
      console.log('User logged in successfully', user)
    },
    onError: (error) => {
      console.error('Login failed', error)
    },
  })
  const { user } = usePrivy()
  const fund = useFund()
  const { create: createStreamer } = useStreamer()
  const { create: createMarket } = useMarket()
  const handleLogin = async () => {
    login()
  }

  const handleAddSigner = async () => {
    console.log('user', user?.wallet?.address)
    const wallet = user?.wallet?.address
    if (!wallet) {
      return
    }
    await addSigners({
      address: wallet!,
      signers: [{ signerId: env.NEXT_PUBLIC_SIGNER_ID }],
    })
  }

  const handleFundWallet = async () => {
    const wallet = user?.wallet?.address
    if (!wallet) {
      console.error('No wallet address found')
      return
    }

    fund.mutate(
      { address: wallet },
      {
        onSuccess: (data) => {
          console.log('Wallet funded successfully!', data)
          console.log('Transaction signature:', data.signature)
          console.log('Explorer URL:', data.explorerUrl)
        },
        onError: (error) => {
          console.error('Failed to fund wallet:', error.message)
          // You can add error toast notification here
        },
      }
    )
  }

  const handleCreateMarket = async () => {
    const twitch = user?.twitch
    if (!twitch || !twitch.username) {
      return
    }
    createMarket.mutate(
      {
        username: twitch.username,
        question: 'aus!',
        initialLiquidity: 10000000,
        endTime: 10 * 60,
      },
      {
        onSuccess: (data) => {
          console.log('Market created successfully!', data)
        },
        onError: (error) => {
          console.error('Failed to create market:', error.message)
        },
      }
    )
  }

  const handleCreateStreamer = async () => {
    console.log('user', user?.wallet?.address)
    const wallet = user?.wallet?.address
    if (!wallet) {
      return
    }

    const twitch = user.twitch

    if (!twitch || !twitch.username) {
      return
    }
    createStreamer.mutate({
      username: twitch.username,
      wallet: wallet,
    })
  }

  if (!ready) {
    return <div>Loading...</div>
  }

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-[#020204]">
      <h1>Streamer</h1>
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-md"
        onClick={handleLogin}
      >
        Auth w Twitch
      </button>
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-md"
        onClick={handleAddSigner}
      >
        Add Signer
      </button>
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleFundWallet}
        disabled={fund.isPending || !user?.wallet?.address}
      >
        {fund.isPending ? 'Funding...' : 'Fund Wallet'}
      </button>
      {fund.isError && (
        <p className="text-red-500 mt-2">Error: {fund.error?.message}</p>
      )}

      {/*  */}
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-md"
        onClick={handleCreateMarket}
      >
        Create Market
      </button>

      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-md"
        onClick={handleCreateStreamer}
      >
        Create Streamer
      </button>
    </main>
  )
}

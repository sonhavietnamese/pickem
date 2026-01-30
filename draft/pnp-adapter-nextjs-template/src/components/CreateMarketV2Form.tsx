'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { createMarketV2, DEFAULT_COLLATERAL_MINT } from 'pnp-adapter'
import { useSolanaWallet } from '@/hooks'

export function CreateMarketV2Form() {
  const { connection, wallet, isConnected } = useSolanaWallet()
  const [isLoading, setIsLoading] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    question: '',
    initialLiquidity: '10',
    endTime: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!wallet || !isConnected) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!formData.question.trim()) {
      toast.error('Please enter a question')
      return
    }

    const liquidity = parseFloat(formData.initialLiquidity)
    if (isNaN(liquidity) || liquidity <= 0) {
      toast.error('Please enter a valid liquidity amount')
      return
    }

    if (!formData.endTime) {
      toast.error('Please select an end time')
      return
    }

    const endTimeUnix = Math.floor(new Date(formData.endTime).getTime() / 1000)
    if (endTimeUnix <= Math.floor(Date.now() / 1000)) {
      toast.error('End time must be in the future')
      return
    }

    setIsLoading(true)
    setTxSignature(null)

    try {
      const signature = await createMarketV2(connection, wallet, {
        question: formData.question,
        initialLiquidity: liquidity * 1_000_000, // Convert to base units
        endTime: endTimeUnix,
        collateralMint: DEFAULT_COLLATERAL_MINT.toString(),
      })

      setTxSignature(signature)
      toast.success('Market created successfully!')

      // Reset form
      setFormData({
        question: '',
        initialLiquidity: '10',
        endTime: '',
      })
    } catch (error: any) {
      console.error('Failed to create market:', error)
      toast.error(error?.message || 'Failed to create market')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">
        Create V2 Market (Pythagorean AMM)
      </h2>
      <p className="text-zinc-400 text-sm mb-6">
        V2 markets use a Pythagorean AMM model for price discovery.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Question</label>
          <input
            type="text"
            value={formData.question}
            onChange={(e) =>
              setFormData({ ...formData, question: e.target.value })
            }
            placeholder="Will BTC reach $100k by end of 2024?"
            className="input w-full"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Initial Liquidity (USDC)
          </label>
          <input
            type="number"
            value={formData.initialLiquidity}
            onChange={(e) =>
              setFormData({ ...formData, initialLiquidity: e.target.value })
            }
            placeholder="10"
            min="1"
            step="1"
            className="input w-full"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">End Time</label>
          <input
            type="datetime-local"
            value={formData.endTime}
            onChange={(e) =>
              setFormData({ ...formData, endTime: e.target.value })
            }
            className="input w-full"
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !isConnected}
          className="btn-primary w-full"
        >
          {isLoading ? 'Creating...' : 'Create V2 Market'}
        </button>
      </form>

      {txSignature && (
        <div className="mt-4 p-4 bg-green-900/20 border border-green-800 rounded-lg">
          <p className="text-green-400 text-sm mb-2">Transaction successful!</p>
          <a
            href={`https://solscan.io/tx/${txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm hover:underline break-all"
          >
            View on Solscan: {txSignature.slice(0, 20)}...
          </a>
        </div>
      )}
    </div>
  )
}

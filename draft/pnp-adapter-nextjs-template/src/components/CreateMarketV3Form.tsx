'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { createMarketV3, DEFAULT_COLLATERAL_MINT } from 'pnp-adapter'
import { useSolanaWallet } from '@/hooks'

export function CreateMarketV3Form() {
  const { connection, wallet, isConnected } = useSolanaWallet()
  const [isLoading, setIsLoading] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    question: '',
    amount: '10',
    side: 'yes' as 'yes' | 'no',
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

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
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
      const signature = await createMarketV3(connection, wallet, {
        question: formData.question,
        amount: amount * 1_000_000, // Convert to base units
        side: formData.side,
        endTime: endTimeUnix,
        collateralMint: DEFAULT_COLLATERAL_MINT.toString(),
      })

      setTxSignature(signature)
      toast.success('Market created successfully!')

      // Reset form
      setFormData({
        question: '',
        amount: '10',
        side: 'yes',
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
      <h2 className="text-xl font-bold mb-4">Create V3 Market (Parimutuel)</h2>
      <p className="text-zinc-400 text-sm mb-6">
        V3 markets use a parimutuel model where both sides bet against each
        other.
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
            placeholder="Will ETH flip BTC by 2025?"
            className="input w-full"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Initial Amount (USDC)
          </label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: e.target.value })
            }
            placeholder="10"
            min="1"
            step="1"
            className="input w-full"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Your Side</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, side: 'yes' })}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                formData.side === 'yes'
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
              disabled={isLoading}
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, side: 'no' })}
              className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                formData.side === 'no'
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
              disabled={isLoading}
            >
              NO
            </button>
          </div>
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
          {isLoading ? 'Creating...' : 'Create V3 Market'}
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

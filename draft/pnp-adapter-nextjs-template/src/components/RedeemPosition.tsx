'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  redeemPositionV2,
  redeemPositionV3,
  getMarketVersion,
  getMarketTokenAddresses,
} from 'pnp-adapter'
import { useSolanaWallet } from '@/hooks'

export function RedeemPosition() {
  const { connection, wallet, isConnected } = useSolanaWallet()
  const [isLoading, setIsLoading] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)
  const [detectedVersion, setDetectedVersion] = useState<number | null>(null)

  const [formData, setFormData] = useState({
    marketAddress: '',
    creatorAddress: '', // Only needed for V2
  })

  const detectVersion = async () => {
    if (!formData.marketAddress.trim()) {
      toast.error('Please enter a market address')
      return
    }

    try {
      const version = await getMarketVersion(connection, formData.marketAddress)
      if (version === null) {
        toast.error('Could not detect market version')
        setDetectedVersion(null)
      } else {
        setDetectedVersion(version)
        toast.success(`Detected V${version} market`)
      }
    } catch (error: any) {
      console.error('Failed to detect version:', error)
      toast.error('Failed to detect market version')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!wallet || !isConnected) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!formData.marketAddress.trim()) {
      toast.error('Please enter a market address')
      return
    }

    setIsLoading(true)
    setTxSignature(null)

    try {
      // Auto-detect version if not already detected
      let version = detectedVersion
      if (version === null) {
        version = await getMarketVersion(connection, formData.marketAddress)
        if (version === null) {
          throw new Error('Could not detect market version')
        }
        setDetectedVersion(version)
      }

      let signature: string

      if (version === 3) {
        // V3 redeem - simpler, doesn't need creator address
        signature = await redeemPositionV3(connection, wallet, {
          marketAddress: formData.marketAddress,
        })
      } else {
        // V1/V2 redeem - needs more parameters
        if (!formData.creatorAddress.trim()) {
          toast.error('V2 markets require the creator address')
          setIsLoading(false)
          return
        }

        // Get token addresses from market
        const tokenAddresses = await getMarketTokenAddresses(
          connection,
          formData.marketAddress
        )
        if (!tokenAddresses) {
          throw new Error('Could not fetch market token addresses')
        }

        signature = await redeemPositionV2(connection, wallet, {
          marketAddress: formData.marketAddress,
          marketCreatorAddress: formData.creatorAddress,
          yesTokenAddress: tokenAddresses.yesTokenMint,
          noTokenAddress: tokenAddresses.noTokenMint,
        })
      }

      setTxSignature(signature)
      toast.success('Position redeemed successfully!')
    } catch (error: any) {
      console.error('Redeem failed:', error)
      toast.error(error?.message || 'Redeem failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Redeem Position</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Redeem your winning tokens after a market has been resolved. Works for
        both V2 and V3 markets.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Market Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={formData.marketAddress}
              onChange={(e) => {
                setFormData({ ...formData, marketAddress: e.target.value })
                setDetectedVersion(null)
              }}
              placeholder="Enter market address..."
              className="input flex-1 font-mono text-sm"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={detectVersion}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
              disabled={isLoading}
            >
              Detect
            </button>
          </div>
          {detectedVersion !== null && (
            <p className="text-sm text-green-400 mt-2">
              Detected: V{detectedVersion} Market
            </p>
          )}
        </div>

        {(detectedVersion === 1 || detectedVersion === 2) && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Market Creator Address
              <span className="text-zinc-500 ml-1">(required for V2)</span>
            </label>
            <input
              type="text"
              value={formData.creatorAddress}
              onChange={(e) =>
                setFormData({ ...formData, creatorAddress: e.target.value })
              }
              placeholder="Enter creator address..."
              className="input w-full font-mono text-sm"
              disabled={isLoading}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !isConnected}
          className="btn-primary w-full"
        >
          {isLoading ? 'Processing...' : 'Redeem Position'}
        </button>
      </form>

      {txSignature && (
        <div className="mt-4 p-4 bg-green-900/20 border border-green-800 rounded-lg">
          <p className="text-green-400 text-sm mb-2">Redemption successful!</p>
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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  mintYesTokenV2,
  mintNoTokenV2,
  burnYesTokenV2,
  burnNoTokenV2,
  buyYesTokenV3,
  buyNoTokenV3,
  getMarketVersion,
  getMarketData,
  getPrice,
  getMarketTokenAddresses,
  getUserTokenBalance,
} from 'pnp-adapter'
import {
  useSolanaWallet,
  useBirdeye,
  getKnownToken,
  type TokenInfo,
} from '@/hooks'

type TradeAction = 'buy' | 'sell'
type TokenSide = 'yes' | 'no'

export function MarketTrade() {
  const { connection, wallet, isConnected } = useSolanaWallet()
  const { getTokenInfo } = useBirdeye()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [txSignature, setTxSignature] = useState<string | null>(null)

  const [marketAddress, setMarketAddress] = useState('')
  const [amount, setAmount] = useState('1')
  const [action, setAction] = useState<TradeAction>('buy')
  const [side, setSide] = useState<TokenSide>('yes')

  // Market info
  const [marketInfo, setMarketInfo] = useState<{
    version: number | null
    yesPrice: number
    noPrice: number
    creator: string
    collateralToken: string
    reserves: number
  } | null>(null)

  // Collateral token info from Birdeye
  const [collateralInfo, setCollateralInfo] = useState<TokenInfo | null>(null)

  // User's YES/NO token balances (for V2 sell)
  const [userTokenBalances, setUserTokenBalances] = useState<{
    yesBalance: number
    noBalance: number
    yesTokenMint: string
    noTokenMint: string
  } | null>(null)

  // Helper to fetch user token balances
  const fetchUserTokenBalances = useCallback(async () => {
    if (
      !marketAddress ||
      !wallet?.address ||
      !marketInfo ||
      marketInfo.version === 3
    ) {
      return
    }

    try {
      const tokenAddresses = await getMarketTokenAddresses(
        connection,
        marketAddress
      )
      if (tokenAddresses) {
        const [yesBalance, noBalance] = await Promise.all([
          getUserTokenBalance(
            connection,
            wallet.address,
            tokenAddresses.yesTokenMint
          ),
          getUserTokenBalance(
            connection,
            wallet.address,
            tokenAddresses.noTokenMint
          ),
        ])
        const decimals = collateralInfo?.decimals || 6
        setUserTokenBalances({
          yesBalance: yesBalance / Math.pow(10, decimals),
          noBalance: noBalance / Math.pow(10, decimals),
          yesTokenMint: tokenAddresses.yesTokenMint,
          noTokenMint: tokenAddresses.noTokenMint,
        })
      }
    } catch (err) {
      console.error('Failed to fetch token balances:', err)
    }
  }, [
    connection,
    marketAddress,
    wallet?.address,
    marketInfo,
    collateralInfo?.decimals,
  ])

  // Fetch balances when wallet connects after market is loaded
  useEffect(() => {
    if (
      marketInfo &&
      marketInfo.version !== 3 &&
      wallet?.address &&
      !userTokenBalances
    ) {
      fetchUserTokenBalances()
    }
  }, [marketInfo, wallet?.address, userTokenBalances, fetchUserTokenBalances])

  const fetchMarketInfo = async () => {
    if (!marketAddress.trim()) {
      toast.error('Please enter a market address')
      return
    }

    setIsFetching(true)
    setMarketInfo(null)
    setCollateralInfo(null)
    setUserTokenBalances(null)

    try {
      const [version, data, yesPrice, noPrice] = await Promise.all([
        getMarketVersion(connection, marketAddress),
        getMarketData(connection, marketAddress),
        getPrice(connection, marketAddress, 'yes'),
        getPrice(connection, marketAddress, 'no'),
      ])

      if (version === null || !data) {
        toast.error('Could not find market')
        return
      }

      // Get creator and collateral token from market account
      const marketAccount = data.marketAccount as any
      console.log('Market account data:', marketAccount)
      console.log('Market account keys:', Object.keys(marketAccount))

      const creator = marketAccount.creator?.toString() || ''
      const collateralToken = marketAccount.collateralToken?.toString() || ''

      console.log('Creator address:', creator)
      console.log('Collateral token:', collateralToken)

      setMarketInfo({
        version,
        yesPrice,
        noPrice,
        creator,
        collateralToken,
        reserves: data.marketReserves,
      })

      // Fetch collateral token info from Birdeye (or use known tokens)
      let tokenDecimals = 6
      if (collateralToken) {
        const known = getKnownToken(collateralToken)
        if (known) {
          setCollateralInfo(known)
          tokenDecimals = known.decimals
        } else {
          // Fetch from Birdeye API
          const tokenInfo = await getTokenInfo(collateralToken)
          if (tokenInfo) {
            setCollateralInfo(tokenInfo)
            tokenDecimals = tokenInfo.decimals
          }
        }
      }

      // Fetch user's YES/NO token balances for V2 markets
      if (version !== 3 && wallet?.address) {
        try {
          const tokenAddresses = await getMarketTokenAddresses(
            connection,
            marketAddress
          )
          if (tokenAddresses) {
            const [yesBalance, noBalance] = await Promise.all([
              getUserTokenBalance(
                connection,
                wallet.address,
                tokenAddresses.yesTokenMint
              ),
              getUserTokenBalance(
                connection,
                wallet.address,
                tokenAddresses.noTokenMint
              ),
            ])
            setUserTokenBalances({
              yesBalance: yesBalance / Math.pow(10, tokenDecimals),
              noBalance: noBalance / Math.pow(10, tokenDecimals),
              yesTokenMint: tokenAddresses.yesTokenMint,
              noTokenMint: tokenAddresses.noTokenMint,
            })
          }
        } catch (err) {
          console.error('Failed to fetch token balances:', err)
        }
      }

      toast.success(`Found V${version} market`)
    } catch (error: any) {
      console.error('Failed to fetch market:', error)
      toast.error(error?.message || 'Failed to fetch market info')
    } finally {
      setIsFetching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!wallet || !isConnected) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!marketInfo) {
      toast.error('Please fetch market info first')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsLoading(true)
    setTxSignature(null)

    try {
      const decimals = collateralInfo?.decimals || 6
      const amountBaseUnits = Math.floor(amountNum * Math.pow(10, decimals))

      console.log('Trade params:', {
        marketAddress,
        amount: amountNum,
        amountBaseUnits,
        decimals,
        creator: marketInfo.creator,
        side,
        action,
        version: marketInfo.version,
      })

      let signature: string

      if (marketInfo.version === 3) {
        // V3 market - only buy supported
        if (action === 'sell') {
          toast.error(
            "V3 markets don't support selling. Use Redeem after settlement."
          )
          setIsLoading(false)
          return
        }

        const result =
          side === 'yes'
            ? await buyYesTokenV3(
                connection,
                wallet,
                marketAddress,
                amountBaseUnits
              )
            : await buyNoTokenV3(
                connection,
                wallet,
                marketAddress,
                amountBaseUnits
              )

        signature = result.txSig
        if (result.isPotSizeReached) {
          toast.success(`Bought ${side.toUpperCase()}! (Pot limit reached)`)
        } else {
          toast.success(`Bought ${side.toUpperCase()} tokens!`)
        }
      } else {
        // V1/V2 market
        if (action === 'buy') {
          signature =
            side === 'yes'
              ? await mintYesTokenV2(
                  connection,
                  wallet,
                  marketAddress,
                  amountBaseUnits,
                  marketInfo.creator
                )
              : await mintNoTokenV2(
                  connection,
                  wallet,
                  marketAddress,
                  amountBaseUnits,
                  marketInfo.creator
                )
          toast.success(`Bought ${side.toUpperCase()} tokens!`)
        } else {
          signature =
            side === 'yes'
              ? await burnYesTokenV2(
                  connection,
                  wallet,
                  marketAddress,
                  amountBaseUnits,
                  marketInfo.creator
                )
              : await burnNoTokenV2(
                  connection,
                  wallet,
                  marketAddress,
                  amountBaseUnits,
                  marketInfo.creator
                )
          toast.success(`Sold ${side.toUpperCase()} tokens!`)
        }
      }

      setTxSignature(signature)

      // Refresh market info and balances
      fetchMarketInfo()
      fetchUserTokenBalances()
    } catch (error: any) {
      console.error('Trade failed:', error)
      toast.error(error?.message || 'Trade failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Trade Market</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Enter a market address to buy or sell tokens. Works for both V2 and V3
        markets.
      </p>

      <div className="space-y-4">
        {/* Market Address Input */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Market Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={marketAddress}
              onChange={(e) => {
                setMarketAddress(e.target.value)
                setMarketInfo(null)
              }}
              placeholder="Enter market address..."
              className="input flex-1 font-mono text-sm"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={fetchMarketInfo}
              disabled={isFetching || isLoading}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isFetching ? '...' : 'Load'}
            </button>
          </div>
        </div>

        {/* Market Info Display */}
        {marketInfo && (
          <div className="p-4 bg-zinc-800/50 rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Market Version</span>
              <span className="font-medium">V{marketInfo.version}</span>
            </div>

            {/* Collateral Token Info */}
            <div className="flex justify-between items-center p-3 bg-zinc-700/50 rounded-lg">
              <div className="flex items-center gap-2">
                {collateralInfo?.logoURI && (
                  <img
                    src={collateralInfo.logoURI}
                    alt={collateralInfo.symbol}
                    className="w-6 h-6 rounded-full"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {collateralInfo?.symbol || 'Unknown Token'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {collateralInfo?.name ||
                      marketInfo.collateralToken.slice(0, 8) + '...'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">
                  {marketInfo.reserves.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-zinc-400">Total Reserves</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-green-900/20 border border-green-800 rounded-lg">
                <p className="text-green-400 text-sm">YES Price</p>
                <p className="text-xl font-bold text-green-400">
                  {(marketInfo.yesPrice * 100).toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-3 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-red-400 text-sm">NO Price</p>
                <p className="text-xl font-bold text-red-400">
                  {(marketInfo.noPrice * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            {marketInfo.version === 3 && (
              <p className="text-yellow-500 text-xs text-center">
                V3 markets only support buying. Sell via Redeem after
                settlement.
              </p>
            )}

            {/* User Token Balances for V2 */}
            {marketInfo.version !== 3 && userTokenBalances && (
              <div className="mt-3 p-3 bg-zinc-700/30 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-zinc-400 text-xs">Your Token Holdings</p>
                  <button
                    type="button"
                    onClick={fetchUserTokenBalances}
                    className="text-xs text-primary hover:underline"
                  >
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 bg-green-900/30 border border-green-800/50 rounded">
                    <p className="text-green-400 text-xs">YES Tokens</p>
                    <p className="text-lg font-bold text-green-400">
                      {userTokenBalances.yesBalance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </p>
                  </div>
                  <div className="text-center p-2 bg-red-900/30 border border-red-800/50 rounded">
                    <p className="text-red-400 text-xs">NO Tokens</p>
                    <p className="text-lg font-bold text-red-400">
                      {userTokenBalances.noBalance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {marketInfo.version !== 3 && !userTokenBalances && isConnected && (
              <div className="flex justify-center items-center gap-2 mt-2">
                <p className="text-zinc-500 text-xs">
                  Loading your token balances...
                </p>
                <button
                  type="button"
                  onClick={fetchUserTokenBalances}
                  className="text-xs text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            {marketInfo.version !== 3 && !isConnected && (
              <p className="text-zinc-500 text-xs text-center mt-2">
                Connect wallet to see your token holdings
              </p>
            )}
          </div>
        )}

        {/* Trade Form - Only show after market is loaded */}
        {marketInfo && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Action Toggle - Only for V2 */}
            {marketInfo.version !== 3 && (
              <div>
                <label className="block text-sm font-medium mb-2">Action</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAction('buy')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      action === 'buy'
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                    disabled={isLoading}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction('sell')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      action === 'sell'
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                    disabled={isLoading}
                  >
                    Sell
                  </button>
                </div>
              </div>
            )}

            {/* Side Toggle */}
            <div>
              <label className="block text-sm font-medium mb-2">Side</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide('yes')}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    side === 'yes'
                      ? 'bg-green-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                  disabled={isLoading}
                >
                  YES ({(marketInfo.yesPrice * 100).toFixed(1)}%)
                </button>
                <button
                  type="button"
                  onClick={() => setSide('no')}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    side === 'no'
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                  disabled={isLoading}
                >
                  NO ({(marketInfo.noPrice * 100).toFixed(1)}%)
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">
                  {action === 'sell' && marketInfo.version !== 3
                    ? `Amount (${side.toUpperCase()} tokens)`
                    : `Amount (${collateralInfo?.symbol || 'USDC'})`}
                </label>
                {action === 'sell' && userTokenBalances && (
                  <button
                    type="button"
                    onClick={() => {
                      const balance =
                        side === 'yes'
                          ? userTokenBalances.yesBalance
                          : userTokenBalances.noBalance
                      setAmount(balance.toString())
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Max:{' '}
                    {(side === 'yes'
                      ? userTokenBalances.yesBalance
                      : userTokenBalances.noBalance
                    ).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1"
                min="0.01"
                step="0.01"
                className="input w-full"
                disabled={isLoading}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !isConnected}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                action === 'buy' || marketInfo.version === 3
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading
                ? 'Processing...'
                : `${marketInfo.version === 3 ? 'Buy' : action === 'buy' ? 'Buy' : 'Sell'} ${side.toUpperCase()}`}
            </button>
          </form>
        )}

        {/* Transaction Result */}
        {txSignature && (
          <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-green-400 text-sm mb-2">
              Transaction successful!
            </p>
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
    </div>
  )
}

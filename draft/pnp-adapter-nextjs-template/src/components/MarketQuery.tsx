"use client";

import { useState, useEffect } from "react";
import { useMarketData, useBirdeye, getKnownToken, type TokenInfo } from "@/hooks";

export function MarketQuery() {
  const [marketAddress, setMarketAddress] = useState("");
  const [queryAddress, setQueryAddress] = useState<string | null>(null);
  const [collateralInfo, setCollateralInfo] = useState<TokenInfo | null>(null);

  const { data, isLoading, error, refetch } = useMarketData(queryAddress);
  const { getTokenInfo } = useBirdeye();

  // Fetch collateral token info when market data loads
  useEffect(() => {
    async function fetchCollateralInfo() {
      if (!data?.marketAccount) return;

      const collateralToken = (data.marketAccount as any).collateralToken?.toString();
      if (!collateralToken) return;

      // Try known tokens first
      const known = getKnownToken(collateralToken);
      if (known) {
        setCollateralInfo(known);
        return;
      }

      // Fetch from Birdeye
      const info = await getTokenInfo(collateralToken);
      if (info) {
        setCollateralInfo(info);
      }
    }

    fetchCollateralInfo();
  }, [data, getTokenInfo]);

  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (marketAddress.trim()) {
      setQueryAddress(marketAddress.trim());
      setCollateralInfo(null);
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Query Market Data</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Enter a market address to fetch its data using the SDK.
      </p>

      <form onSubmit={handleQuery} className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Market Address
          </label>
          <input
            type="text"
            value={marketAddress}
            onChange={(e) => setMarketAddress(e.target.value)}
            placeholder="Enter market PDA address..."
            className="input w-full font-mono text-sm"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Query Market
        </button>
      </form>

      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-zinc-400 mt-2">Loading market data...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-red-400 text-sm">
            Error: {(error as Error).message || "Failed to fetch market data"}
          </p>
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800 p-4 rounded-lg">
              <p className="text-zinc-400 text-sm mb-1">Market Version</p>
              <p className="text-xl font-bold">V{data.version}</p>
            </div>
            <div className="bg-zinc-800 p-4 rounded-lg">
              <p className="text-zinc-400 text-sm mb-1">Total Reserves</p>
              <p className="text-xl font-bold">
                {data.marketReserves?.toFixed(2)} {collateralInfo?.symbol || ""}
              </p>
            </div>
          </div>

          {/* Collateral Token Info */}
          {collateralInfo && (
            <div className="flex items-center gap-3 p-4 bg-zinc-800 rounded-lg">
              {collateralInfo.logoURI && (
                <img
                  src={collateralInfo.logoURI}
                  alt={collateralInfo.symbol}
                  className="w-10 h-10 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="flex-1">
                <p className="font-medium">{collateralInfo.symbol}</p>
                <p className="text-zinc-400 text-sm">{collateralInfo.name}</p>
              </div>
              {collateralInfo.price && (
                <div className="text-right">
                  <p className="font-medium">${collateralInfo.price.toFixed(4)}</p>
                  <p className="text-zinc-400 text-xs">Current Price</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-800 p-4 rounded-lg">
              <p className="text-green-400 text-sm mb-1">YES Price</p>
              <p className="text-2xl font-bold text-green-400">
                {(data.yesPrice * 100).toFixed(1)}%
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                Supply: {data.yesTokenSupply?.toFixed(2)}
              </p>
            </div>
            <div className="bg-red-900/20 border border-red-800 p-4 rounded-lg">
              <p className="text-red-400 text-sm mb-1">NO Price</p>
              <p className="text-2xl font-bold text-red-400">
                {(data.noPrice * 100).toFixed(1)}%
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                Supply: {data.noTokenSupply?.toFixed(2)}
              </p>
            </div>
          </div>

          {data.endTime && (
            <div className="bg-zinc-800 p-4 rounded-lg">
              <p className="text-zinc-400 text-sm mb-1">End Time</p>
              <p className="font-medium">
                {new Date(data.endTime * 1000).toLocaleString()}
              </p>
            </div>
          )}

          <button onClick={() => refetch()} className="btn-primary w-full">
            Refresh Data
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";

const BIRDEYE_API_URL = "https://public-api.birdeye.so";

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  price?: number;
}

export function useBirdeye() {
  const [isLoading, setIsLoading] = useState(false);

  const getTokenInfo = useCallback(async (mintAddress: string): Promise<TokenInfo | null> => {
    const apiKey = process.env.NEXT_PUBLIC_BIRDEYE_API_KEY;
    if (!apiKey) {
      console.warn("NEXT_PUBLIC_BIRDEYE_API_KEY not set");
      return null;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${BIRDEYE_API_URL}/defi/token_overview?address=${mintAddress}`,
        {
          headers: {
            "X-API-KEY": apiKey,
            "x-chain": "solana",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.data) {
        return null;
      }

      return {
        address: mintAddress,
        symbol: data.data.symbol || "Unknown",
        name: data.data.name || "Unknown Token",
        decimals: data.data.decimals || 6,
        logoURI: data.data.logoURI || data.data.logo,
        price: data.data.price,
      };
    } catch (error) {
      console.error("Failed to fetch token info from Birdeye:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getMultipleTokenInfo = useCallback(
    async (mintAddresses: string[]): Promise<Map<string, TokenInfo>> => {
      const results = new Map<string, TokenInfo>();
      
      // Fetch in parallel
      const promises = mintAddresses.map(async (address) => {
        const info = await getTokenInfo(address);
        if (info) {
          results.set(address, info);
        }
      });

      await Promise.all(promises);
      return results;
    },
    [getTokenInfo]
  );

  return {
    getTokenInfo,
    getMultipleTokenInfo,
    isLoading,
  };
}

// Known tokens for fallback
export const KNOWN_TOKENS: Record<string, Omit<TokenInfo, "address">> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
  },
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
};

export function getKnownToken(address: string): TokenInfo | null {
  const known = KNOWN_TOKENS[address];
  if (known) {
    return { address, ...known };
  }
  return null;
}

"use client";

import { useSolanaWallet, useBalance } from "@/hooks";

export function WalletInfo() {
  const { address, walletType } = useSolanaWallet();
  const { data: balance, isLoading } = useBalance();

  if (!address) return null;

  // Format wallet type for display
  const getWalletLabel = (type: string | null) => {
    if (!type) return "Unknown";
    if (type === "privy") return "Privy Embedded";
    // Capitalize first letter
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-zinc-400">Connected Wallet</p>
            <span className="px-2 py-0.5 text-xs bg-zinc-700 rounded-full">
              {getWalletLabel(walletType)}
            </span>
          </div>
          <p className="font-mono text-sm">
            {address.slice(0, 4)}...{address.slice(-4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-400 mb-1">USDC Balance</p>
          <p className="text-lg font-bold">
            {isLoading ? "..." : `${balance?.toFixed(2) ?? "0.00"} USDC`}
          </p>
        </div>
      </div>
    </div>
  );
}

'use client'

import { useMutation } from '@tanstack/react-query'

interface FundRequest {
  address: string
}

interface FundResponse {
  success: boolean
  signature: string
  amount: number
  recipient: string
  explorerUrl: string
}

interface FundError {
  error: string
}

async function fundWallet({ address }: FundRequest): Promise<FundResponse> {
  const response = await fetch('/api/fund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  })

  if (!response.ok) {
    const error: FundError = await response.json()
    throw new Error(error.error || 'Failed to fund wallet')
  }

  return response.json()
}

export function useFund() {
  return useMutation({
    mutationFn: fundWallet,
  })
}

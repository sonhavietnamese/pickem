'use client'

import { useStreamer } from '@/hooks/use-streamer'
import { use } from 'react'

interface PageProps {
  params: Promise<{
    username: string
  }>
}

export default function Page({ params }: PageProps) {
  const { username } = use(params)
  const { getByUsername } = useStreamer({ username })

  // Loading state
  if (getByUsername.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    )
  }

  // Error state
  if (getByUsername.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">
          Error: {getByUsername.error?.message || 'Failed to load streamer'}
        </div>
      </div>
    )
  }

  // Check if streamer was found
  const streamer = getByUsername.data?.success
    ? Array.isArray(getByUsername.data.result)
      ? getByUsername.data.result[0]
      : getByUsername.data.result
    : null

  // Not found state
  if (!getByUsername.data?.success || !streamer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Not found</div>
      </div>
    )
  }

  // Found - show username
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-2xl font-bold">{streamer.username}</div>
    </div>
  )
}

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { env } from '@/env'

export interface StreamerDto {
  /** ID of the user */
  id: number
  /** Name of the user */
  username: string
}

export interface CreateStreamerDto {
  /** Name of the user */
  username: string
  /** Wallet of the user */
  wallet: string
}

export interface UpdateStreamerDto {
  /** Name of the user */
  username?: string
  /** Wallet of the user */
  wallet?: string
}

export interface Response {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** The result of the request */
  result?: string | number
}

export interface Paginated {
  /** Total number of results */
  count: number
  /** Number of results per page */
  pageSize: number
  /** Total number of pages */
  totalPages: number
  /** Current page number */
  current: number
}

export interface StreamerResponse {
  /** Indicates if the request was successful */
  success: boolean
  /** Error message if the request was not successful */
  message?: string
  /** Streamer data */
  result?: StreamerDto | StreamerDto[]
  /** Pagination data */
  pagination?: Paginated
}

interface GetStreamersParams {
  page?: number
  limit?: number
}

const API_BASE_URL = env.NEXT_PUBLIC_API_URL

// Query keys
export const streamerKeys = {
  all: ['streamers'] as const,
  lists: () => [...streamerKeys.all, 'list'] as const,
  list: (params?: GetStreamersParams) =>
    [...streamerKeys.lists(), params] as const,
  details: () => [...streamerKeys.all, 'detail'] as const,
  detail: (id: number) => [...streamerKeys.details(), id] as const,
  byUsername: () => [...streamerKeys.all, 'username'] as const,
  username: (username: string) =>
    [...streamerKeys.byUsername(), username] as const,
}

// API functions
async function getStreamers(
  params?: GetStreamersParams
): Promise<StreamerResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', params.page.toString())
  if (params?.limit) searchParams.set('limit', params.limit.toString())

  const url = `${API_BASE_URL}/streamers${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch streamers' }))
    throw new Error(error.message || 'Failed to fetch streamers')
  }

  return response.json()
}

async function getStreamerById(id: number): Promise<StreamerResponse> {
  const response = await fetch(`${API_BASE_URL}/streamers/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch streamer' }))
    throw new Error(error.message || 'Failed to fetch streamer')
  }

  return response.json()
}

async function getStreamerByUsername(
  username: string
): Promise<StreamerResponse> {
  const response = await fetch(
    `${API_BASE_URL}/streamers/username/${encodeURIComponent(username)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch streamer' }))
    throw new Error(error.message || 'Failed to fetch streamer')
  }

  return response.json()
}

async function createStreamer(
  data: CreateStreamerDto
): Promise<StreamerResponse> {
  const response = await fetch(`${API_BASE_URL}/streamers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to create streamer' }))
    throw new Error(error.message || 'Failed to create streamer')
  }

  return response.json()
}

async function updateStreamer({
  id,
  data,
}: {
  id: number
  data: UpdateStreamerDto
}): Promise<StreamerResponse> {
  const response = await fetch(`${API_BASE_URL}/streamers/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to update streamer' }))
    throw new Error(error.message || 'Failed to update streamer')
  }

  return response.json()
}

async function deleteStreamer(
  id: number
): Promise<{ success: boolean; message?: string }> {
  const response = await fetch(`${API_BASE_URL}/streamers/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to delete streamer' }))
    throw new Error(error.message || 'Failed to delete streamer')
  }

  return response.json()
}

// Hook options
interface UseStreamerOptions {
  /** Fetch all streamers with these params */
  listParams?: GetStreamersParams
  /** Fetch a specific streamer by ID */
  id?: number | null | undefined
  /** Fetch a specific streamer by username */
  username?: string | null | undefined
}

// Main hook
export function useStreamer(options?: UseStreamerOptions) {
  const queryClient = useQueryClient()

  // Query for list of streamers (enabled by default or when listParams provided)
  const listQuery = useQuery({
    queryKey: streamerKeys.list(options?.listParams),
    queryFn: () => getStreamers(options?.listParams),
    enabled: options?.id === undefined && options?.username === undefined,
  })

  // Query for single streamer by ID (enabled when id is provided)
  const streamerId = options?.id
  const getQuery = useQuery({
    queryKey: streamerKeys.detail(streamerId ?? -1),
    queryFn: () => {
      if (!streamerId) {
        throw new Error('Streamer ID is required')
      }
      return getStreamerById(streamerId)
    },
    enabled: !!streamerId && options?.username === undefined,
  })

  // Query for single streamer by username (enabled when username is provided)
  const streamerUsername = options?.username
  const getByUsernameQuery = useQuery({
    queryKey: streamerKeys.username(streamerUsername ?? ''),
    queryFn: () => {
      if (!streamerUsername) {
        throw new Error('Streamer username is required')
      }
      return getStreamerByUsername(streamerUsername)
    },
    enabled: !!streamerUsername && options?.id === undefined,
  })

  // Create mutation
  const create = useMutation({
    mutationFn: createStreamer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: streamerKeys.lists() })
    },
  })

  // Update mutation
  const update = useMutation({
    mutationFn: updateStreamer,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: streamerKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: streamerKeys.lists() })
    },
  })

  // Delete mutation
  const remove = useMutation({
    mutationFn: deleteStreamer,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: streamerKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: streamerKeys.lists() })
    },
  })

  return {
    // Query results
    list: listQuery,
    get: getQuery,
    getByUsername: getByUsernameQuery,
    // Mutations
    create,
    update,
    delete: remove,
  }
}

import { api, APIError } from 'encore.dev/api'
import { CreateStreamerDto, Response, StreamerResponse, UpdateStreamerDto } from './streamer.interface'
import StreamerService from './streamer.service'

/**
 * Counts and returns the number of existing users
 */
export const count = api({ expose: true, method: 'GET', path: '/count/streamers' }, async (): Promise<Response> => {
  try {
    const result = await StreamerService.count()
    return { success: true, result }
  } catch (error) {
    throw APIError.aborted(error?.toString() || 'Error counting existing users')
  }
})

/**
 * Method to create a new user
 */
export const create = api(
  { expose: true, method: 'POST', path: '/streamers' },
  async (data: CreateStreamerDto): Promise<StreamerResponse> => {
    try {
      if (!data.username) {
        throw APIError.invalidArgument('Missing fields')
      }
      const result = await StreamerService.create(data)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error creating the user')
    }
  }
)

/**
 * Get all users data
 */
export const read = api(
  { expose: true, method: 'GET', path: '/streamers' },
  async ({ page, limit }: { page?: number; limit?: number }): Promise<StreamerResponse> => {
    try {
      const result = await StreamerService.find(page, limit)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error getting users data')
    }
  }
)

/**
 * Get user data by id
 */
export const readOne = api(
  { expose: true, method: 'GET', path: '/streamers/:id' },
  async ({ id }: { id: number }): Promise<StreamerResponse> => {
    try {
      const result = await StreamerService.findOne(id)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error getting user data')
    }
  }
)

/**
 * Get user data by username
 */
export const readByUsername = api(
  { expose: true, method: 'GET', path: '/streamers/username/:username' },
  async ({ username }: { username: string }): Promise<StreamerResponse> => {
    try {
      if (!username) {
        throw APIError.invalidArgument('Username is required')
      }
      const result = await StreamerService.findByUsername(username)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error getting user data')
    }
  }
)

/**
 * Update user data
 */
export const update = api(
  { expose: true, method: 'PATCH', path: '/streamers/:id' },
  async ({ id, data }: { id: number; data: UpdateStreamerDto }): Promise<StreamerResponse> => {
    try {
      const result = await StreamerService.update(id, data)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error updating user')
    }
  }
)

/**
 * Delete user by id
 */
export const destroy = api(
  { expose: true, method: 'DELETE', path: '/streamers/:id' },
  async ({ id }: { id: number }): Promise<Response> => {
    try {
      const result = await StreamerService.delete(id)
      return result
    } catch (error) {
      throw APIError.aborted(error?.toString() || 'Error deleting user')
    }
  }
)

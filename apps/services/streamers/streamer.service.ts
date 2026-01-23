import { asc, eq, ilike } from 'drizzle-orm'
import { db } from './database'
import { streamers } from './schema'
import { CreateStreamerDto, Response, StreamerResponse, UpdateStreamerDto } from './streamer.interface'
import { getOffset, paginatedData } from './utils'

const StreamerService = {
  count: async (): Promise<number> => {
    return db.$count(streamers)
  },

  create: async (data: CreateStreamerDto): Promise<StreamerResponse> => {
    // Check if streamer with username already exists
    const [existingStreamer] = await db
      .select()
      .from(streamers)
      .where(ilike(streamers.username, data.username))
      .limit(1)
    
    if (existingStreamer) {
      return {
        success: false,
        message: 'Streamer with this username already exists',
      }
    }

    const [user] = await db.insert(streamers).values(data).returning()
    return {
      success: true,
      result: user,
    }
  },

  update: async (id: number, data: UpdateStreamerDto): Promise<StreamerResponse> => {
    const [updateUser] = await db.update(streamers).set(data).where(eq(streamers.id, id)).returning()
    if (!updateUser) {
      return {
        success: false,
        message: 'User not found',
      }
    }
    return {
      success: true,
      result: updateUser,
    }
  },

  find: async (page?: number, limit?: number): Promise<StreamerResponse> => {
    let pagination: any = undefined
    let result: any[] = []
    if (page && limit) {
      const offset = getOffset(page, limit)
      result = await db
        .select()
        .from(streamers)
        .orderBy(asc(streamers.id)) // order by is mandatory
        .limit(limit) // the number of rows to return
        .offset(offset)
      const total = await db.$count(streamers)
      pagination = paginatedData({ size: limit, page, count: total })
    } else {
      result = await db.select().from(streamers)
    }
    return {
      success: true,
      result,
      pagination,
    }
  },

  findOne: async (id: number): Promise<StreamerResponse> => {
    const [user] = await db.select().from(streamers).where(eq(streamers.id, id)).limit(1)
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      }
    }
    return {
      success: true,
      result: user,
    }
  },

  findByUsername: async (username: string): Promise<StreamerResponse> => {
    const [user] = await db.select().from(streamers).where(ilike(streamers.username, username)).limit(1)
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      }
    }
    return {
      success: true,
      result: user,
    }
  },

  delete: async (id: number): Promise<Response> => {
    const user = await db.delete(streamers).where(eq(streamers.id, id)).returning()
    if (!user) {
      return {
        success: false,
        message: 'User not found',
      }
    }
    return {
      success: true,
      result: 'User deleted successfully',
    }
  },
}

export default StreamerService

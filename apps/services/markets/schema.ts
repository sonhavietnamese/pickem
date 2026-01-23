import * as p from 'drizzle-orm/pg-core'

export const markets = p.pgTable('markets', {
  id: p.serial().primaryKey(),
  streamer: p.text().notNull(),
  market: p.text().notNull(),
})

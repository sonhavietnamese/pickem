import * as p from 'drizzle-orm/pg-core'

export const streamers = p.pgTable('streamers', {
  id: p.serial().primaryKey(),
  username: p.text().notNull(),
  wallet: p.text().notNull(),
})

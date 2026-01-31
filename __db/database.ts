import { CamelCasePlugin, ParseJSONResultsPlugin } from 'kysely'

import { Database } from './types' // this is the Database interface we defined earlier
import pg from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
// import { SerializePlugin } from 'kysely-plugin-serialize'

const dialect = new PostgresDialect({
  pool: new pg.Pool({
    database: 'golf-league',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    max: 10,
  })
})

// Database interface is passed to Kysely's constructor, and from now on, Kysely 
// knows your database structure.
// Dialect is passed to Kysely's constructor, and from now on, Kysely knows how 
// to communicate with your database.
export const db = new Kysely<Database>({
  dialect,
  plugins: [
    new CamelCasePlugin(),
    // new SerializePlugin(),
    // new ParseJSONResultsPlugin(),
  ]
})
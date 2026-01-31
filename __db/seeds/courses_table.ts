import { Kysely } from "kysely";

const seedData = {
  courses: [
    {
      name: 'Fortress',
      description: 'Frankenmuth golf course',
      location: 'Frankenmuth, MI',
      contact: '989-652-0460',
      type: 'public', 
      holes: 18
    },
    {
      name: 'Apple Mountain',
      description: 'Freeland golf course',
      location: 'Freeland, MI',
      contact: '989-781-6789',
      type: 'public',
      holes: 18
    },
    {
      name: 'County Line',
      description: 'Reese golf course',
      location: 'Reese, MI',
      contact: '989-868-4356',
      type: 'public',
      holes: 9
    }
  ]
}

export async function up(db : Kysely <any> ): Promise < void > {
  await db.schema
  .createTable('courses')
  .addColumn('id', 'serial', (col) => col.primaryKey())
  .addColumn('name', 'varchar', (col) => col.notNull())
  .addColumn('description', 'text')
  .addColumn('location', 'varchar')
  .addColumn('contact', 'varchar')
  .addColumn('type', 'varchar')
  .addColumn('holes', 'integer')
  .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo('now()'))
  .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo('now()'))
  .addColumn('deleted_at', 'timestamp')
  .addColumn('is_deleted', 'boolean', (col) => col.notNull().defaultTo(false))
  .execute()
  
  await db.insertInto('courses').values(seedData.courses).execute()
}

export async function down(db : Kysely<any>): Promise < void > {
  // Migration code
  await db.schema.dropTable('courses').execute()
  await db.schema.dropTable('users').execute()
}
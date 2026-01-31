import { Kysely } from 'kysely'

const seedData = {
  users: [
    {
      email: 'adamkrieger87@gmail.com',
      password: 'password',
      first_name: 'Adam',
      last_name: 'Krieger',
      role: 'admin',
      is_deleted: false,
      metadata: {
        test: 'test'
      }
    },
    {
      email: 'test2@test.com',
      password: 'password',
      first_name: 'Test2',
      last_name: 'User2',
      role: 'user',
      is_deleted: false,
    }
  ],
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
  ],
  course_tees: [
    {
      course_id: 1,
      name: 'Blue',
      distance: 7000,
      par: 72,
      slope: 140,
      rating: 74.5,
      gender: 'M',
      holes: [
        {n: 1, p:4, d: 400, h: 1},
        {n: 2, p:4, d: 323, h: 6},
        {n: 3, p:4, d: 432, h: 3},
        {n: 4, p:3, d: 100, h: 7},
        {n: 5, p:5, d: 600, h: 2},
        {n: 6, p:4, d: 400, h: 5},
        {n: 7, p:4, d: 350, h: 8},
        {n: 8, p:3, d: 200, h: 4},
        {n: 9, p:5, d: 550, h: 9},
        {n: 10, p:4, d: 400, h: 10},
        {n: 11, p:4, d: 323, h: 15},
        {n: 12, p:4, d: 432, h: 12},
        {n: 13, p:3, d: 100, h: 16},
        {n: 14, p:5, d: 600, h: 11},
        {n: 15, p:4, d: 400, h: 14},
        {n: 16, p:4, d: 350, h: 17},
        {n: 17, p:3, d: 200, h: 13},
        {n: 18, p:5, d: 550, h: 18},
      ]
    },
  ]
}

export async function up(db: Kysely<any>): Promise<void> {
  // Migration code
  await db.schema
  .createTable('users')
  .addColumn('id', 'serial', (col) => col.primaryKey())
  .addColumn('email', 'varchar', (col) => col.unique().notNull())
  .addColumn('password', 'varchar', (col) => col.notNull())
  .addColumn('first_name', 'varchar', (col) => col.notNull())
  .addColumn('last_name', 'varchar', (col) => col.notNull())
  .addColumn('role', 'varchar', (col) => col.notNull())
  .addColumn('metadata', 'jsonb')
  .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo('now()'))
  .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo('now()'))
  .addColumn('deleted_at', 'timestamp')
  .addColumn('is_deleted', 'boolean', (col) => col.notNull().defaultTo(false))
  .execute()

  await db.insertInto('users').values(seedData.users).execute()

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

  await db.schema
  .createTable('course_tees')
  .addColumn('id', 'serial', (col) => col.primaryKey())
  .addColumn('course_id', 'integer', (col) => col.notNull())
  .addColumn('name', 'varchar', (col) => col.notNull())
  .addColumn('distance', 'integer', (col) => col.notNull())
  .addColumn('par', 'integer', (col) => col.notNull())
  .addColumn('slope', 'integer', (col) => col.notNull())
  .addColumn('rating', 'numeric', (col) => col.notNull())
  .addColumn('gender', 'varchar')
  .addColumn('holes', 'jsonb')
  .execute()

  const courseTees = seedData.course_tees.map((tee) => {
    return {
      ...tee,
      holes: JSON.stringify(tee.holes)
    }
  })

  await db.insertInto('course_tees').values(courseTees).execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Migration code
  await db.schema.dropTable('users').execute()
  await db.schema.dropTable('courses').execute()
  await db.schema.dropTable('course_tees').execute()
}
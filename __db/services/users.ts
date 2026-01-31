import { db } from '../database';
import { User, NewUser, UpdateUser } from '../types';

class Users {
  static async findById(id: number) {
    return await db.selectFrom('users')
      .where('id','=',id)
      .selectAll()
      .executeTakeFirst();
  }

  static async findByEmail(email: string) {
    return await db.selectFrom('users')
      .where('email','=',email)
      .selectAll()
      .executeTakeFirst();
  }

  static async findByGoogleEmail(email: string) {
    return await db.selectFrom('users')
      .where('email','=',email)
      .selectAll()
      .executeTakeFirst();
  }

  static async findAll(params: Partial<User>) {
    let query = db.selectFrom('users');

    if (params.first_name) {
      query = query.where('first_name','=',params.first_name);
    }

    return await query.selectAll().execute();
  }

  static async create(user: NewUser) {
    return await db.insertInto('users')
      .values(user)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async update(id: number, user: UpdateUser) {
    return await db.updateTable('users')
      .set(user)
      .where('id','=',id)
      .execute();
  }

  static async delete(id: number) {
    return await db.deleteFrom('users')
      .where('id','=',id)
      .returningAll()
      .executeTakeFirst();
  }
}

export default Users;
import { db } from '../../db/database';
import { NewUser, UpdateUser } from '../../db/types';

class TempModel {
  static async findById(id: number) {
    return await db.selectFrom('users').where('id', '=', id).selectAll().executeTakeFirst();
  }
}

export default TempModel;

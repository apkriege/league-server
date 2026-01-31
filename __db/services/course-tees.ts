import { db } from '../database';
import { NewTee, Tee, UpdateTee } from '../types';

class CourseTees {
  static async findById(id: number) {
    return await db.selectFrom('course_tees')
      .where('id','=',id)
      .selectAll()
      .execute();
  }

  static async findByCourseId(courseId: number) {
    return await db.selectFrom('course_tees')
      .where('course_id','=',courseId)
      .orderBy('id')
      .selectAll()
      .execute();
  }

  static async create(tee: NewTee) {
    tee.holes = JSON.stringify(tee.holes);

    return await db.insertInto('course_tees')
      .values(tee)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async update(id: number, tee: UpdateTee) {
    delete tee.id;
    tee.holes = JSON.stringify(tee.holes);

    return await db.updateTable('course_tees')
      .set(tee)
      .where('id','=',id)
      .execute();
  }

  static async delete(id: number) {
    return await db.deleteFrom('course_tees')
      .where('id','=',id)
      .returningAll()
      .executeTakeFirst();
  }
}

export default CourseTees;
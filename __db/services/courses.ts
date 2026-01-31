import { db } from '../database';
import { Course, NewCourse, UpdateCourse } from '../types';

class Courses {
  static async findById(id: number) {
    return await db.selectFrom('courses')
      .where('id','=',id)
      .selectAll()
      .executeTakeFirst();
  }

  static async findAll() {
    let query = db.selectFrom('courses');
    return await query.selectAll().orderBy('name').execute();
  }

  static async findAllWithParams(params: Partial<Course>) {
    let query = db.selectFrom('courses');
  
    if (params.name) {
      query = query.where('name','=',params.name);
    }
  
    return await query.selectAll().execute();
  }

  static async create(course: NewCourse) {
    return await db.insertInto('courses')
      .values(course)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  static async update(id: number, course: UpdateCourse) {
    delete course.id;
  
    return await db.updateTable('courses')
      .set(course)
      .where('id','=',id)
      .returningAll()
      .executeTakeFirst();
  }

  static async delete(id: number) {
    return await db.deleteFrom('courses')
      .where('id','=',id)
      .returningAll()
      .executeTakeFirst();
  }
}

export default Courses;
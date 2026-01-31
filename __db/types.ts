import {
  ColumnType, 
  Generated, 
  Insertable, 
  JSONColumnType, 
  Selectable,
  Updateable
} from 'kysely';

export interface Database {
  users: UsersTable;
  courses: CoursesTable;
  course_tees: CourseTeesTable;
}

export interface UsersTable {
  id: Generated<number>;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
  is_deleted: boolean;
  created_at: ColumnType<Date, string | undefined>;
  updated_at: ColumnType<Date | null>;
  // deleted_at: ColumnType<Date | null>;
  // metadata: JSONColumnType<{
  //   login_at: Date;
  //   login_ip: string;
  // }>;
}

export type User = Selectable<UsersTable>
export type NewUser = Insertable<UsersTable>
export type UpdateUser = Updateable<UsersTable>


// courses_table.ts
export interface CoursesTable {
  id: Generated<number>;
  name: string;
  description: string;
  location: string;
  contact: string;
  type: string;
  holes: number;
  is_deleted: boolean;
  created_at: ColumnType<Date, string | undefined>;
  updated_at: ColumnType<Date | null>;
  deleted_at: ColumnType<Date | null>;
}

export type Course = Selectable<CoursesTable>
export type NewCourse = Insertable<CoursesTable>
export type UpdateCourse = Updateable<CoursesTable>

export interface CourseTeesTable {
  id: Generated<number>;
  course_id: number;
  name: string;
  distance: number;
  par: number;
  slope: number;
  rating: number;
  gender: "M" | "F";
  holes: JSONColumnType<number[]>;
}

export type Tee = Selectable<CourseTeesTable>
export type NewTee = Insertable<CourseTeesTable>
export type UpdateTee = Updateable<CourseTeesTable>



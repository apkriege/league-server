"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../../db/database");
class TempModel {
    static async findById(id) {
        return await database_1.db.selectFrom('users').where('id', '=', id).selectAll().executeTakeFirst();
    }
}
exports.default = TempModel;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const temp_controller_1 = __importDefault(require("./temp.controller"));
const router = express_1.default.Router();
router.get('/', temp_controller_1.default.getTemp);
exports.default = router;

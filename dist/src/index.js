"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("./app/utils/suppress-local-logs");
const app_1 = __importDefault(require("./app"));
const port = Number(process.env.PORT || 3000);
app_1.default.listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({
        level: 'info',
        event: 'server:start',
        port,
        nodeEnv: process.env.NODE_ENV ?? null,
        railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
    }));
});

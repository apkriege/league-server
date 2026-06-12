"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../app")); // Adjust the path to your app file
const vitest_1 = require("vitest");
const newUser = {
    first: 'Saquon',
    last: 'Barkley',
    email: 'saquon@barkely.com',
    password: 'password',
    role: 'user',
};
const updatedUser = {
    first: 'Super',
    last: 'Duper',
    email: 'super@duper.com',
    password: 'password',
    role: 'admin',
    metadata: {
        golfer: 'pretty good',
    },
};
vitest_1.test.skip('GET / should return 200', async () => {
    const response = await (0, supertest_1.default)(app_1.default).get('/');
    (0, vitest_1.expect)(response.status).toBe(200);
});
vitest_1.describe.skip('User API', () => {
    let userId = 0;
    (0, vitest_1.it)('should return all users', async () => {
        const response = await (0, supertest_1.default)(app_1.default).get('/api/users');
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should create a new user', async () => {
        const response = await (0, supertest_1.default)(app_1.default).post('/api/users').send(newUser);
        userId = response.body.id;
        (0, vitest_1.expect)(response.status).toBe(201);
        (0, vitest_1.expect)(response.body).toMatchObject(newUser); // Adjust based on your expected response
    });
    (0, vitest_1.it)('should update a user', async () => {
        const response = await (0, supertest_1.default)(app_1.default).put(`/api/users/${userId}`).send(updatedUser);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toMatchObject(updatedUser); // Adjust based on your expected response
    });
    (0, vitest_1.it)('should delete a user', async () => {
        const response = await (0, supertest_1.default)(app_1.default).delete(`/api/users/${userId}`);
        (0, vitest_1.expect)(response.status).toBe(200);
    });
});

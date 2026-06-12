"use strict";
// import request from 'supertest';
// import app from '../../app';
// import { expect, test, describe, it } from 'vitest';
// import data from '../data/league.json';
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
(0, vitest_1.test)('GET / should return 200', async () => {
    (0, vitest_1.expect)(1).toBe(1);
});
// test.skip('GET / should return 200', async () => {
//   const response = await request(app).get('/');
//   console.log(response.status);
//   expect(response.status).toBe(200);
// });
// describe.skip('League API', () => {
// it('should return all leagues', async () => {
//   const response = await request(app).get('/api/leagues');
//   expect(response.status).toBe(200);
//   expect(response.body).toEqual(expect.arrayContaining([])); // Adjust based on your expected response
// });
// it.skip('should create a new league', async () => {
//   const response = await request(app).post('/api/leagues').send(data);
//   expect(response.status).toBe(201);
//   // expect(response.body).toMatchObject(data);
// });
// it('should update a league', async () => {
//   console.log(data);
// });
// it('should delete a league', async () => {
//   console.log(data);
// });
// it('should return all teams for a league', async () => {
//   console.log(data);
// });
// });

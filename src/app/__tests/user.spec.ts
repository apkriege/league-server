import request from 'supertest';
import app from '../../app'; // Adjust the path to your app file
import { expect, test, describe, it } from 'vitest';

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

test.skip('GET / should return 200', async () => {
  const response = await request(app).get('/');
  expect(response.status).toBe(200);
});

describe.skip('User API', () => {
  let userId: number = 0;

  it('should return all users', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should create a new user', async () => {
    const response = await request(app).post('/api/users').send(newUser);
    userId = response.body.id;

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(newUser); // Adjust based on your expected response
  });

  it('should update a user', async () => {
    const response = await request(app).put(`/api/users/${userId}`).send(updatedUser);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(updatedUser); // Adjust based on your expected response
  });

  it('should delete a user', async () => {
    const response = await request(app).delete(`/api/users/${userId}`);
    expect(response.status).toBe(200);
  });
});

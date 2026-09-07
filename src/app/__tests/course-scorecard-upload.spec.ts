import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { uploadCourseScorecard } from '../middleware/course-scorecard-upload';

const app = express().post('/upload', uploadCourseScorecard, (req, res) => {
  res.status(200).json({ filename: req.file?.originalname, courseName: req.body.courseName });
});

describe('course scorecard upload', () => {
  it('accepts an image with the course request fields', async () => {
    const response = await request(app)
      .post('/upload')
      .field('courseName', 'The Fortress')
      .attach('scorecardImage', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
        filename: 'scorecard.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ filename: 'scorecard.png', courseName: 'The Fortress' });
  });

  it('rejects non-image attachments', async () => {
    const response = await request(app).post('/upload').attach(
      'scorecardImage',
      Buffer.from('not an image'),
      { filename: 'scorecard.txt', contentType: 'text/plain' },
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('JPEG, PNG, or WebP');
  });
});

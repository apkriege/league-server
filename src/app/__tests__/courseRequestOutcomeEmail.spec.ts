import { describe, expect, it } from 'vitest';
import { buildCourseRequestOutcomeEmail } from '../emailTemplates/courseRequest';

describe('course request outcome email', () => {
  it('links the fulfilled course to the requester', () => {
    const previous = process.env.CLIENT_URL;
    process.env.CLIENT_URL = 'https://app.example.com/';
    try {
      const email = buildCourseRequestOutcomeEmail({
        id: 12,
        courseName: 'Fortress',
        status: 'fulfilled',
        resolutionNote: null,
        requester: { firstName: 'Ava', email: 'ava@example.com' },
        fulfilledCourse: { id: 99, name: 'Fortress' },
      });
      expect(email.to).toEqual(['ava@example.com']);
      expect(email.text).toContain('https://app.example.com/courses/99');
      expect(email.idempotencyKey).toBe('course-request-outcome-12');
    } finally {
      if (previous === undefined) delete process.env.CLIENT_URL;
      else process.env.CLIENT_URL = previous;
    }
  });

  it('includes a reason when the course cannot be added', () => {
    const email = buildCourseRequestOutcomeEmail({
      id: 13,
      courseName: 'Unknown',
      status: 'unavailable',
      resolutionNote: 'We could not verify the scorecard.',
      requester: { firstName: 'Ava', email: 'ava@example.com' },
      fulfilledCourse: null,
    });
    expect(email.text).toContain('We could not verify the scorecard.');
  });
});

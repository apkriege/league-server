import { describe, expect, it } from 'vitest';
import {
  COURSE_REQUEST_RECIPIENT,
  buildCourseRequestEmail,
  buildManualCourseRequestEmail,
} from '../emailTemplates/courseRequest';

const requester = {
  id: 44,
  firstName: 'League',
  lastName: 'Admin',
  email: 'admin@example.com',
};

const importedCourse = {
  provider: 'OpenGolfAPI' as const,
  attribution: 'Course data provided by OpenGolfAPI.',
  warnings: [],
  club: {
    name: 'The Fortress Golf Course',
    description: '',
    location: 'Frankenmuth, MI',
    phone: '',
    link: '',
    accessType: 'public' as const,
  },
  course: {
    name: 'The Fortress Golf Course',
    description: '',
    location: 'Frankenmuth, MI',
    phone: '',
    accessType: 'public' as const,
    numHoles: 18,
    par: 72,
    tees: [],
  },
};

describe('course request email templates', () => {
  it('builds a verified-course message for the fixed recipient', () => {
    const message = buildCourseRequestEmail({
      externalId: 'directory-course-12',
      requester,
      importedCourse,
    });

    expect(message).toMatchObject({
      to: [COURSE_REQUEST_RECIPIENT],
      replyTo: 'admin@example.com',
      subject: 'Course request: The Fortress Golf Course — Frankenmuth, MI',
    });
    expect(message.text).toContain('Directory ID: directory-course-12');
    expect(COURSE_REQUEST_RECIPIENT).toBe('support@leaguenightpro.com');
  });

  it('builds a manual request with course name, city, and state', () => {
    const message = buildManualCourseRequestEmail({
      requester,
      courseName: 'Missing Golf Course',
      city: 'Frankenmuth',
      state: 'Michigan',
    });

    expect(message).toMatchObject({
      to: ['support@leaguenightpro.com'],
      replyTo: 'admin@example.com',
      subject: 'Manual course request: Missing Golf Course — Frankenmuth, Michigan',
    });
    expect(message.text).toContain('City: Frankenmuth');
  });
});

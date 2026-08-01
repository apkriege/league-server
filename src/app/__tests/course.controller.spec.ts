import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadCourseMock, sendAppEmailMock } = vi.hoisted(() => ({
  loadCourseMock: vi.fn(),
  sendAppEmailMock: vi.fn(),
}));

const mockPrisma: any = {
  course: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  tee: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
  },
};

mockPrisma.$transaction = vi.fn(async (callback: (transaction: typeof mockPrisma) => unknown) =>
  callback(mockPrisma),
);

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));
vi.mock('../services/courseImport', () => ({
  loadCourseFromDirectory: loadCourseMock,
  searchCourseDirectory: vi.fn(),
}));
vi.mock('../services/email', () => ({
  sendAppEmail: sendAppEmailMock,
  escapeEmailHtml: (value: string) => value,
}));

const buildResponse = () => {
  const response: any = {};
  response.status = vi.fn().mockReturnValue(response);
  response.send = vi.fn().mockReturnValue(response);
  response.json = vi.fn().mockReturnValue(response);
  return response;
};

describe('CourseController tee removal', async () => {
  const CourseController = (await import('../controllers/course')).default;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.course.findUnique.mockResolvedValue({
      id: 12,
      name: 'Test Course',
      tees: [{ id: 101, name: 'Blue' }],
    });
    mockPrisma.tee.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);
    mockPrisma.tee.update.mockResolvedValue({});
    mockPrisma.tee.updateMany.mockResolvedValue({ count: 1 });
    loadCourseMock.mockResolvedValue({
      club: { name: 'Test Club', location: 'Saginaw, MI' },
      course: { name: 'Test Course', location: 'Saginaw, MI' },
    });
    sendAppEmailMock.mockResolvedValue({ status: 'sent', emailId: 'email_123' });
  });

  it('soft-deletes an existing tee omitted from the edited course payload', async () => {
    const request = {
      params: { id: '12' },
      body: {
        clubId: 4,
        name: 'Test Course',
        accessType: 'public',
        numHoles: 18,
        par: 72,
        tees: [
          {
            id: 101,
            name: 'Blue',
            color: 'blue',
            distance: 6500,
            par: 72,
            frontPar: 36,
            backPar: 36,
            slopeMen: 125,
            slopeFrontMen: 125,
            slopeBackMen: 125,
            ratingMen: 71.2,
            ratingFrontMen: 35.4,
            ratingBackMen: 35.8,
            holes: [],
          },
        ],
      },
    } as any;
    const response = buildResponse();

    await CourseController.updateCourse(request, response);

    expect(mockPrisma.tee.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [102] }, courseId: 12, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockPrisma.tee.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: expect.objectContaining({ name: 'Blue', color: 'blue' }),
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('reloads the verified directory course before sending an admin request', async () => {
    const request = {
      body: { externalId: 'directory-course-12' },
      user: {
        id: 44,
        firstName: 'League',
        lastName: 'Admin',
        email: 'admin@example.com',
      },
    } as any;
    const response = buildResponse();

    await CourseController.requestCourse(request, response);

    expect(loadCourseMock).toHaveBeenCalledWith('directory-course-12');
    expect(sendAppEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['adamkrieger87@gmail.com'],
        replyTo: 'admin@example.com',
        subject: 'Course request: Test Course — Saginaw, MI',
        text: expect.stringContaining('Directory ID: directory-course-12'),
      }),
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ message: 'Course request sent.' });
  });

  it('does not report success when course request email is not configured', async () => {
    sendAppEmailMock.mockResolvedValue({
      status: 'skipped',
      reason: 'missing-configuration',
    });
    const response = buildResponse();

    await CourseController.requestCourse(
      {
        body: { externalId: 'directory-course-12' },
        user: {
          id: 44,
          firstName: 'League',
          lastName: 'Admin',
          email: 'admin@example.com',
        },
      } as any,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('sends manually entered course name, city, and state for admin review', async () => {
    const request = {
      body: {
        courseName: 'Missing Golf Course',
        city: 'Frankenmuth',
        state: 'Michigan',
      },
      user: {
        id: 44,
        firstName: 'League',
        lastName: 'Admin',
        email: 'admin@example.com',
      },
    } as any;
    const response = buildResponse();

    await CourseController.requestManualCourse(request, response);

    expect(sendAppEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['adamkrieger87@gmail.com'],
        replyTo: 'admin@example.com',
        subject: 'Manual course request: Missing Golf Course — Frankenmuth, Michigan',
      }),
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ message: 'Manual course request sent.' });
  });

  it('requires all manual course location fields', async () => {
    const response = buildResponse();

    await CourseController.requestManualCourse(
      {
        body: { courseName: 'Missing Golf Course', city: '', state: 'MI' },
        user: {
          id: 44,
          firstName: 'League',
          lastName: 'Admin',
          email: 'admin@example.com',
        },
      } as any,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(sendAppEmailMock).not.toHaveBeenCalled();
  });

  it('logs the Resend provider reason when a manual request fails', async () => {
    sendAppEmailMock.mockResolvedValue({
      status: 'failed',
      reason: 'The sender domain is not verified',
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = buildResponse();

    await CourseController.requestManualCourse(
      {
        body: {
          courseName: 'Missing Golf Course',
          city: 'Frankenmuth',
          state: 'Michigan',
        },
        user: {
          id: 44,
          firstName: 'League',
          lastName: 'Admin',
          email: 'admin@example.com',
        },
      } as any,
      response,
    );

    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Manual course request email failed: The sender domain is not verified',
      }),
    );
    expect(response.status).toHaveBeenCalledWith(502);
    consoleError.mockRestore();
  });
});

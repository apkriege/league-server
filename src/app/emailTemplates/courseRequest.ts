import { escapeEmailHtml, type SendAppEmailInput } from '../services/email';
import type { ImportedCourse } from '../services/courseImport';

export const COURSE_REQUEST_RECIPIENT =
  process.env.SUPPORT_EMAIL || 'support@leaguenightpro.com';

export type RequestingAdmin = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

type CourseRequestEmailInput = {
  externalId: string;
  requester: RequestingAdmin;
  importedCourse: ImportedCourse;
};

type ManualCourseRequestEmailInput = {
  requester: RequestingAdmin;
  courseName: string;
  city: string;
  state: string;
};

const getRequesterName = (requester: RequestingAdmin) =>
  `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || 'Unknown admin';

export const buildCourseRequestEmail = ({
  externalId,
  requester,
  importedCourse,
}: CourseRequestEmailInput): SendAppEmailInput => {
  const requesterName = getRequesterName(requester);
  const { club, course } = importedCourse;
  const location = course.location || club.location || 'Location unavailable';
  const requestedAt = new Date().toISOString();

  return {
    to: [COURSE_REQUEST_RECIPIENT],
    replyTo: requester.email,
    subject: `Course request: ${course.name} — ${location}`,
    text: [
      'A League Night Pro admin verified and requested a course.',
      '',
      `Course: ${course.name}`,
      `Club: ${club.name}`,
      `Location: ${location}`,
      `Layout: ${course.numHoles} holes, par ${course.par}`,
      `Directory ID: ${externalId}`,
      '',
      `Requested by: ${requesterName}`,
      `Requester email: ${requester.email}`,
      `Requester user ID: ${requester.id}`,
      `Requested at: ${requestedAt}`,
      '',
      'Please add this course to League Night Pro.',
    ].join('\n'),
    html: `
      <h2>Course requested</h2>
      <p>A League Night Pro admin verified this directory result and requested that it be added.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><strong>Course</strong></td><td>${escapeEmailHtml(course.name)}</td></tr>
        <tr><td><strong>Club</strong></td><td>${escapeEmailHtml(club.name)}</td></tr>
        <tr><td><strong>Location</strong></td><td>${escapeEmailHtml(location)}</td></tr>
        <tr><td><strong>Layout</strong></td><td>${course.numHoles} holes, par ${course.par}</td></tr>
        <tr><td><strong>Directory ID</strong></td><td>${escapeEmailHtml(externalId)}</td></tr>
        <tr><td><strong>Requested by</strong></td><td>${escapeEmailHtml(requesterName)}</td></tr>
        <tr><td><strong>Requester email</strong></td><td>${escapeEmailHtml(requester.email)}</td></tr>
        <tr><td><strong>Requester user ID</strong></td><td>${requester.id}</td></tr>
        <tr><td><strong>Requested at</strong></td><td>${requestedAt}</td></tr>
      </table>
      <p><strong>Please add this course to League Night Pro.</strong></p>
    `.trim(),
    tags: [{ name: 'category', value: 'course-request' }],
  };
};

export const buildManualCourseRequestEmail = ({
  requester,
  courseName,
  city,
  state,
}: ManualCourseRequestEmailInput): SendAppEmailInput => {
  const requesterName = getRequesterName(requester);
  const location = `${city}, ${state}`;
  const requestedAt = new Date().toISOString();

  return {
    to: [COURSE_REQUEST_RECIPIENT],
    replyTo: requester.email,
    subject: `Manual course request: ${courseName} — ${location}`,
    text: [
      'A League Night Pro admin could not find a course in the directory.',
      'They entered the following information for manual setup:',
      '',
      `Course: ${courseName}`,
      `City: ${city}`,
      `State: ${state}`,
      '',
      `Requested by: ${requesterName}`,
      `Requester email: ${requester.email}`,
      `Requester user ID: ${requester.id}`,
      `Requested at: ${requestedAt}`,
      '',
      'Please research and add this course to League Night Pro manually.',
    ].join('\n'),
    html: `
      <h2>Manual course request</h2>
      <p>An admin could not find this course in the directory and entered it manually.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><strong>Course</strong></td><td>${escapeEmailHtml(courseName)}</td></tr>
        <tr><td><strong>City</strong></td><td>${escapeEmailHtml(city)}</td></tr>
        <tr><td><strong>State</strong></td><td>${escapeEmailHtml(state)}</td></tr>
        <tr><td><strong>Requested by</strong></td><td>${escapeEmailHtml(requesterName)}</td></tr>
        <tr><td><strong>Requester email</strong></td><td>${escapeEmailHtml(requester.email)}</td></tr>
        <tr><td><strong>Requester user ID</strong></td><td>${requester.id}</td></tr>
        <tr><td><strong>Requested at</strong></td><td>${requestedAt}</td></tr>
      </table>
      <p><strong>Please research and add this course to League Night Pro manually.</strong></p>
    `.trim(),
    tags: [{ name: 'category', value: 'manual-course-request' }],
  };
};

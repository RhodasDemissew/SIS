/** End-user copy only — never surface API or technical details in the UI. */

export const MSG = {
  AUTH_MISSING_FIELDS: 'Please enter your username and password.',
  AUTH_SIGN_IN_FAILED:
    "We couldn't sign you in. Check your username and password and try again.",
  AUTH_UNAVAILABLE: "Sign-in isn't available right now. Please try again later.",
  AUTH_UNEXPECTED: 'Something went wrong. Please try again.',

  PERMISSION_DENIED: "You don't have permission to do that.",

  GENERIC_RETRY: 'Something went wrong. Please try again.',

  LOAD_DASHBOARD: "We couldn't load dashboard information. Please try again.",
  LOAD_DASHBOARD_REFRESH: "Couldn't refresh dashboard data. Please try again.",
  REFRESH_STUDENTS_SUCCESS: 'Student list updated.',
  LOAD_STUDENTS_REFRESH: "Couldn't refresh the student list. Please try again.",

  CONNECTION_CHECKING: 'Checking connection…',
  CONNECTION_OK: 'Connected.',
  CONNECTION_UNAVAILABLE: 'Unable to connect right now. Please try again later.',

  LOAD_CATEGORIES: "We couldn't load grade levels right now. Please try again.",
  LOAD_COURSES_GRADE: "We couldn't load courses for this grade level. Please try again.",
  LOAD_COURSES_CATEGORY: "We couldn't load courses for this category. Please try again.",
  LOAD_COURSE_STUDENTS: "We couldn't load students for this course. Please try again.",
  LOAD_DETAILED_GRADES: "We couldn't load detailed grades. Please try again.",
  LOAD_GRADE_OVERVIEW: "We couldn't load your grade overview right now. Please try again.",
  LOAD_MY_GRADES_PARTIAL:
    "We couldn't load your grades right now. You can still browse categories.",
  LOAD_STUDENTS: "We couldn't load students right now. Please try again.",

  FETCH_GRADES_SUCCESS: 'Grades fetched successfully.',
  FETCH_GRADES_FAILED: "We couldn't fetch grades. Please try again.",

  EMPTY_NO_STUDENTS_COURSE: 'No enrolled students found for this course.',
  EMPTY_NO_STUDENTS_FOUND: 'No students found.',
  EMPTY_NO_SEARCH_MATCH: 'No students match your search.',

  VALIDATION_PICK_GRADE: 'Pick a grade level first.',
  VALIDATION_SELECT_COURSE: 'Select a course to see enrolled students.',

  STUDENT_ACCOUNT_FALLBACK: 'Student account',

  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
};

export function messageForHttpStatus(status) {
  if (status === 401) return MSG.SESSION_EXPIRED;
  if (status === 403) return MSG.PERMISSION_DENIED;
  return MSG.GENERIC_RETRY;
}

export function messageForContext(key) {
  return MSG[key] ?? MSG.GENERIC_RETRY;
}

/** Always returns catalog text; API bodies are ignored. */
export function safeUserMessage(_ignoredApiText, key) {
  return messageForContext(key);
}

export function loginMessageForStatus(status) {
  if (status === 401 || status === 422) return MSG.AUTH_SIGN_IN_FAILED;
  if (status >= 500) return MSG.AUTH_UNAVAILABLE;
  if (status >= 400) return MSG.AUTH_SIGN_IN_FAILED;
  return MSG.AUTH_UNAVAILABLE;
}

export function connectionCheckingMessage(lmsName) {
  const site = lmsName?.trim() || 'your learning site';
  return `Checking connection to ${site}…`;
}

export function connectionOkMessage(lmsName) {
  const site = lmsName?.trim() || 'your learning site';
  return `Connection to ${site} is up.`;
}

export function connectionUnavailableMessage(lmsName) {
  const site = lmsName?.trim() || 'your learning site';
  return `Connection to ${site} is unavailable right now. Please try again later.`;
}

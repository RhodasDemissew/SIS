<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\StudentGrade;
use App\Services\MoodleService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class MoodleController extends Controller
{
    public function __construct(
        protected MoodleService $moodle
    ) {}

    private function moodleCacheKey(string $suffix): string
    {
        $tenant = (string) request()->attributes->get('sis_tenant', 'ecamel');

        return "moodle:{$tenant}:{$suffix}";
    }

    private function activeRole(Request $request): string
    {
        $requested = (string) $request->header('X-SIS-ROLE', 'admin');
        $requested = trim(strtolower($requested));
        $user = $request->user();
        if (! $user) {
            return 'admin';
        }
        return $user->hasRole($requested) ? $requested : $user->roleList()[0];
    }

    private function forbidIfStudent(Request $request): ?JsonResponse
    {
        if ($this->activeRole($request) === 'student') {
            return response()->json(['message' => 'Forbidden for student role'], 403);
        }
        return null;
    }

    private function canForceRefresh(Request $request): bool
    {
        return $request->boolean('refresh', false) && $this->activeRole($request) !== 'student';
    }

    /**
     * One cached scan of categories, courses, and enrolments (shared by dashboard + student picker).
     *
     * @return array{
     *   students: array<int, array{id: int, fullname: string, email: string, username: string}>,
     *   total_categories: int,
     *   total_courses: int,
     *   total_students: int,
     *   students_per_category: array<int, array{category_id: int, category_name: string, student_count: int}>,
     *   cached_at: string
     * }|null
     */
    private function forgetSiteCaches(): void
    {
        Cache::forget($this->moodleCacheKey('site_structure'));
        Cache::forget($this->moodleCacheKey('site_enrolment_data'));
        Cache::forget($this->moodleCacheKey('site_students'));
        Cache::forget($this->moodleCacheKey('overview_metrics'));
    }

    /**
     * Fast path: categories + course counts only (no per-course enrolment scan).
     *
     * @return array{
     *   categories: array<int, array{id: int, name: string}>,
     *   course_to_category: array<int, int>,
     *   total_categories: int,
     *   total_courses: int,
     *   cached_at: string
     * }|null
     */
    private function rememberSiteStructureData(bool $forceRefresh = false): ?array
    {
        $cacheKey = $this->moodleCacheKey('site_structure');

        if ($forceRefresh) {
            $this->forgetSiteCaches();
        }

        return Cache::remember($cacheKey, now()->addMinutes(30), function () {
            $cats = $this->moodle->getCourseCategories();
            if ($cats === null) {
                return null;
            }

            $categories = [];
            foreach ($cats as $c) {
                if (! is_array($c) || ! isset($c['id'])) {
                    continue;
                }
                $categories[] = [
                    'id' => (int) $c['id'],
                    'name' => (string) ($c['name'] ?? ''),
                ];
            }

            $categoryIds = array_column($categories, 'id');
            $coursesByCategory = $this->moodle->getCoursesByCategories($categoryIds);

            $totalCourses = 0;
            $courseToCategory = [];
            foreach ($categoryIds as $cid) {
                $courses = $coursesByCategory[$cid] ?? null;
                if (! is_array($courses)) {
                    continue;
                }
                $totalCourses += count($courses);
                foreach ($courses as $course) {
                    if (! isset($course['id'])) {
                        continue;
                    }
                    $courseToCategory[(int) $course['id']] = $cid;
                }
            }

            return [
                'categories' => $categories,
                'course_to_category' => $courseToCategory,
                'total_categories' => count($categories),
                'total_courses' => $totalCourses,
                'cached_at' => now()->toIso8601String(),
            ];
        });
    }

    private function rememberSiteEnrolmentData(bool $forceRefresh = false): ?array
    {
        $cacheKey = $this->moodleCacheKey('site_enrolment_data');

        if ($forceRefresh) {
            $this->forgetSiteCaches();
        }

        return Cache::remember($cacheKey, now()->addMinutes(30), function () {
            $structure = $this->rememberSiteStructureData(false);
            if ($structure === null) {
                return null;
            }

            $categories = $structure['categories'];
            $courseToCategory = $structure['course_to_category'];
            $courseIds = array_keys($courseToCategory);
            $enrolledByCourse = $this->moodle->getEnrolledUsersForCourses($courseIds);

            $usersById = [];
            $studentsPerCategory = [];
            foreach ($courseIds as $courseId) {
                $cid = $courseToCategory[$courseId] ?? null;
                if (! $cid) {
                    continue;
                }
                $users = $enrolledByCourse[$courseId] ?? null;
                if (! is_array($users)) {
                    continue;
                }
                foreach ($users as $u) {
                    if (! is_array($u) || ! isset($u['id'])) {
                        continue;
                    }
                    $uid = (int) $u['id'];
                    $studentsPerCategory[$cid][$uid] = true;

                    if (isset($usersById[$uid])) {
                        continue;
                    }
                    $fullname = trim((string) (($u['fullname'] ?? '') ?: (($u['firstname'] ?? '').' '.($u['lastname'] ?? ''))));
                    $usersById[$uid] = [
                        'id' => $uid,
                        'fullname' => $fullname !== '' ? $fullname : ('User '.$uid),
                        'email' => (string) ($u['email'] ?? ''),
                        'username' => (string) ($u['username'] ?? ''),
                    ];
                }
            }

            $students = array_values($usersById);
            usort($students, function (array $a, array $b) {
                return strcasecmp($a['fullname'] ?? '', $b['fullname'] ?? '');
            });

            $studentBuckets = [];
            foreach ($categories as $cat) {
                $cid = $cat['id'];
                $studentBuckets[] = [
                    'category_id' => $cid,
                    'category_name' => $cat['name'],
                    'student_count' => isset($studentsPerCategory[$cid])
                        ? count($studentsPerCategory[$cid])
                        : 0,
                ];
            }

            return [
                'students' => $students,
                'total_categories' => $structure['total_categories'],
                'total_courses' => $structure['total_courses'],
                'total_students' => count($usersById),
                'students_per_category' => $studentBuckets,
                'cached_at' => now()->toIso8601String(),
            ];
        });
    }

    /**
     * Link a student to Moodle by email (set moodle_user_id).
     */
    public function linkStudent(string $id): JsonResponse
    {
        $student = Student::find($id);

        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $moodleUserId = $this->moodle->getMoodleUserIdByEmail($student->email);

        if ($moodleUserId === null) {
            return response()->json([
                'message' => 'No Moodle user found with this email',
                'email' => $student->email,
            ], 404);
        }

        $student->update(['moodle_user_id' => $moodleUserId]);

        return response()->json([
            'message' => 'Student linked to Moodle',
            'student_id' => $student->id,
            'moodle_user_id' => $moodleUserId,
        ]);
    }

    /**
     * List Moodle course categories (used as Grade/Level selector).
     */
    public function categories(Request $request): JsonResponse
    {
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $forceRefresh = $request->boolean('refresh', false);
        $cacheKey = $this->moodleCacheKey('categories');
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        $cats = Cache::remember($cacheKey, now()->addSeconds(60), function () {
            return $this->moodle->getCourseCategories();
        });
        if ($cats === null) {
            return response()->json(['message' => 'Could not fetch Moodle categories'], 502);
        }

        // Keep just the useful fields.
        $categories = [];
        foreach ($cats as $c) {
            if (! is_array($c) || ! isset($c['id'])) {
                continue;
            }
            $categories[] = [
                'id' => (int) $c['id'],
                'name' => (string) ($c['name'] ?? ''),
                'parent' => isset($c['parent']) ? (int) $c['parent'] : null,
                'depth' => isset($c['depth']) ? (int) $c['depth'] : null,
            ];
        }

        return response()->json(['categories' => $categories]);
    }

    /**
     * List LMS students based on actual enrolments (deduplicated across all courses).
     */
    public function moodleStudents(Request $request): JsonResponse
    {
        if ($denied = $this->forbidIfStudent($request)) {
            return $denied;
        }
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $forceRefresh = $this->canForceRefresh($request);
        $data = $this->rememberSiteEnrolmentData($forceRefresh);

        if ($data === null) {
            return response()->json(['message' => 'Could not fetch Moodle site students'], 502);
        }

        return response()->json([
            'students' => $data['students'],
            'cached_at' => $data['cached_at'],
        ]);
    }

    /**
     * Simple aggregate metrics for dashboard: total categories and total courses.
     */
    public function overviewMetrics(Request $request): JsonResponse
    {
        if ($denied = $this->forbidIfStudent($request)) {
            return $denied;
        }
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $forceRefresh = $this->canForceRefresh($request);
        $includeStudents = $request->boolean('include_students', true);

        if (! $includeStudents) {
            $structure = $this->rememberSiteStructureData($forceRefresh);
            if ($structure === null) {
                return response()->json(['message' => 'Could not fetch Moodle overview metrics'], 502);
            }

            return response()->json([
                'total_categories' => $structure['total_categories'],
                'total_courses' => $structure['total_courses'],
                'total_students' => null,
                'students_per_category' => [],
                'cached_at' => $structure['cached_at'],
                'partial' => true,
            ]);
        }

        $data = $this->rememberSiteEnrolmentData($forceRefresh);

        if ($data === null) {
            return response()->json(['message' => 'Could not fetch Moodle overview metrics'], 502);
        }

        return response()->json([
            'total_categories' => $data['total_categories'],
            'total_courses' => $data['total_courses'],
            'total_students' => $data['total_students'],
            'students_per_category' => $data['students_per_category'],
            'cached_at' => $data['cached_at'],
            'partial' => false,
        ]);
    }

    /**
     * List Moodle courses inside a category (Grade/Level -> courses).
     */
    public function coursesByCategory(Request $request, string $categoryId): JsonResponse
    {
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $categoryIdInt = (int) $categoryId;
        $forceRefresh = $request->boolean('refresh', false);
        $cacheKey = $this->moodleCacheKey('courses_by_category_'.$categoryIdInt);
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        $courses = Cache::remember($cacheKey, now()->addSeconds(60), function () use ($categoryIdInt) {
            return $this->moodle->getCoursesByCategory($categoryIdInt);
        });
        if ($courses === null) {
            return response()->json(['message' => 'Could not fetch Moodle courses for this category'], 502);
        }

        $out = [];
        foreach ($courses as $course) {
            if (! is_array($course) || ! isset($course['id'])) {
                continue;
            }
            $out[] = [
                'id' => (int) $course['id'],
                'fullname' => (string) ($course['fullname'] ?? ''),
                'shortname' => (string) ($course['shortname'] ?? ''),
                'categoryid' => isset($course['categoryid']) ? (int) $course['categoryid'] : $categoryIdInt,
            ];
        }

        return response()->json(['courses' => $out]);
    }

    /**
     * List enrolled users for a Moodle course, plus course total percentage.
     */
    public function courseStudents(Request $request, string $courseId): JsonResponse
    {
        if ($denied = $this->forbidIfStudent($request)) {
            return $denied;
        }
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $courseIdInt = (int) $courseId;

        $forceRefresh = $this->canForceRefresh($request);

        // Cache the transformed list for a short period to speed up repeated requests.
        $cacheKey = $this->moodleCacheKey('course_students_'.$courseIdInt);

        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        // NOTE: This endpoint can be slow because Moodle grades are fetched per student.
        // We use short TTL + parallel fetching to keep it responsive while staying fresh.
        $payload = Cache::remember($cacheKey, now()->addMinutes(5), function () use ($courseIdInt) {
            $users = $this->moodle->getEnrolledUsers($courseIdInt);
            if ($users === null) {
                return null;
            }

            $rawUsers = [];
            $userIds = [];
            foreach ($users as $u) {
                if (! is_array($u) || ! isset($u['id'])) {
                    continue;
                }
                $uid = (int) $u['id'];
                $rawUsers[$uid] = $u;
                $userIds[] = $uid;
            }

            $tablesByUserId = $this->moodle->getGradesTablesForUsers($courseIdInt, $userIds);

            $students = [];
            foreach ($rawUsers as $moodleUserId => $u) {
                $email = (string) ($u['email'] ?? '');
                $fullname = trim((string) (($u['fullname'] ?? '') ?: (($u['firstname'] ?? '').' '.($u['lastname'] ?? ''))));

                $percentage = null;
                $table = $tablesByUserId[$moodleUserId] ?? null;
                if (is_array($table)) {
                    $percentage = self::extractCourseTotalPercentage($table);
                }

                $students[] = [
                    'moodle_user_id' => (int) $moodleUserId,
                    'fullname' => $fullname !== '' ? $fullname : ('User '.$moodleUserId),
                    'email' => $email,
                    'course_total_percentage' => $percentage,
                ];
            }

            // Sort: highest % first, then name.
            usort($students, function (array $a, array $b) {
                $pa = $a['course_total_percentage'];
                $pb = $b['course_total_percentage'];
                if ($pa === $pb) {
                    return strcmp((string) $a['fullname'], (string) $b['fullname']);
                }
                if ($pa === null) return 1;
                if ($pb === null) return -1;
                return $pb <=> $pa;
            });

            return [
                'course_id' => $courseIdInt,
                'fetched_at' => now()->toIso8601String(),
                'students' => $students,
            ];
        });

        if ($payload === null) {
            return response()->json(['message' => 'Could not fetch enrolled users for this course'], 502);
        }

        return response()->json($payload);
    }

    /**
     * Fetch grades from Moodle for a student, save to DB, return grades.
     */
    public function fetchGrades(string $studentId): JsonResponse
    {
        $student = Student::find($studentId);

        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        // Link by email if not yet linked
        if (empty($student->moodle_user_id)) {
            $moodleUserId = $this->moodle->getMoodleUserIdByEmail($student->email);
            if ($moodleUserId === null) {
                return response()->json([
                    'message' => 'Student not linked to Moodle. No Moodle user found for email: '.$student->email,
                ], 404);
            }
            $student->update(['moodle_user_id' => $moodleUserId]);
            $student->refresh();
        }

        $moodleUserId = (int) $student->moodle_user_id;

        $data = $this->moodle->getCourseGrades($moodleUserId);

        if ($data === null) {
            return response()->json([
                'message' => 'Could not fetch grades from Moodle (check token and user permissions)',
            ], 502);
        }

        $fetchedAt = Carbon::now();
        $saved = [];

        // Build a lookup of course id -> human-readable name from enrolments.
        $courses = $this->moodle->getUserCourses($moodleUserId) ?? [];
        $courseNamesById = [];
        foreach ($courses as $course) {
            if (! isset($course['id'])) {
                continue;
            }
            $courseId = (int) $course['id'];
            $courseNamesById[$courseId] = $course['fullname']
                ?? ($course['shortname'] ?? (string) $courseId);
        }

        // Load existing grades once so we avoid duplicate rows.
        $existingGrades = $student->grades()->get()->keyBy('course_name');

        // gradereport_overview_get_course_grades returns structure like:
        // { "grades": [ { "courseid", "coursefullname", "grade", "rawgrade", ... } ] }
        $gradeItems = $data['grades'] ?? $data['courses'] ?? [];
        if (! is_array($gradeItems)) {
            $gradeItems = [];
        }

        foreach ($gradeItems as $item) {
            $courseId = isset($item['courseid']) ? (int) $item['courseid'] : null;
            $courseName = $item['coursefullname']
                ?? ($courseId !== null && isset($courseNamesById[$courseId]) ? $courseNamesById[$courseId] : null)
                ?? ($item['coursename'] ?? (string) ($courseId ?? 'Course'));
            $grade = isset($item['grade']) ? (float) $item['grade'] : (isset($item['rawgrade']) ? (float) $item['rawgrade'] : null);
            $maxGrade = isset($item['grademax']) ? (float) $item['grademax'] : null;

            $existing = $existingGrades->get($courseName);

            if (! $existing) {
                // New course / grade – create a row.
                $studentGrade = StudentGrade::create([
                    'student_id' => $student->id,
                    'course_name' => $courseName,
                    'grade' => $grade,
                    'fetched_at' => $fetchedAt,
                ]);
                // Track it in the in-memory collection too so future logic can see it.
                $existingGrades->put($courseName, $studentGrade);
            } else {
                // Existing course – only update if the grade value changed.
                if ($existing->grade !== $grade) {
                    $existing->grade = $grade;
                    $existing->fetched_at = $fetchedAt;
                    $existing->save();
                }
                $studentGrade = $existing;
            }

            $saved[] = [
                'course_name' => $studentGrade->course_name,
                'grade' => $studentGrade->grade !== null ? (float) $studentGrade->grade : null,
                'max_grade' => $maxGrade,
                'course_id' => $courseId,
                'fetched_at' => $studentGrade->fetched_at->toIso8601String(),
            ];
        }

        return response()->json([
            'message' => 'Grades fetched from Moodle',
            'student_id' => $student->id,
            'grades' => $saved,
        ]);
    }

    /**
     * Get a read-only "report card" for a Moodle user (all course grades, no SIS linkage).
     */
    public function moodleStudentReport(Request $request, string $moodleUserId): JsonResponse
    {
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $moodleUserIdInt = (int) $moodleUserId;
        if ($this->activeRole($request) === 'student') {
            $currentUser = $request->user();
            if (! $currentUser || (int) ($currentUser->moodle_user_id ?? 0) !== $moodleUserIdInt) {
                return response()->json(['message' => 'Forbidden for student role'], 403);
            }
        }
        $forceRefresh = $this->canForceRefresh($request);
        $cacheKey = $this->moodleCacheKey('student_report_'.$moodleUserIdInt);
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        $payload = Cache::remember($cacheKey, now()->addMinutes(5), function () use ($moodleUserIdInt) {
            $gradesData = $this->moodle->getCourseGrades($moodleUserIdInt);
            if ($gradesData === null) {
                return null;
            }

            $courses = $this->moodle->getUserCourses($moodleUserIdInt) ?? [];
            $courseNamesById = [];
            foreach ($courses as $course) {
                if (! isset($course['id'])) {
                    continue;
                }
                $courseId = (int) $course['id'];
                $courseNamesById[$courseId] = $course['fullname']
                    ?? ($course['shortname'] ?? (string) $courseId);
            }

            $gradeItems = $gradesData['grades'] ?? $gradesData['courses'] ?? [];
            if (! is_array($gradeItems)) {
                $gradeItems = [];
            }

            $courseIds = [];
            foreach ($gradeItems as $item) {
                if (! is_array($item) || ! isset($item['courseid'])) {
                    continue;
                }
                $courseIds[] = (int) $item['courseid'];
            }
            $courseIds = array_values(array_unique($courseIds));

            $tablesByCourse = $this->moodle->getGradesTablesForCourses($moodleUserIdInt, $courseIds);

            $out = [];
            foreach ($gradeItems as $item) {
                if (! is_array($item)) {
                    continue;
                }
                $courseId = isset($item['courseid']) ? (int) $item['courseid'] : null;
                $courseName = $item['coursefullname']
                    ?? ($courseId !== null && isset($courseNamesById[$courseId]) ? $courseNamesById[$courseId] : null)
                    ?? ($item['coursename'] ?? (string) ($courseId ?? 'Course'));
                $grade = isset($item['grade']) ? (float) $item['grade'] : (isset($item['rawgrade']) ? (float) $item['rawgrade'] : null);
                $maxGrade = isset($item['grademax']) ? (float) $item['grademax'] : null;

                $percentage = null;
                if ($courseId !== null && isset($tablesByCourse[$courseId]) && is_array($tablesByCourse[$courseId])) {
                    $percentage = self::extractCourseTotalPercentage($tablesByCourse[$courseId]);
                }

                $out[] = [
                    'course_id' => $courseId,
                    'course_name' => $courseName,
                    'grade' => $grade,
                    'max_grade' => $maxGrade,
                    'course_total_percentage' => $percentage,
                ];
            }

            return [
                'moodle_user_id' => $moodleUserIdInt,
                'grades' => $out,
            ];
        });

        if ($payload === null) {
            return response()->json([
                'message' => 'Could not fetch grades from Moodle (check token and user permissions)',
            ], 502);
        }

        return response()->json($payload);
    }

    /**
     * Get detailed grade items for a single course (like Moodle grade report).
     */
    public function courseDetails(Request $request, string $studentId, string $courseId): JsonResponse
    {
        $student = Student::find($studentId);

        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        if (empty($student->moodle_user_id)) {
            return response()->json(['message' => 'Student is not linked to Moodle'], 400);
        }

        $moodleUserId = (int) $student->moodle_user_id;
        $courseIdInt = (int) $courseId;

        $forceRefresh = $this->canForceRefresh($request);
        $cacheKey = $this->moodleCacheKey('course_details_'.$student->id.'_'.$courseIdInt);
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        $table = Cache::remember($cacheKey, now()->addMinutes(3), function () use ($moodleUserId, $courseIdInt) {
            return $this->moodle->getGradesTable($moodleUserId, $courseIdInt);
        });
        if ($table === null) {
            return response()->json([
                'message' => 'Could not fetch detailed grades from Moodle',
            ], 502);
        }

        $items = self::parseDetailedItemsFromGradesTable($table);

        $response = [
            'course_id' => $courseIdInt,
            'student_id' => $student->id,
            'items' => $items,
        ];

        // When empty, log raw structure (and in debug include keys in response) so we can fix parsing.
        if (count($items) === 0) {
            Log::info('Moodle courseDetails: empty items', [
                'student_id' => $studentId,
                'course_id' => $courseIdInt,
                'top_keys' => array_keys($table),
                'table_sample' => isset($table['tables'][0]) ? array_keys($table['tables'][0]) : null,
                'raw_tabledata_keys' => isset($table['tables'][0]['tabledata']) ? array_keys($table['tables'][0]['tabledata']) : null,
            ]);
            if (config('app.debug')) {
                $response['_debug_keys'] = array_keys($table);
                if (isset($table['tables'][0])) {
                    $response['_debug_table_keys'] = array_keys($table['tables'][0]);
                }
            }
        }

        return response()->json($response);
    }

    /**
     * Get detailed grade items directly by Moodle user id (no SIS admission required).
     */
    public function courseDetailsDirect(Request $request, string $moodleUserId, string $courseId): JsonResponse
    {
        if (! $this->moodle->isConfigured()) {
            return response()->json(['message' => 'Moodle is not configured'], 503);
        }

        $moodleUserIdInt = (int) $moodleUserId;
        if ($this->activeRole($request) === 'student') {
            $currentUser = $request->user();
            if (! $currentUser || (int) ($currentUser->moodle_user_id ?? 0) !== $moodleUserIdInt) {
                return response()->json(['message' => 'Forbidden for student role'], 403);
            }
        }
        $courseIdInt = (int) $courseId;

        if ($moodleUserIdInt <= 0 || $courseIdInt <= 0) {
            return response()->json(['message' => 'Invalid moodleUserId or courseId'], 422);
        }

        $forceRefresh = $this->canForceRefresh($request);
        $cacheKey = $this->moodleCacheKey('course_details_direct_'.$moodleUserIdInt.'_'.$courseIdInt);
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        $table = Cache::remember($cacheKey, now()->addMinutes(3), function () use ($moodleUserIdInt, $courseIdInt) {
            return $this->moodle->getGradesTable($moodleUserIdInt, $courseIdInt);
        });
        if ($table === null) {
            return response()->json([
                'message' => 'Could not fetch detailed grades from Moodle',
            ], 502);
        }

        $items = self::parseDetailedItemsFromGradesTable($table);

        return response()->json([
            'course_id' => $courseIdInt,
            'moodle_user_id' => $moodleUserIdInt,
            'items' => $items,
        ]);
    }

    /**
     * Normalize generic cell text: strip tags, decode HTML entities (like &ndash;), and normalise dashes.
     */
    private static function normalizeCellText(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        $text = trim(strip_tags((string) $value));

        if ($text === '') {
            return '';
        }

        // Decode entities such as &ndash; into their UTF-8 characters.
        $decoded = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        // Normalise various dash characters to a simple ASCII hyphen so "0–10" becomes "0-10".
        $decoded = str_replace(["–", "—"], "-", $decoded);

        return trim($decoded);
    }

    /**
     * Remove Moodle labels like "Grade analysis" from grade text so only the grade value is shown.
     */
    private static function cleanGradeText(string $gradeText): string
    {
        $text = trim($gradeText);
        $text = preg_replace('/\s*Grade\s+analysis\s*/i', ' ', $text);

        return trim($text);
    }

    /**
     * Parse detailed grade rows from gradereport_user_get_grades_table response.
     *
     * @return array<int, array<string, mixed>>
     */
    private static function parseDetailedItemsFromGradesTable(array $table): array
    {
        $items = [];

        // Moodle can return tables[0].tabledata as array of rows OR as object keyed by item id.
        $tabledata = $table['tables'][0]['tabledata'] ?? $table['tabledata'] ?? null;

        if (is_array($tabledata)) {
            foreach ($tabledata as $row) {
                if (! is_array($row)) {
                    continue;
                }

                // Numeric indices (typical Moodle table):
                // [0] item, [1] weight, [2] grade, [3] range, [4] percentage, [5] feedback, [6] contribution
                $cell0 = $row[0] ?? null;
                $cell1 = $row[1] ?? null;
                $cell2 = $row[2] ?? null;
                $cell3 = $row[3] ?? null;
                $cell4 = $row[4] ?? null;
                $cell5 = $row[5] ?? null;
                $cell6 = $row[6] ?? null;

                $nameHtml = is_array($cell0) ? ($cell0['content'] ?? $cell0['text'] ?? '') : (string) $cell0;
                $weightHtml = is_array($cell1) ? ($cell1['content'] ?? $cell1['text'] ?? '') : (string) $cell1;
                $gradeHtml = is_array($cell2) ? ($cell2['content'] ?? $cell2['text'] ?? '') : (string) $cell2;
                $rangeHtml = is_array($cell3) ? ($cell3['content'] ?? $cell3['text'] ?? '') : (string) $cell3;
                $percentageHtml = is_array($cell4) ? ($cell4['content'] ?? $cell4['text'] ?? '') : (string) $cell4;
                $feedbackHtml = is_array($cell5) ? ($cell5['content'] ?? $cell5['text'] ?? '') : (string) $cell5;
                $contribHtml = is_array($cell6) ? ($cell6['content'] ?? $cell6['text'] ?? '') : (string) $cell6;

                // Fallbacks when the row is keyed by names instead of numeric indices.
                if ($nameHtml === '' && isset($row['itemname'])) {
                    $nameHtml = $row['itemname']['content'] ?? $row['itemname']['text'] ?? $row['itemname'] ?? '';
                }
                if ($weightHtml === '' && isset($row['weight'])) {
                    $weightHtml = $row['weight']['content'] ?? $row['weight']['text'] ?? $row['weight'] ?? '';
                }
                if ($gradeHtml === '' && isset($row['grade'])) {
                    $gradeHtml = $row['grade']['content'] ?? $row['grade']['text'] ?? $row['grade'] ?? '';
                }
                if ($rangeHtml === '' && isset($row['range'])) {
                    $rangeHtml = $row['range']['content'] ?? $row['range']['text'] ?? $row['range'] ?? '';
                }
                if ($percentageHtml === '' && isset($row['percentage'])) {
                    $percentageHtml = $row['percentage']['content'] ?? $row['percentage']['text'] ?? $row['percentage'] ?? '';
                }
                if ($feedbackHtml === '' && isset($row['feedback'])) {
                    $feedbackHtml = $row['feedback']['content'] ?? $row['feedback']['text'] ?? $row['feedback'] ?? '';
                }
                if ($contribHtml === '' && isset($row['contributiontocoursetotal'])) {
                    $contribHtml = $row['contributiontocoursetotal']['content']
                        ?? $row['contributiontocoursetotal']['text']
                        ?? $row['contributiontocoursetotal']
                        ?? '';
                }

                $name = self::normalizeCellText($nameHtml);
                $gradeText = self::cleanGradeText(self::normalizeCellText($gradeHtml));
                $weightText = self::normalizeCellText($weightHtml);
                $rangeText = self::normalizeCellText($rangeHtml);
                $percentageText = self::normalizeCellText($percentageHtml);
                $feedbackText = self::normalizeCellText($feedbackHtml);
                $contribText = self::normalizeCellText($contribHtml);

                if ($name === '' || strcasecmp($name, 'Course total') === 0) {
                    continue;
                }

                $items[] = [
                    'item_name' => $name,
                    'grade_text' => $gradeText ?: '—',
                    'weight' => $weightText !== '' ? $weightText : null,
                    'range' => $rangeText !== '' ? $rangeText : null,
                    'percentage' => $percentageText !== '' ? $percentageText : null,
                    'feedback' => $feedbackText !== '' ? $feedbackText : null,
                    'contribution_to_total' => $contribText !== '' ? $contribText : null,
                ];
            }
        } elseif (is_object($tabledata)) {
            foreach ((array) $tabledata as $row) {
                if (! is_array($row)) {
                    continue;
                }

                $nameHtml = $row['itemname']['content'] ?? $row['itemname'] ?? ($row[0]['content'] ?? '');
                $weightHtml = $row['weight']['content'] ?? ($row['weight'] ?? ($row[1]['content'] ?? ''));
                $gradeHtml = $row['grade']['content'] ?? $row['grade'] ?? ($row[2]['content'] ?? '');
                $rangeHtml = $row['range']['content'] ?? ($row['range'] ?? ($row[3]['content'] ?? ''));
                $percentageHtml = $row['percentage']['content'] ?? ($row['percentage'] ?? ($row[4]['content'] ?? ''));
                $feedbackHtml = $row['feedback']['content'] ?? ($row['feedback'] ?? ($row[5]['content'] ?? ''));
                $contribHtml = $row['contributiontocoursetotal']['content']
                    ?? ($row['contributiontocoursetotal'] ?? ($row[6]['content'] ?? ''));

                $name = self::normalizeCellText($nameHtml);
                $gradeText = self::cleanGradeText(self::normalizeCellText($gradeHtml));
                $weightText = self::normalizeCellText($weightHtml);
                $rangeText = self::normalizeCellText($rangeHtml);
                $percentageText = self::normalizeCellText($percentageHtml);
                $feedbackText = self::normalizeCellText($feedbackHtml);
                $contribText = self::normalizeCellText($contribHtml);

                if ($name === '' || strcasecmp($name, 'Course total') === 0) {
                    continue;
                }

                $items[] = [
                    'item_name' => $name,
                    'grade_text' => $gradeText ?: '—',
                    'weight' => $weightText !== '' ? $weightText : null,
                    'range' => $rangeText !== '' ? $rangeText : null,
                    'percentage' => $percentageText !== '' ? $percentageText : null,
                    'feedback' => $feedbackText !== '' ? $feedbackText : null,
                    'contribution_to_total' => $contribText !== '' ? $contribText : null,
                ];
            }
        }

        return $items;
    }

    /**
     * Extract course total percentage from a Moodle grades table response.
     */
    private static function extractCourseTotalPercentage(array $table): ?float
    {
        $tabledata = $table['tables'][0]['tabledata'] ?? $table['tabledata'] ?? null;
        if (! is_array($tabledata)) {
            return null;
        }

        foreach ($tabledata as $row) {
            if (! is_array($row)) {
                continue;
            }

            $cell0 = $row[0] ?? null;
            $cell4 = $row[4] ?? null;

            $nameHtml = is_array($cell0) ? ($cell0['content'] ?? $cell0['text'] ?? '') : (string) $cell0;
            if ($nameHtml === '' && isset($row['itemname'])) {
                $nameHtml = is_array($row['itemname']) ? ($row['itemname']['content'] ?? $row['itemname']['text'] ?? '') : (string) $row['itemname'];
            }

            $name = self::normalizeCellText($nameHtml);
            if ($name === '' || stripos($name, 'Course total') === false) {
                continue;
            }

            $percentageHtml = is_array($cell4) ? ($cell4['content'] ?? $cell4['text'] ?? '') : (string) $cell4;
            if ($percentageHtml === '' && isset($row['percentage'])) {
                $percentageHtml = is_array($row['percentage']) ? ($row['percentage']['content'] ?? $row['percentage']['text'] ?? '') : (string) $row['percentage'];
            }

            $pctText = self::normalizeCellText($percentageHtml);
            $pctText = str_replace('%', '', $pctText);
            $pctText = trim($pctText);

            if ($pctText === '' || $pctText === '-' || $pctText === '—') {
                return null;
            }

            // Some Moodle tables include extra text; grab the first number.
            if (preg_match('/-?\d+(\.\d+)?/', $pctText, $m)) {
                return (float) $m[0];
            }

            return null;
        }

        return null;
    }
}

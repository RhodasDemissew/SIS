<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class MoodleService
{
    private const POOL_CHUNK_SIZE = 40;

    /** Smaller enrolment payloads (faster over slow links). */
    private const ENROLLED_USER_FIELDS = 'id,fullname,firstname,lastname,email,username';

    protected string $baseUrl;

    protected ?string $token;

    protected int $timeoutSeconds;

    protected int $connectTimeoutSeconds;

    protected string $loginService;

    /** @var array<string, mixed>|null Last login/token.php error (no password stored). */
    protected ?array $lastAuthError = null;

    public function __construct(
        string $baseUrl = '',
        ?string $token = null,
        int $timeoutSeconds = 20,
        int $connectTimeoutSeconds = 8,
        string $loginService = '',
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->token = $token;
        $this->timeoutSeconds = $timeoutSeconds;
        $this->connectTimeoutSeconds = $connectTimeoutSeconds;
        $this->loginService = trim($loginService);
    }

    public function isConfigured(): bool
    {
        return ! empty($this->baseUrl) && ! empty($this->token);
    }

    /**
     * @return array<string, mixed>|null Last login/token.php error (no password).
     */
    public function lastAuthError(): ?array
    {
        return $this->lastAuthError;
    }

    public function authenticateUser(string $username, string $password): ?array
    {
        $this->lastAuthError = null;

        if (empty($this->baseUrl) || $username === '' || $password === '') {
            return null;
        }

        $service = $this->loginService;
        // Common .env mistake: quoting or leading/trailing spaces.
        if (str_starts_with($service, '"') && str_ends_with($service, '"')) {
            $service = trim($service, '"');
            $service = trim($service);
        }
        if ($service === '') {
            return null;
        }

        $url = $this->baseUrl.'/login/token.php';

        $response = Http::asForm()
            ->connectTimeout($this->connectTimeoutSeconds)
            ->timeout($this->timeoutSeconds)
            ->post($url, [
            'username' => $username,
            'password' => $password,
            'service' => $service,
        ]);

        if (! $response->successful()) {
            $this->lastAuthError = [
                'error' => 'HTTP request failed',
                'errorcode' => 'http_'.$response->status(),
                'http_status' => $response->status(),
            ];

            return null;
        }

        $body = $response->json();
        if (! is_array($body)) {
            $this->lastAuthError = ['error' => 'Invalid JSON from Moodle', 'errorcode' => 'invalid_response'];

            return null;
        }
        if (isset($body['error']) || isset($body['exception'])) {
            $this->lastAuthError = $body;

            return null;
        }

        return $body;
    }

    /**
     * Call a Moodle web service function.
     *
     * @param  array<string, mixed>  $params
     * @return array<mixed>|null
     */
    protected function call(string $wsfunction, array $params = []): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $url = $this->baseUrl.'/webservice/rest/server.php';
        $query = array_merge([
            'wstoken' => $this->token,
            'wsfunction' => $wsfunction,
            // Moodle expects this parameter name for REST JSON responses.
            'moodlewsrestformat' => 'json',
        ], $params);

        $response = Http::connectTimeout($this->connectTimeoutSeconds)
            ->timeout($this->timeoutSeconds)
            ->get($url, $query);

        if (! $response->successful()) {
            return null;
        }

        $body = $response->json();
        if (isset($body['exception'])) {
            return null;
        }

        return $body;
    }

    /**
     * Build REST URL + query array for a Moodle WS call.
     *
     * @param  array<string, mixed>  $params
     * @return array{0: string, 1: array<string, mixed>}
     */
    protected function buildCall(string $wsfunction, array $params = []): array
    {
        $url = $this->baseUrl.'/webservice/rest/server.php';
        $query = array_merge([
            'wstoken' => $this->token,
            'wsfunction' => $wsfunction,
            'moodlewsrestformat' => 'json',
        ], $params);

        return [$url, $query];
    }

    /**
     * Get Moodle user(s) by a unique field (e.g. email).
     * Uses core_user_get_users_by_field.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getUsersByField(string $field, array $values): ?array
    {
        $result = $this->call('core_user_get_users_by_field', [
            'field' => $field,
            'values' => $values,
        ]);

        // core_user_get_users_by_field returns a plain array of users,
        // not an object with a "users" key.
        if ($result === null || ! is_array($result)) {
            return null;
        }

        return $result;
    }

    /**
     * Get all Moodle users (or those matching simple criteria).
     *
     * @param  array<int, array<string, string>>  $criteria
     * @return array<int, array<string, mixed>>|null
     */
    public function getUsers(array $criteria = []): ?array
    {
        $result = $this->call('core_user_get_users', [
            'criteria' => $criteria,
        ]);

        if ($result === null || ! is_array($result)) {
            return null;
        }

        if (isset($result['users']) && is_array($result['users'])) {
            return $result['users'];
        }

        return null;
    }

    /**
     * Get Moodle user id by email. Returns null if not found.
     */
    public function getMoodleUserIdByEmail(string $email): ?int
    {
        $users = $this->getUsersByField('email', [$email]);
        if (empty($users) || ! isset($users[0]['id'])) {
            return null;
        }

        return (int) $users[0]['id'];
    }

    /**
     * Get the given user's course grades (final grades across courses).
     * Uses gradereport_overview_get_course_grades.
     *
     * @return array<string, mixed>|null
     */
    public function getCourseGrades(int $moodleUserId): ?array
    {
        return $this->call('gradereport_overview_get_course_grades', [
            'userid' => $moodleUserId,
        ]);
    }

    /**
     * Get list of courses a user is enrolled in.
     * Uses core_enrol_get_users_courses.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getUserCourses(int $moodleUserId): ?array
    {
        $result = $this->call('core_enrol_get_users_courses', [
            'userid' => $moodleUserId,
        ]);

        if ($result === null || ! is_array($result)) {
            return null;
        }

        return $result;
    }

    /**
     * Get the user's grades table for a specific course.
     * Uses gradereport_user_get_grades_table.
     *
     * @return array<string, mixed>|null
     */
    public function getGradesTable(int $moodleUserId, int $courseId): ?array
    {
        return $this->call('gradereport_user_get_grades_table', [
            'userid' => $moodleUserId,
            'courseid' => $courseId,
        ]);
    }

    /**
     * Get grades tables for many courses in parallel (same user).
     *
     * @param  array<int, int>  $courseIds
     * @return array<int, array<mixed>|null> map: courseId => grades table (or null)
     */
    public function getGradesTablesForCourses(int $moodleUserId, array $courseIds): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $courseIds)));
        if (count($ids) === 0) {
            return [];
        }

        [$urlBase, $baseQuery] = $this->buildCall('gradereport_user_get_grades_table', [
            'userid' => $moodleUserId,
        ]);

        $out = [];
        foreach (array_chunk($ids, self::POOL_CHUNK_SIZE) as $chunk) {
            $responses = Http::pool(function ($pool) use ($chunk, $urlBase, $baseQuery) {
                $reqs = [];
                foreach ($chunk as $cid) {
                    $reqs[] = $pool->connectTimeout($this->connectTimeoutSeconds)
                        ->timeout($this->timeoutSeconds)
                        ->get($urlBase, array_merge($baseQuery, ['courseid' => $cid]));
                }
                return $reqs;
            });

            foreach ($chunk as $index => $cid) {
                $res = $responses[$index] ?? null;
                if (! $res || ! $res->successful()) {
                    $out[$cid] = null;
                    continue;
                }
                $json = $res->json();
                if (! is_array($json) || isset($json['exception'])) {
                    $out[$cid] = null;
                    continue;
                }
                $out[$cid] = $json;
            }
        }

        return $out;
    }

    /**
     * Get grades table for many users in parallel (same course).
     *
     * This avoids N sequential HTTP calls which can be very slow for large courses.
     *
     * @param  array<int, int>  $moodleUserIds
     * @return array<int, array<mixed>|null> map: moodleUserId => grades table (or null on failure)
     */
    public function getGradesTablesForUsers(int $courseId, array $moodleUserIds): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $moodleUserIds)));
        if (count($ids) === 0) {
            return [];
        }

        [$urlBase, $baseQuery] = $this->buildCall('gradereport_user_get_grades_table', [
            'courseid' => $courseId,
        ]);

        $out = [];
        foreach (array_chunk($ids, self::POOL_CHUNK_SIZE) as $chunk) {
            $responses = Http::pool(function ($pool) use ($chunk, $urlBase, $baseQuery) {
                $reqs = [];
                foreach ($chunk as $uid) {
                    $reqs[] = $pool->connectTimeout($this->connectTimeoutSeconds)
                        ->timeout($this->timeoutSeconds)
                        ->get($urlBase, array_merge($baseQuery, ['userid' => $uid]));
                }
                return $reqs;
            });

            foreach ($chunk as $i => $uid) {
                $res = $responses[$i] ?? null;
                if (! $res || ! $res->successful()) {
                    $out[$uid] = null;
                    continue;
                }
                $json = $res->json();
                if (! is_array($json) || isset($json['exception'])) {
                    $out[$uid] = null;
                    continue;
                }
                $out[$uid] = $json;
            }
        }

        return $out;
    }

    /**
     * Get course categories (e.g. KG, GRADE 1, GRADE 2...).
     * Uses core_course_get_categories.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getCourseCategories(): ?array
    {
        $result = $this->call('core_course_get_categories', []);
        if ($result === null || ! is_array($result)) {
            return null;
        }

        return $result;
    }

    /**
     * Get courses by field (e.g. category id).
     * Uses core_course_get_courses_by_field.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function getCoursesByCategory(int $categoryId): ?array
    {
        $result = $this->call('core_course_get_courses_by_field', [
            'field' => 'category',
            'value' => $categoryId,
        ]);

        if ($result === null) {
            return null;
        }

        // Typical shape: { "courses": [ ... ] }
        if (isset($result['courses']) && is_array($result['courses'])) {
            return $result['courses'];
        }

        // Some installations may return a plain array.
        if (is_array($result)) {
            return $result;
        }

        return null;
    }

    /**
     * Get courses for many categories in parallel.
     *
     * @param  array<int, int>  $categoryIds
     * @return array<int, array<int, array<string, mixed>>|null> map: categoryId => courses (or null)
     */
    public function getCoursesByCategories(array $categoryIds): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $categoryIds)));
        if (count($ids) === 0) {
            return [];
        }

        [$urlBase, $baseQuery] = $this->buildCall('core_course_get_courses_by_field', [
            'field' => 'category',
        ]);

        $out = [];
        foreach (array_chunk($ids, self::POOL_CHUNK_SIZE) as $chunk) {
            $responses = Http::pool(function ($pool) use ($chunk, $urlBase, $baseQuery) {
                $reqs = [];
                foreach ($chunk as $cid) {
                    $reqs[] = $pool->connectTimeout($this->connectTimeoutSeconds)
                        ->timeout($this->timeoutSeconds)
                        ->get($urlBase, array_merge($baseQuery, ['value' => $cid]));
                }
                return $reqs;
            });

            foreach ($chunk as $index => $cid) {
                $res = $responses[$index] ?? null;
                if (! $res || ! $res->successful()) {
                    $out[$cid] = null;
                    continue;
                }
                $json = $res->json();
                if (isset($json['courses']) && is_array($json['courses'])) {
                    $out[$cid] = $json['courses'];
                } elseif (is_array($json)) {
                    $out[$cid] = $json;
                } else {
                    $out[$cid] = null;
                }
            }
        }

        return $out;
    }

    /**
     * Get enrolled users for a course.
     * Uses core_enrol_get_enrolled_users.
     *
     * @return array<int, array<string, mixed>>|null
     */
    /**
     * @return array<int, array<string, string>>
     */
    private function enrolledUsersOptions(): array
    {
        return [
            ['name' => 'onlyactive', 'value' => '1'],
            ['name' => 'userfields', 'value' => self::ENROLLED_USER_FIELDS],
        ];
    }

    public function getEnrolledUsers(int $courseId): ?array
    {
        $result = $this->call('core_enrol_get_enrolled_users', [
            'courseid' => $courseId,
            'options' => $this->enrolledUsersOptions(),
        ]);

        if ($result === null || ! is_array($result)) {
            return null;
        }

        return $result;
    }

    /**
     * Get enrolled users for many courses in parallel.
     *
     * @param  array<int, int>  $courseIds
     * @return array<int, array<int, array<string, mixed>>|null> map: courseId => users (or null)
     */
    public function getEnrolledUsersForCourses(array $courseIds): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $ids = array_values(array_unique(array_map('intval', $courseIds)));
        if (count($ids) === 0) {
            return [];
        }

        [$urlBase, $baseQuery] = $this->buildCall('core_enrol_get_enrolled_users', [
            'options' => $this->enrolledUsersOptions(),
        ]);

        $out = [];
        foreach (array_chunk($ids, self::POOL_CHUNK_SIZE) as $chunk) {
            $responses = Http::pool(function ($pool) use ($chunk, $urlBase, $baseQuery) {
                $reqs = [];
                foreach ($chunk as $courseId) {
                    $reqs[] = $pool->connectTimeout($this->connectTimeoutSeconds)
                        ->timeout($this->timeoutSeconds)
                        ->get($urlBase, array_merge($baseQuery, ['courseid' => $courseId]));
                }
                return $reqs;
            });

            foreach ($chunk as $index => $courseId) {
                $res = $responses[$index] ?? null;
                if (! $res || ! $res->successful()) {
                    $out[$courseId] = null;
                    continue;
                }
                $json = $res->json();
                $out[$courseId] = is_array($json) ? $json : null;
            }
        }

        return $out;
    }

    /**
     * Infer Moodle role shortnames for a user by scanning enrolled roles in their courses.
     *
     * @return array<int, string>
     */
    public function getUserRoleShortnamesFromCourses(int $moodleUserId, int $maxCoursesToScan = 8): array
    {
        $courses = $this->getUserCourses($moodleUserId) ?? [];
        if (! is_array($courses) || count($courses) === 0) {
            return [];
        }

        $courseIds = [];
        foreach ($courses as $course) {
            if (! is_array($course) || ! isset($course['id'])) {
                continue;
            }
            $courseIds[] = (int) $course['id'];
            if (count($courseIds) >= $maxCoursesToScan) {
                break;
            }
        }
        $courseIds = array_values(array_unique($courseIds));
        if (count($courseIds) === 0) {
            return [];
        }

        $enrolledByCourse = $this->getEnrolledUsersForCourses($courseIds);
        $found = [];
        foreach ($courseIds as $courseId) {
            $users = $enrolledByCourse[$courseId] ?? null;
            if (! is_array($users)) {
                continue;
            }
            foreach ($users as $user) {
                if (! is_array($user) || (int) ($user['id'] ?? 0) !== $moodleUserId) {
                    continue;
                }
                $roles = $user['roles'] ?? [];
                if (! is_array($roles)) {
                    continue;
                }
                foreach ($roles as $role) {
                    if (! is_array($role)) {
                        continue;
                    }
                    $shortname = isset($role['shortname']) ? trim((string) $role['shortname']) : '';
                    if ($shortname !== '') {
                        $found[] = strtolower($shortname);
                    }
                }
            }
        }

        return array_values(array_unique($found));
    }
}

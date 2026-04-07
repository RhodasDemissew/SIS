<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiToken;
use App\Models\User;
use App\Services\MoodleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function __construct(
        protected MoodleService $moodle,
    ) {}

    /**
     * Login: validate username/password against Moodle, return SIS token and user.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required',
        ]);

        $username = trim((string) $request->username);

        // Look up Moodle user by username so we can confirm userid and read profile fields.
        $moodleUsers = $this->moodle->getUsersByField('username', [$username]) ?? [];
        if (empty($moodleUsers) || ! is_array($moodleUsers[0] ?? null)) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        $moodleProfile = $moodleUsers[0];
        $moodleUserId = isset($moodleProfile['id']) ? (int) $moodleProfile['id'] : null;

        if ($moodleUserId === null) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        $auth = $this->moodle->authenticateUser($username, $request->password);
        // Some Moodle versions return only {token, privatetoken}. Token presence means credentials are valid.
        if ($auth === null || ! isset($auth['token'])) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }
        if (isset($auth['userid']) && (int) $auth['userid'] !== $moodleUserId) {
            throw ValidationException::withMessages([
                'username' => ['The provided credentials are incorrect.'],
            ]);
        }

        $fullname = trim((string) (($moodleProfile['fullname'] ?? '') ?: (($moodleProfile['firstname'] ?? '').' '.($moodleProfile['lastname'] ?? ''))));
        $email = (string) ($moodleProfile['email'] ?? '');
        $name = $fullname !== '' ? $fullname : ($email !== '' ? $email : $username);
        $adminUsernames = array_values(array_filter(array_map('trim', explode(',', (string) env('SIS_ADMIN_USERNAMES', '')))));
        $adminEmails = array_values(array_filter(array_map('trim', explode(',', (string) env('SIS_ADMIN_EMAILS', '')))));
        $adminMoodleRoleShortnames = array_values(array_filter(array_map(
            fn ($v) => strtolower(trim((string) $v)),
            explode(',', (string) env('SIS_ADMIN_MOODLE_ROLE_SHORTNAMES', 'manager,admin,editingteacher,teacher'))
        )));
        $adminUsernamesLc = array_map('strtolower', $adminUsernames);
        $adminEmailsLc = array_map('strtolower', $adminEmails);
        $moodleRoleShortnames = Cache::remember(
            "auth:moodle-user-role-shortnames:{$moodleUserId}",
            now()->addMinutes(10),
            fn () => $this->moodle->getUserRoleShortnamesFromCourses($moodleUserId)
        );

        $existingUser = User::where('moodle_user_id', $moodleUserId)
            ->orWhere('email', $email !== '' ? $email : ($username.'@lms.local'))
            ->first();
        $existingRoles = $existingUser?->roleList() ?? [];

        $roles = ['student'];
        if (
            in_array(strtolower($username), $adminUsernamesLc, true) ||
            ($email !== '' && in_array(strtolower($email), $adminEmailsLc, true)) ||
            count(array_intersect($adminMoodleRoleShortnames, is_array($moodleRoleShortnames) ? $moodleRoleShortnames : [])) > 0 ||
            in_array('admin', $existingRoles, true)
        ) {
            $roles[] = 'admin';
        }

        // Create or update a local SIS user record. Password is random; Moodle is source of truth for auth.
        $allowedRoles = ['admin', 'student'];
        $finalRoles = array_values(array_unique(array_filter(
            array_merge($existingRoles, $roles),
            fn ($role) => in_array((string) $role, $allowedRoles, true)
        )));
        if (count($finalRoles) === 0) {
            $finalRoles = ['student'];
        }

        $user = User::updateOrCreate(
            ['email' => $email !== '' ? $email : ($username.'@lms.local')],
            [
                'name' => $name,
                'password' => Str::random(40),
                'moodle_user_id' => $moodleUserId,
                'roles' => $finalRoles,
            ]
        );

        $token = ApiToken::createTokenFor($user);

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'moodle_user_id' => $user->moodle_user_id,
                'roles' => $user->roleList(),
            ],
        ]);
    }

    /**
     * Logout: revoke the current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $token = $request->bearerToken();
        if ($token) {
            ApiToken::where('token', $token)->delete();
        }
        return response()->json(['message' => 'Logged out']);
    }

    /**
     * Return current authenticated user (for frontend to check session).
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }
        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'moodle_user_id' => $user->moodle_user_id,
                'roles' => $user->roleList(),
            ],
        ]);
    }
}

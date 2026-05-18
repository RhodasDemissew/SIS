<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiToken;
use App\Models\User;
use App\Services\MoodleService;
use App\Support\SisTenant;
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
        $tenant = (string) $request->attributes->get('sis_tenant', SisTenant::defaultId());

        try {
            SisTenant::assertUsable($tenant);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages([
                'tenant' => [$e->getMessage()],
            ]);
        }

        // Look up Moodle user by username so we can confirm userid and read profile fields.
        $moodleUsers = $this->moodle->getUsersByField('username', [$username]) ?? [];
        if (empty($moodleUsers) || ! is_array($moodleUsers[0] ?? null)) {
            $messages = ['username' => ['No Moodle user found for this username on the selected LMS site.']];
            if (config('app.debug')) {
                $messages['debug'] = ['step' => 'user_lookup', 'tenant' => $tenant];
            }
            throw ValidationException::withMessages($messages);
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
            $moodleErr = $this->moodle->lastAuthError();
            $hint = 'The provided credentials are incorrect.';
            if (is_array($moodleErr)) {
                $code = (string) ($moodleErr['errorcode'] ?? '');
                if ($code === 'cannotcreatetoken') {
                    $hint = 'Moodle blocked login for service "'.$this->moodleLoginServiceName().'". On this LMS, allow webservice/rest:use for your role, clear "Required capability" on the external service, or add your user to authorised users.';
                } elseif ($code === 'invalidlogin') {
                    $hint = 'Moodle rejected the password for this LMS site. Use the same password that works on the Ecamel Moodle website (not ETSS).';
                } elseif ($code !== '') {
                    $hint = 'Moodle login error: '.(string) ($moodleErr['error'] ?? $code);
                }
            }
            $messages = ['username' => [$hint]];
            if (config('app.debug') && is_array($moodleErr)) {
                $messages['debug'] = [
                    'step' => 'moodle_login',
                    'tenant' => $tenant,
                    'moodle' => $moodleErr,
                    'login_service' => $this->moodleLoginServiceName(),
                ];
            }
            throw ValidationException::withMessages($messages);
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

        $existingUser = User::where('moodle_user_id', $moodleUserId)
            ->orWhere('email', $email !== '' ? $email : ($username.'@lms.local'))
            ->first();
        $existingRoles = $existingUser?->roleList() ?? [];

        $isAdminByConfig = in_array(strtolower($username), $adminUsernamesLc, true) ||
            ($email !== '' && in_array(strtolower($email), $adminEmailsLc, true)) ||
            in_array('admin', $existingRoles, true);

        // Role scan hits many courses; skip when admin is already known (keeps login fast).
        $moodleRoleShortnames = [];
        if (! $isAdminByConfig) {
            $moodleRoleShortnames = Cache::remember(
                "auth:moodle-user-role-shortnames:{$tenant}:{$moodleUserId}",
                now()->addMinutes(10),
                fn () => $this->moodle->getUserRoleShortnamesFromCourses($moodleUserId)
            );
        }

        $isAdmin = $isAdminByConfig ||
            count(array_intersect($adminMoodleRoleShortnames, is_array($moodleRoleShortnames) ? $moodleRoleShortnames : [])) > 0;

        // Create or update a local SIS user record. Password is random; Moodle is source of truth for auth.
        $allowedRoles = ['admin', 'student'];
        $merged = array_merge($existingRoles, $isAdmin ? ['admin', 'student'] : ['student']);
        $finalRoles = array_values(array_unique(array_filter(
            $merged,
            fn ($role) => in_array((string) $role, $allowedRoles, true)
        )));
        if (count($finalRoles) === 0) {
            $finalRoles = ['student'];
        }
        usort($finalRoles, fn ($a, $b) => ($a === 'admin' ? 0 : 1) <=> ($b === 'admin' ? 0 : 1));

        $user = User::updateOrCreate(
            ['email' => $email !== '' ? $email : ($username.'@lms.local')],
            [
                'name' => $name,
                'password' => Str::random(40),
                'moodle_user_id' => $moodleUserId,
                'roles' => $finalRoles,
            ]
        );

        $apiToken = ApiToken::createTokenFor($user, $tenant);

        $tenantLabel = (string) (SisTenant::config($tenant)['label'] ?? $tenant);

        return response()->json([
            'token' => $apiToken->token,
            'tenant' => $tenant,
            'tenant_label' => $tenantLabel,
            'session' => $apiToken->sessionMeta(),
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
    private function moodleLoginServiceName(): string
    {
        $tenant = (string) request()->attributes->get('sis_tenant', SisTenant::defaultId());

        return (string) (SisTenant::config($tenant)['login_service'] ?? 'SIS');
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }
        $apiToken = $request->attributes->get('api_token');
        $tenant = $request->attributes->get('sis_tenant');
        if ($tenant === null && $apiToken?->tenant) {
            $tenant = $apiToken->tenant;
        }

        $tenantId = $tenant !== null ? (string) $tenant : SisTenant::defaultId();
        $tenantLabel = SisTenant::exists($tenantId)
            ? (string) (SisTenant::config($tenantId)['label'] ?? $tenantId)
            : $tenantId;

        $payload = [
            'tenant' => $tenant,
            'tenant_label' => $tenantLabel,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'moodle_user_id' => $user->moodle_user_id,
                'roles' => $user->roleList(),
            ],
        ];

        if ($apiToken instanceof ApiToken) {
            $payload['session'] = $apiToken->sessionMeta();
        }

        return response()->json($payload);
    }
}

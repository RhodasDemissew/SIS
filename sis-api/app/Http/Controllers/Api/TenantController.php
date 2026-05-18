<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\SisTenant;
use Illuminate\Http\JsonResponse;

class TenantController extends Controller
{
    /**
     * List LMS tenants available for login (enabled + configured).
     */
    public function index(): JsonResponse
    {
        $tenants = [];
        foreach (SisTenant::enabledForApi() as $entry) {
            try {
                SisTenant::assertUsable($entry['id']);
                $tenants[] = $entry;
            } catch (\InvalidArgumentException) {
                // Skip tenants missing URL/token.
            }
        }

        return response()->json([
            'default_tenant' => SisTenant::defaultId(),
            'tenants' => $tenants,
        ]);
    }
}

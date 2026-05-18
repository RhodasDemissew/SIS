<?php

namespace App\Http\Middleware;

use App\Support\SisTenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveSisTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = null;

        if ($request->is('api/login') && $request->isMethod('POST')) {
            $tenant = $request->input('tenant');
        } else {
            $tenant = $request->header('X-SIS-Tenant');
        }

        $tenant = SisTenant::normalize($tenant);

        if (! SisTenant::exists($tenant)) {
            return response()->json([
                'message' => 'Unknown tenant.',
                'tenant' => $tenant,
            ], 400);
        }

        if (! SisTenant::isEnabled($tenant)) {
            return response()->json([
                'message' => 'This LMS is not enabled for SIS.',
                'tenant' => $tenant,
            ], 403);
        }

        $request->attributes->set('sis_tenant', $tenant);

        return $next($request);
    }
}

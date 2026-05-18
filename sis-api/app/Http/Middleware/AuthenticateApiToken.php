<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $apiToken = ApiToken::where('token', $token)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->first();
        if (! $apiToken) {
            return response()->json(['message' => 'Invalid or expired token.'], 401);
        }

        $request->setUserResolver(fn () => $apiToken->user);

        $headerTenant = $request->header('X-SIS-Tenant');
        if ($headerTenant !== null && $headerTenant !== '' && $apiToken->tenant !== null) {
            if (strtolower(trim($headerTenant)) !== strtolower((string) $apiToken->tenant)) {
                return response()->json(['message' => 'Tenant mismatch for this session.'], 403);
            }
        }

        if ($apiToken->tenant) {
            $request->attributes->set('sis_tenant', strtolower((string) $apiToken->tenant));
        }

        return $next($request);
    }
}

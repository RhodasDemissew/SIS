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

        $apiToken = ApiToken::where('token', $token)->first();
        if (! $apiToken) {
            return response()->json(['message' => 'Invalid or expired token.'], 401);
        }

        if ($apiToken->isExpired() || $apiToken->isIdleExpired()) {
            $apiToken->delete();

            return response()->json(['message' => 'Invalid or expired token.'], 401);
        }

        $apiToken->forceFill(['last_used_at' => now()])->save();

        $request->setUserResolver(fn () => $apiToken->user);
        $request->attributes->set('api_token', $apiToken);

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

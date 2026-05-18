<?php

namespace App\Services;

use App\Support\SisTenant;

class MoodleServiceFactory
{
    public static function forTenant(string $tenant): MoodleService
    {
        $tenant = SisTenant::assertUsable($tenant);
        $cfg = SisTenant::config($tenant);

        return new MoodleService(
            baseUrl: (string) ($cfg['url'] ?? ''),
            token: $cfg['token'] ?? null,
            timeoutSeconds: (int) ($cfg['timeout'] ?? 20),
            connectTimeoutSeconds: (int) ($cfg['connect_timeout'] ?? 8),
            loginService: (string) ($cfg['login_service'] ?? ''),
        );
    }
}

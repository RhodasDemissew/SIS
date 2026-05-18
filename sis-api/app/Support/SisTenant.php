<?php

namespace App\Support;

use InvalidArgumentException;

final class SisTenant
{
    /**
     * @return list<string>
     */
    public static function ids(): array
    {
        return array_keys(config('moodle.tenants', []));
    }

    public static function normalize(?string $tenant): string
    {
        $tenant = strtolower(trim((string) $tenant));

        return $tenant !== '' ? $tenant : self::defaultId();
    }

    public static function defaultId(): string
    {
        $default = self::normalize(config('moodle.default_tenant'));

        if (! self::exists($default)) {
            $ids = self::ids();

            return $ids[0] ?? 'ecamel';
        }

        return $default;
    }

    public static function exists(string $tenant): bool
    {
        return array_key_exists($tenant, config('moodle.tenants', []));
    }

    public static function isEnabled(string $tenant): bool
    {
        if (! self::exists($tenant)) {
            return false;
        }

        return (bool) config("moodle.tenants.{$tenant}.enabled", false);
    }

    /**
     * @return array<string, mixed>
     */
    public static function config(string $tenant): array
    {
        $tenant = self::normalize($tenant);

        if (! self::exists($tenant)) {
            throw new InvalidArgumentException("Unknown SIS tenant: {$tenant}");
        }

        return config("moodle.tenants.{$tenant}", []);
    }

    /**
     * @return list<array{id: string, label: string}>
     */
    public static function enabledForApi(): array
    {
        $out = [];
        foreach (self::ids() as $id) {
            if (! self::isEnabled($id)) {
                continue;
            }
            $out[] = [
                'id' => $id,
                'label' => (string) config("moodle.tenants.{$id}.label", $id),
            ];
        }

        return $out;
    }

    public static function assertUsable(string $tenant): string
    {
        $tenant = self::normalize($tenant);

        if (! self::exists($tenant)) {
            throw new InvalidArgumentException("Unknown SIS tenant: {$tenant}");
        }

        if (! self::isEnabled($tenant)) {
            throw new InvalidArgumentException("SIS tenant is not enabled: {$tenant}");
        }

        $cfg = self::config($tenant);
        if (empty($cfg['url']) || empty($cfg['token'])) {
            throw new InvalidArgumentException("SIS tenant is not configured (missing URL or token): {$tenant}");
        }

        return $tenant;
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class ApiToken extends Model
{
    protected $fillable = ['user_id', 'tenant', 'token', 'expires_at', 'last_used_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function idleMinutes(): int
    {
        return max(1, (int) config('sis.token_idle_minutes', 180));
    }

    public static function maxLifetimeMinutes(): int
    {
        return max(1, (int) config('sis.token_max_lifetime_minutes', 480));
    }

    public function effectiveExpiresAt(): Carbon
    {
        if ($this->expires_at !== null) {
            return $this->expires_at;
        }

        return $this->created_at->copy()->addMinutes(self::maxLifetimeMinutes());
    }

    public function isExpired(): bool
    {
        return $this->effectiveExpiresAt()->isPast();
    }

    public function isIdleExpired(): bool
    {
        $idleMinutes = self::idleMinutes();
        $lastUsed = $this->last_used_at ?? $this->updated_at ?? $this->created_at;

        return $lastUsed->copy()->addMinutes($idleMinutes)->isPast();
    }

    /**
     * @return array{expires_at: string, idle_timeout_minutes: int}
     */
    public function sessionMeta(): array
    {
        return [
            'expires_at' => $this->effectiveExpiresAt()->toIso8601String(),
            'idle_timeout_minutes' => self::idleMinutes(),
        ];
    }

    public static function createTokenFor(User $user, string $tenant = 'ecamel'): self
    {
        $tenant = strtolower(trim($tenant));
        $now = now();
        $maxLifetime = self::maxLifetimeMinutes();

        self::where('user_id', $user->id)
            ->where('tenant', $tenant)
            ->delete();

        self::where('expires_at', '<', now())->delete();

        return self::create([
            'user_id' => $user->id,
            'tenant' => $tenant,
            'token' => Str::random(64),
            'expires_at' => $now->copy()->addMinutes($maxLifetime),
            'last_used_at' => $now,
        ]);
    }
}

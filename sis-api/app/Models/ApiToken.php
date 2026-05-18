<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ApiToken extends Model
{
    protected $fillable = ['user_id', 'tenant', 'token', 'expires_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function createTokenFor(User $user, string $tenant = 'ecamel'): string
    {
        $token = Str::random(64);
        self::create([
            'user_id' => $user->id,
            'tenant' => strtolower(trim($tenant)),
            'token' => $token,
        ]);

        return $token;
    }
}

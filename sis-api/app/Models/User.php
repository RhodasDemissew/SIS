<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    public function apiTokens(): HasMany
    {
        return $this->hasMany(ApiToken::class);
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'moodle_user_id',
        'password',
        'roles',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'roles' => 'array',
        ];
    }

    /**
     * @return array<int, string>
     */
    public function roleList(): array
    {
        $roles = $this->roles;
        if (! is_array($roles) || empty($roles)) {
            return ['admin'];
        }
        $list = array_values(array_unique(array_map(fn ($r) => (string) $r, $roles)));
        usort($list, fn ($a, $b) => ($a === 'admin' ? 0 : 1) <=> ($b === 'admin' ? 0 : 1));

        return $list;
    }

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roleList(), true);
    }
}

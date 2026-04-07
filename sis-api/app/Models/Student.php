<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends Model
{
    use HasFactory;

    protected $fillable = [
        'sis_id',
        'name',
        'email',
        'age',
        'gender',
        'phone',
        'location',
        'grade_level',
        'status',
        'moodle_user_id',
    ];

    protected function casts(): array
    {
        return [
            'moodle_user_id' => 'integer',
        ];
    }

    public function grades(): HasMany
    {
        return $this->hasMany(StudentGrade::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentGrade extends Model
{
    protected $table = 'student_grades';

    protected $fillable = [
        'student_id',
        'course_name',
        'grade',
        'fetched_at',
    ];

    protected function casts(): array
    {
        return [
            'grade' => 'decimal:2',
            'fetched_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}

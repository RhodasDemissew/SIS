<?php

namespace Database\Seeders;

use App\Models\Student;
use Illuminate\Database\Seeder;

class StudentSeeder extends Seeder
{
    /**
     * Seed sample students for testing Moodle sync.
     * Change email to match a Moodle user to test link + fetch grades.
     */
    public function run(): void
    {
        Student::firstOrCreate(
            ['sis_id' => 'STU001'],
            [
                'name' => 'Sample Student',
                'email' => 'rhodasdemissew@gmail.com',
                'moodle_user_id' => null,
            ]
        );

        Student::firstOrCreate(
            ['sis_id' => 'STU002'],
            [
                'name' => 'Second Student',
                'email' => 'student2@example.com',
                'moodle_user_id' => null,
            ]
        );
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->index('email');
            $table->index('moodle_user_id');
        });

        Schema::table('student_grades', function (Blueprint $table) {
            $table->index(['student_id', 'fetched_at']);
            $table->index('course_name');
        });

        Schema::table('api_tokens', function (Blueprint $table) {
            $table->index('user_id');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropIndex(['email']);
            $table->dropIndex(['moodle_user_id']);
        });

        Schema::table('student_grades', function (Blueprint $table) {
            $table->dropIndex(['student_id', 'fetched_at']);
            $table->dropIndex(['course_name']);
        });

        Schema::table('api_tokens', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
            $table->dropIndex(['expires_at']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->unsignedTinyInteger('age')->nullable()->after('email');
            $table->string('gender', 20)->nullable()->after('age');
            $table->string('phone', 50)->nullable()->after('gender');
            $table->string('location')->nullable()->after('phone');
            $table->string('grade_level', 100)->nullable()->after('location');
            $table->string('status', 30)->default('Active')->after('grade_level');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropColumn(['age', 'gender', 'phone', 'location', 'grade_level', 'status']);
        });
    }
};

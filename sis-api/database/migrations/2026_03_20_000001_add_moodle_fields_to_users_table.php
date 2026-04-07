<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'moodle_user_id')) {
                $table->unsignedBigInteger('moodle_user_id')->nullable()->index()->after('email');
            }
            if (! Schema::hasColumn('users', 'roles')) {
                $table->json('roles')->nullable()->after('password');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $toDrop = [];
            if (Schema::hasColumn('users', 'moodle_user_id')) {
                $toDrop[] = 'moodle_user_id';
            }
            if (Schema::hasColumn('users', 'roles')) {
                $toDrop[] = 'roles';
            }
            if (! empty($toDrop)) {
                $table->dropColumn($toDrop);
            }
        });
    }
};


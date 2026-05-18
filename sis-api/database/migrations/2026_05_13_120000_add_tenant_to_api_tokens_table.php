<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_tokens', function (Blueprint $table) {
            if (! Schema::hasColumn('api_tokens', 'tenant')) {
                $table->string('tenant', 32)->default('etss')->after('user_id');
                $table->index('tenant');
            }
        });
    }

    public function down(): void
    {
        Schema::table('api_tokens', function (Blueprint $table) {
            if (Schema::hasColumn('api_tokens', 'tenant')) {
                $table->dropIndex(['tenant']);
                $table->dropColumn('tenant');
            }
        });
    }
};

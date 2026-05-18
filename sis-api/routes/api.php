<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MoodleController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\TenantController;
use Illuminate\Support\Facades\Route;

Route::get('/tenants', [TenantController::class, 'index']);

Route::middleware(['sis.tenant', 'throttle:10,1'])->group(function (): void {
    Route::post('/login', [AuthController::class, 'login']);
});

// Protected routes (require Bearer token + tenant)
Route::middleware(['sis.tenant', 'auth.api', 'throttle:60,1'])->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Role-aware, self-safe read endpoints.
    Route::get('/moodle/site-students/{moodleUserId}/grades', [MoodleController::class, 'moodleStudentReport']);
    Route::get('/moodle/course-grades-direct/{moodleUserId}/{courseId}', [MoodleController::class, 'courseDetailsDirect']);
    Route::get('/moodle/categories', [MoodleController::class, 'categories']);
    Route::get('/moodle/courses/{categoryId}', [MoodleController::class, 'coursesByCategory']);

    // Admin-only endpoints (admission + Moodle sync management)
    Route::middleware('require.role:admin')->group(function (): void {
        Route::get('/students', [StudentController::class, 'index']);
        Route::post('/students', [StudentController::class, 'store']);
        Route::get('/students/{id}/grades', [StudentController::class, 'grades']);
        Route::delete('/students/{id}', [StudentController::class, 'destroy']);

        Route::post('/moodle/fetch-grades/{studentId}', [MoodleController::class, 'fetchGrades']);
        Route::get('/moodle/course-grades/{studentId}/{courseId}', [MoodleController::class, 'courseDetails']);
        Route::post('/students/{id}/link-moodle', [MoodleController::class, 'linkStudent']);
        Route::get('/moodle/site-students', [MoodleController::class, 'moodleStudents']);
        Route::get('/moodle/overview-metrics', [MoodleController::class, 'overviewMetrics']);
        Route::get('/moodle/course-students/{courseId}', [MoodleController::class, 'courseStudents']);
    });
});

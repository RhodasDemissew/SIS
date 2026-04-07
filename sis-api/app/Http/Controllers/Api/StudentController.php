<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentController extends Controller
{
    /**
     * List students (optionally with latest grades).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Student::query()->orderBy('sis_id');

        if ($request->boolean('with_grades')) {
            $query->with(['grades' => fn ($q) => $q->latest('fetched_at')->limit(5)]);
        }

        $students = $query->get()->map(fn (Student $s) => [
            'id' => $s->id,
            'sis_id' => $s->sis_id,
            'name' => $s->name,
            'email' => $s->email,
            'age' => $s->age,
            'gender' => $s->gender,
            'phone' => $s->phone,
            'location' => $s->location,
            'grade_level' => $s->grade_level,
            'status' => $s->status ?? 'Active',
            'moodle_user_id' => $s->moodle_user_id,
        ]);

        return response()->json(['students' => $students]);
    }

    /**
     * Create a new student (admission).
     */
    public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'name' => 'required|string|max:255',
                'email' => 'required|email',
                'age' => 'nullable|integer|min:1|max:120',
                'gender' => 'nullable|string|max:20',
                'phone' => 'nullable|string|max:50',
                'location' => 'nullable|string|max:255',
                'grade_level' => 'nullable|string|max:100',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        }

        $age = $validated['age'] ?? null;
        if ($age === '' || $age === false) {
            $age = null;
        }

        try {
            $maxNum = Student::query()
                ->selectRaw("CAST(REPLACE(sis_id, 'STU', '') AS INTEGER) as num")
                ->get()
                ->max('num') ?? 0;
            $nextNum = (int) $maxNum + 1;
            $sisId = 'STU'.str_pad((string) $nextNum, 3, '0', STR_PAD_LEFT);

            $student = Student::create([
                'sis_id' => $sisId,
                'name' => $validated['name'],
                'email' => $validated['email'],
                'age' => $age,
                'gender' => ($validated['gender'] ?? null) ?: null,
                'phone' => ($validated['phone'] ?? null) ?: null,
                'location' => ($validated['location'] ?? null) ?: null,
                'grade_level' => ($validated['grade_level'] ?? null) ?: null,
                'status' => 'Active',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Could not save student',
                'error' => config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }

        return response()->json([
            'message' => 'Student admitted successfully',
            'student' => [
                'id' => $student->id,
                'sis_id' => $student->sis_id,
                'name' => $student->name,
                'email' => $student->email,
                'age' => $student->age,
                'gender' => $student->gender,
                'phone' => $student->phone,
                'location' => $student->location,
                'grade_level' => $student->grade_level,
                'status' => $student->status,
            ],
        ], 201);
    }

    /**
     * Delete a student.
     */
    public function destroy(string $id): JsonResponse
    {
        $student = Student::find($id);

        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        $student->grades()->delete();
        $student->delete();

        return response()->json(['message' => 'Student removed']);
    }

    /**
     * Get grades for one student (from DB).
     */
    public function grades(string $id): JsonResponse
    {
        $student = Student::find($id);

        if (! $student) {
            return response()->json(['message' => 'Student not found'], 404);
        }

        $grades = $student->grades()
            ->orderByDesc('fetched_at')
            ->get()
            ->map(fn ($g) => [
                'id' => $g->id,
                'course_name' => $g->course_name,
                'grade' => $g->grade !== null ? (float) $g->grade : null,
                'fetched_at' => $g->fetched_at?->toIso8601String(),
            ]);

        return response()->json([
            'student_id' => $student->id,
            'student_sis_id' => $student->sis_id,
            'grades' => $grades,
        ]);
    }
}

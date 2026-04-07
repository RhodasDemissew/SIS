# SIS (Student Information System) – Moodle Grades Demo

## 1. How to run the frontend

**Prerequisites:** Node.js (v18+ recommended) and npm installed.

```bash
cd "c:\Users\rhoda\OneDrive\Desktop\Ecamel Dr. Nega\SIS"
npm install
npm run dev
```

Then open **http://localhost:5173/** in your browser.

- Use the **Role Switcher** in the sidebar to switch between Student, Faculty, and Administrator.
- As **Administrator**, open **Moodle Sync** in the sidebar to see the current (mock) Moodle Sync Hub.

---

## 2. Next steps for the Moodle grades demo

Goal: show that you can **fetch a student’s grades from your Moodle LMS** and display them in this SIS UI (locally, simple demo).

### Step A – Laravel backend (API only)

**Prerequisites:** PHP and Composer must be installed. Full steps: **sis-api/SETUP.md** (folder next to SIS).

1. **Create the Laravel project** (from the folder that contains `SIS` and `sis-api`):
   ```bash
   cd "c:\Users\rhoda\OneDrive\Desktop\Ecamel Dr. Nega"
   composer create-project laravel/laravel sis-api --prefer-dist
   cd sis-api
   php artisan serve
   ```
   Backend will run at **http://localhost:8000**.

2. **Enable CORS** so the React app (port 5173) can call the API:
   - In `sis-api/config/cors.php`, allow origin `http://localhost:5173` (see sis-api/SETUP.md).

### Step B – Simple database

1. **Use SQLite** for the demo (no MySQL setup):
   - In Laravel: set `DB_CONNECTION=sqlite` in `.env` and create `database/database.sqlite`.
   - Run: `php artisan migrate` (after creating migrations).

2. **Minimal tables** for the demo:
   - **students**: `id`, `sis_id` (e.g. STU001), `name`, `email`, `moodle_user_id` (nullable).
   - **student_grades** (or **grades**): `id`, `student_id`, `course_name`, `grade`, `fetched_at` (so you can show “from Moodle”).

### Step C – Moodle connection (Web Services)

1. **On your Moodle site** (with admin access):
   - Enable **Web services**: Site administration → Advanced features → Enable web services.
   - Create a **protocol**: Enable **REST protocol**.
   - Create an **external service** and add these functions (or the ones you need for grades):
     - `core_grades_get_grades` (for course/grade data),
     - or `core_user_get_users`, `mod_assign_get_grades`, etc., depending on your Moodle version.
   - Create a **user** (or use an admin account) and give it permission to use that service.
   - Create a **token** for that user (Security → Web services → Manage tokens). Copy the token and the Moodle site URL.

2. **In Laravel**, call Moodle’s REST API:
   - Store in `.env`: `MOODLE_URL`, `MOODLE_TOKEN`.
   - Use `Http::get()` or Guzzle to call:
     - `MOODLE_URL/webservice/rest/server.php?wstoken=TOKEN&wsfunction=core_grades_get_grades&moodlewsformat=json&...`
   - Map the response to your `student_grades` (or similar) and save to DB.

### Step D – Link SIS students to Moodle

- In the **students** table, store `moodle_user_id` (from Moodle’s user id).
- When you “fetch grades” for a student, call Moodle with that `moodle_user_id` (or course id), then store/return grades to the frontend.

### Step E – API endpoints for the demo

Keep it small:

1. **GET /api/students** – list students (from your DB, optionally with latest grades).
2. **POST /api/moodle/fetch-grades/{studentId}** – trigger “fetch from Moodle” for one student (Laravel calls Moodle, saves to DB, returns grades).
3. **GET /api/students/{id}/grades** – return grades for one student (from your DB, so the UI can show “from Moodle”).

### Step F – Frontend (this React app)

1. **Moodle Sync** page:
   - Add a dropdown or list of students (from `GET /api/students`).
   - Add a button “Fetch grades from Moodle” that calls `POST /api/moodle/fetch-grades/{studentId}`.
   - Show result: “Grades fetched” and list them (from `GET /api/students/{id}/grades`).

2. **Student profile / Academic record** (optional for demo):
   - When viewing a student, call `GET /api/students/{id}/grades` and show a small “Moodle grades” section.

3. **API base URL**: In React, use relative `/api` and the proxy in `vite.config.js` (already set to `http://localhost:8000`) so all `/api/*` requests go to Laravel.

---

## Summary

| Step | What to do |
|------|------------|
| **Run frontend** | `npm install` then `npm run dev` → http://localhost:5173 |
| **Backend** | New Laravel app, `php artisan serve` → http://localhost:8000 |
| **DB** | SQLite + `students` + `student_grades` (or `grades`) |
| **Moodle** | Enable REST, create token, call `core_grades_get_grades` (or equivalent) from Laravel |
| **Demo** | “Fetch grades” for one student on Moodle Sync page and show them in the SIS UI |

After you have Laravel and Moodle token ready, we can implement the exact Moodle API calls and the “Fetch grades” button step by step.

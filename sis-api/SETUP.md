# Laravel Backend (sis-api) – Setup

This folder is for the **Laravel API** that will talk to Moodle and serve the SIS frontend.

## Prerequisites (install once on Windows)

You need **PHP** and **Composer** before creating the Laravel project.

### Option 1 – Laragon (easiest: PHP + Composer + MySQL in one)

1. Download **Laragon**: https://laragon.org/download/
2. Install and run Laragon. It includes PHP and Composer.
3. Open **Laragon → Terminal** (or add Laragon’s `bin` to your PATH) and run the commands below.

### Option 2 – Install PHP and Composer separately

1. **PHP**
   - https://windows.php.net/download/
   - Or install via Chocolatey: `choco install php`
   - Add the PHP folder to your system **PATH**.

2. **Composer**
   - https://getcomposer.org/download/
   - Run the Windows installer; it will find PHP if it’s in PATH.
   - Restart the terminal after installing.

Check that both work:

```bash
php -v
composer -v
```

## Create the Laravel project

Run these from the **parent** of `sis-api` (the folder that contains both `SIS` and `sis-api`):

```bash
cd "c:\Users\rhoda\OneDrive\Desktop\Ecamel Dr. Nega"
composer create-project laravel/laravel sis-api --prefer-dist
```

If `sis-api` already exists and is empty (only this SETUP.md), you can either:

- Remove the empty `sis-api` folder, then run the command above, or  
- Create the project with another name and then rename:
  ```bash
  composer create-project laravel/laravel sis-api-temp --prefer-dist
  Move-Item sis-api-temp\* sis-api\
  Remove-Item sis-api-temp
  ```

## Run the backend

```bash
cd "c:\Users\rhoda\OneDrive\Desktop\Ecamel Dr. Nega\sis-api"
php artisan serve
```

Backend will be at **http://localhost:8000**.

## Allow the React app to call the API (CORS)

After the project is created, in `sis-api/config/cors.php` set:

- `'allowed_origins' => ['http://localhost:5173']`  
  (or `'paths' => ['api/*']` and allow that origin).

So the SIS frontend at http://localhost:5173 can call `http://localhost:8000/api/...`.

---

**Next:** Once Laravel is running, we add the database (SQLite), Moodle token config, and the grades API (see main SIS README Step B–F).

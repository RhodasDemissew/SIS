<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'moodle' => [
        'url' => rtrim(env('MOODLE_URL', ''), '/'),
        'token' => env('MOODLE_TOKEN'),
        'timeout' => (int) env('MOODLE_TIMEOUT', 20),
        'connect_timeout' => (int) env('MOODLE_CONNECT_TIMEOUT', 8),
        // Shortname of the Moodle external service used for user login (login/token.php).
        // This is the "Short name" field in Moodle's External services UI.
        'login_service' => env('MOODLE_LOGIN_SERVICE', 'SIS Grades Service'),
    ],

];

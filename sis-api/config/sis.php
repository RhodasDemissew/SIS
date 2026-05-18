<?php

return [
    /*
    |--------------------------------------------------------------------------
    | API token session limits
    |--------------------------------------------------------------------------
    |
    | idle: logout after this many minutes without API activity (last_used_at).
    | max_lifetime: hard cap from token creation (expires_at).
    |
    */
    'token_idle_minutes' => (int) env('SIS_API_TOKEN_IDLE_MINUTES', 180),
    'token_max_lifetime_minutes' => (int) env('SIS_API_TOKEN_MAX_LIFETIME_MINUTES', 480),
];

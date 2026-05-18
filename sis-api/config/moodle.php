<?php

/**
 * Multi-tenant Moodle configuration (ECAMEL + ETSS).
 *
 * Legacy env vars MOODLE_URL, MOODLE_TOKEN, MOODLE_LOGIN_SERVICE map to the etss tenant when MOODLE_ETSS_* are unset.
 */
return [

    'default_tenant' => strtolower(trim((string) env('SIS_DEFAULT_TENANT', 'ecamel'))),

    'tenants' => [
        'ecamel' => [
            'label' => env('MOODLE_ECAMEL_LABEL', 'Ecamel LMS'),
            'enabled' => filter_var(env('MOODLE_ECAMEL_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
            'url' => rtrim(trim((string) env('MOODLE_ECAMEL_URL', '')), '/'),
            'token' => env('MOODLE_ECAMEL_TOKEN'),
            'login_service' => (string) env('MOODLE_ECAMEL_LOGIN_SERVICE', 'SIS'),
            'timeout' => (int) env('MOODLE_ECAMEL_TIMEOUT', env('MOODLE_TIMEOUT', 20)),
            'connect_timeout' => (int) env('MOODLE_ECAMEL_CONNECT_TIMEOUT', env('MOODLE_CONNECT_TIMEOUT', 8)),
        ],
        'etss' => [
            'label' => env('MOODLE_ETSS_LABEL', 'DNEC ETSS / EthioEducation'),
            'enabled' => filter_var(env('MOODLE_ETSS_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
            'url' => rtrim(trim((string) env('MOODLE_ETSS_URL', env('MOODLE_URL', ''))), '/'),
            'token' => env('MOODLE_ETSS_TOKEN', env('MOODLE_TOKEN')),
            'login_service' => (string) env('MOODLE_ETSS_LOGIN_SERVICE', env('MOODLE_LOGIN_SERVICE', 'SIS')),
            'timeout' => (int) env('MOODLE_TIMEOUT', 20),
            'connect_timeout' => (int) env('MOODLE_CONNECT_TIMEOUT', 8),
        ],
    ],

];

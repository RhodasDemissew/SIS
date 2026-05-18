<?php

namespace App\Providers;

use App\Services\MoodleService;
use App\Services\MoodleServiceFactory;
use App\Support\SisTenant;
use Illuminate\Http\Request;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(MoodleService::class, function ($app) {
            /** @var Request $request */
            $request = $app->make(Request::class);
            $tenant = (string) $request->attributes->get('sis_tenant', SisTenant::defaultId());

            try {
                return MoodleServiceFactory::forTenant($tenant);
            } catch (\InvalidArgumentException $e) {
                abort(503, $e->getMessage());
            }
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}

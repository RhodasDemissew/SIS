FROM php:8.2-cli

RUN apt-get update && apt-get install -y \
    git unzip libsqlite3-dev libpq-dev sqlite3 \
    && docker-php-ext-install pdo pdo_sqlite pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . /app

RUN composer install --no-dev --optimize-autoloader

RUN mkdir -p /var/data storage bootstrap/cache \
    && touch /var/data/database.sqlite \
    && chown -R www-data:www-data /app /var/data

EXPOSE 10000

CMD php artisan migrate --force && php artisan db:seed --force && php artisan serve --host=0.0.0.0 --port=$PORT

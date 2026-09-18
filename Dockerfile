# =============================================================================
# Oplaa — image web (site vitrine + app web), servie par Caddy en HTTP interne.
#   :80   → site vitrine (site-public/)
#   :8080 → application web (www/)
# Le TLS est géré par le proxy partagé (amui-proxy), pas ici.
# =============================================================================

# --- 1) Compilation de Tailwind (www/tailwind.css) ---------------------------
FROM node:22-alpine AS css
WORKDIR /build
RUN npm install --no-save --no-audit --no-fund tailwindcss@3.4.19
COPY tailwind.config.js ./
COPY www ./www
RUN npx tailwindcss -c tailwind.config.js -i www/tw-input.css -o www/tailwind.css --minify

# --- 2) Serveur statique ------------------------------------------------------
FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY site-public /srv/site
COPY --from=css /build/www /srv/app
RUN rm -f /srv/app/tw-input.css
EXPOSE 80 8080

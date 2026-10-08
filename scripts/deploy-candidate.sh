#!/usr/bin/env bash
# Run over SSH after uploading an already validated release archive.
set -euo pipefail
revision="${1:?full Git revision required}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 2
root=/opt/agenda-crm
release="$root/releases/$revision"
current="$root/current"
candidate="crm-release:$revision"
compose=(docker compose --project-directory "$current" --env-file "$current/.env.production.local" -f "$current/docker-compose.production.yml")
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another CRM deployment is running'; exit 1; }
test -f "$release/release.tgz"
cd "$release"
tar xzf release.tgz
previous=$(docker inspect agenda-crm-app --format '{{.Image}}')
rollback_tag="crm-rollback:$(date -u +%Y%m%dT%H%M%SZ)"
docker tag "$previous" "$rollback_tag"
echo "Previous image preserved as $rollback_tag"
mkdir -p "$root/backups"
backup="$root/backups/pre-$revision-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker exec agenda-crm-db pg_dump -U agenda_crm --clean --if-exists agenda_crm | gzip > "$backup.partial"
gzip -t "$backup.partial"
test "$(stat -c%s "$backup.partial")" -gt 10240
mv "$backup.partial" "$backup"
echo "Backup verified: $backup"

# Reuse dependencies only when the exact lockfile matches; otherwise rebuild.
lock_hash=$(sha256sum package-lock.json | cut -d' ' -f1)
runtime="crm-runtime:${lock_hash:0:16}"
if ! docker image inspect "$runtime" >/dev/null 2>&1; then
  DOCKER_BUILDKIT=0 docker build -f scripts/runtime.Dockerfile --build-arg "BASE=$previous" -t "$runtime" .
fi
test "$(docker run --rm --entrypoint sha256sum "$runtime" /app/package-lock.json | cut -d' ' -f1)" = "$lock_hash"
cat > Dockerfile <<'DOCKERFILE'
ARG RUNTIME
FROM ${RUNTIME}
ARG REVISION
ENV APP_REVISION=$REVISION
LABEL org.opencontainers.image.revision=$REVISION
WORKDIR /app
COPY dist ./dist
COPY dist-server ./dist-server
COPY backend/schema.sql ./dist-server/schema.sql
COPY backend ./backend
DOCKERFILE
DOCKER_BUILDKIT=0 docker build --build-arg "RUNTIME=$runtime" --build-arg "REVISION=$revision" -t "$candidate" .

# Use the existing compose's environment and network, but the candidate image.
override="$release/candidate.yml"
printf 'services:\n  app:\n    image: %s\n' "$candidate" > "$override"
"${compose[@]}" -f "$override" run --rm --no-deps app node dist-server/migrate.js

rollback() {
  echo "Deployment failed; restoring $rollback_tag"
  docker tag "$rollback_tag" current-app:latest
  "${compose[@]}" up -d --no-deps --force-recreate app
  # Migration is additive; do not overwrite live data with the backup.
}
trap 'rollback' ERR
docker tag "$candidate" current-app:latest
"${compose[@]}" up -d --no-deps --force-recreate app
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3020/api/health | grep -q "$revision"; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
curl -fsS --max-time 15 https://crm.avilaops.com/api/health | grep -q "$revision"
trap - ERR
printf '%s\n' "$rollback_tag" > "$release/rollback-image.txt"
echo "Published and verified revision $revision"

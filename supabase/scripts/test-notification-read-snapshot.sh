#!/usr/bin/env bash
# A two-transaction regression test against an explicitly named LOCAL test DB.
set -euo pipefail
container="${NOTIFICATION_TEST_CONTAINER:?Set NOTIFICATION_TEST_CONTAINER to a local Supabase test container}"
[[ "$container" == supabase_db_* ]] || { echo "Expected a local Supabase database container" >&2; exit 1; }
read -r test_user first_row second_row < <(python3 - <<'PY'
import uuid
print(*(str(uuid.uuid4()) for _ in range(3)))
PY
)
created_user=0
writer=""
log_file="$(mktemp /tmp/stubbed-notification-snapshot.XXXXXX)"
sql() { docker exec -i "$container" psql -qAt -U postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  if [[ -n "$writer" ]]; then wait "$writer" 2>/dev/null || true; fi
  if [[ "$created_user" == 1 ]]; then sql -c "delete from auth.users where id='$test_user'" >/dev/null; fi
  rm -f "$log_file"
}
trap cleanup EXIT
created_user=1
sql <<SQL
insert into auth.users(id,email) values('$test_user','snapshot-$test_user@example.test');
insert into public.notifications(id,recipient_id,category,revision) values
 ('$first_row','$test_user','follower',1),('$second_row','$test_user','follower',100);
SQL
# Hold the first row after changing its revision. The later visible row's
# higher revision proves that a global numeric cutoff alone is insufficient.
docker exec "$container" psql -qAt -U postgres -v ON_ERROR_STOP=1 \
  -c BEGIN -c "update public.notifications set revision=2 where id='$first_row'" \
  -c "select pg_advisory_xact_lock(hashtextextended('$test_user',0)); select pg_sleep(4)" -c COMMIT >"$log_file" 2>&1 &
writer=$!
held=false
for _ in {1..40}; do
  available="$(sql -c "select pg_try_advisory_lock(hashtextextended('$test_user',0))")"
  if [[ "$available" == f ]]; then held=true; break; fi
  sleep 0.05
done
[[ "$held" == true ]] || { echo "Writer did not reach the test barrier" >&2; exit 1; }
sql -c 'set role authenticated' \
  -c "select set_config('request.jwt.claims','{\"sub\":\"$test_user\",\"role\":\"authenticated\"}',false)" \
  -c 'select public.notification_read_all()' >/dev/null
wait "$writer"; writer=""
actual="$(sql -c "select revision||':'||read_revision from public.notifications where id='$first_row'")"
[[ "$actual" == '2:1' ]] || { echo "FAIL: concurrent new activity was marked read ($actual)" >&2; exit 1; }
echo "PASS: mark-all preserves concurrent unread activity across transaction commits"

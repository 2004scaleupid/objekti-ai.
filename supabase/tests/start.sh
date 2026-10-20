#!/bin/bash
# käivitab andmebaasi, PostgREST-i, värava ja kõik funktsioonid
cd /var/tmp/h
P=/usr/lib/postgresql/16/bin; T=/var/tmp/v3dpg
su postgres -s /bin/sh -c "$P/pg_ctl -D $T/data status" >/dev/null 2>&1 || su postgres -s /bin/sh -c "$P/pg_ctl -D $T/data -o '-p 5499 -k $T -c listen_addresses=127.0.0.1' -l $T/log start" >/dev/null
sleep 1
# vanad protsessid maha (PID-failide järgi, et mitte tappa valesid)
pkill -f "h/launch.ts" 2>/dev/null; pkill -f "gateway.mjs" 2>/dev/null; pkill -f "h/pgrst.conf" 2>/dev/null; sleep 1; rm -rf pids; mkdir -p pids
sleep 0.5
psql -h $T -p 5499 -U postgres -q -c "drop database if exists v3d with (force)" -c "create database v3d" || exit 1
psql -h $T -p 5499 -U postgres -d v3d -q -v ON_ERROR_STOP=1 -f $T/stub.sql || exit 1
psql -h $T -p 5499 -U postgres -d v3d -q -v ON_ERROR_STOP=1 -f /home/claude/objekti-ai/supabase/migrations/20261020000000_init.sql 2>&1 | grep -v NOTICE
psql -h $T -p 5499 -U postgres -d v3d -q -c "do \$\$ begin if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'x'; end if; end \$\$; grant anon, authenticated, service_role to authenticator; alter role service_role bypassrls;"
cat > pgrst.conf <<C
db-uri = "postgres://authenticator:x@127.0.0.1:5499/v3d"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "super-secret-jwt-token-with-at-least-32-characters-long"
server-port = 3001
server-host = "127.0.0.1"
C
setsid /var/tmp/postgrest /var/tmp/h/pgrst.conf > pgrst.log 2>&1 < /dev/null & echo $! > pids/pgrst
setsid node gateway.mjs > gw.log 2>&1 < /dev/null & echo $! > pids/gw
SERVICE=$(node keys.mjs service)
D=/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/node_modules/.bin/deno
G=http://127.0.0.1:54321
i=8101
for f in ai-image ai-chat widget widget-lead widget-place ehr checkout stripe-webhook; do
  FN=$f PORT=$i FN_FILE=/home/claude/objekti-ai/supabase/functions/$f/index.ts SUPABASE_URL=$G SUPABASE_SERVICE_ROLE_KEY=$SERVICE \
  KIE_API_KEY=k KIE_API_BASE=$G/kie/api/v1 KIE_POLL_MS=50 ANTHROPIC_API_KEY=a ANTHROPIC_API_URL=$G/anthropic RESEND_API_KEY=r RESEND_API_URL=$G/resend \
  STRIPE_SECRET_KEY=sk_test STRIPE_API_URL=$G/stripe STRIPE_WEBHOOK_SECRET=whsec_test EHR_API_URL=$G/ehr PUBLIC_STORAGE_URL=https://x.supabase.co \
  setsid $D run -A --no-prompt /var/tmp/h/launch.ts > fn-$f.log 2>&1 < /dev/null & echo $! > pids/$f
  i=$((i+1))
done
for k in $(seq 1 40); do n=$(cat fn-*.log 2>/dev/null | grep -c "^fn "); [ "$n" -ge 8 ] && break; sleep 1; done
grep -h "^fn\|rror" fn-*.log | head -20; tail -2 pgrst.log; cat gw.log

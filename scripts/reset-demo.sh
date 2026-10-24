#!/usr/bin/env sh
set -eu

if ! command -v supabase >/dev/null 2>&1; then
  printf '%s\n' 'ERROR: Supabase CLI is required to reset the local demo database.' >&2
  exit 127
fi

printf '%s\n' 'Resetting the LOCAL Supabase database to migrations plus seed data...'
supabase db reset --local
printf '%s\n' 'Local demo database reset complete.'

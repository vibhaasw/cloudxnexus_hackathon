#!/usr/bin/env node
/**
 * Smart Warehouse IoT — Local Database Reset Tool (npm run reset)
 * Replaces scripts/reset-demo.sh with cross-platform Node.js implementation.
 * 
 * Rules:
 * - Refuses to run without explicit --confirm flag.
 * - Resets ONLY the local Supabase database via `supabase db reset --local`.
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');

if (!confirmed) {
  console.error('\n===============================================================');
  console.error('  ⚠️ LOCAL DATABASE RESET SAFETY GUARD');
  console.error('===============================================================');
  console.error('Refusing to execute destructive reset without explicit confirmation.');
  console.error('This command drops and recreates the LOCAL Supabase database,');
  console.error('reapplying all migrations and seed data.\n');
  console.error('To proceed, run with --confirm:');
  console.error('  npm run reset -- --confirm\n');
  process.exit(1);
}

console.log('[reset] Checking for Supabase CLI...');
const checkCli = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['supabase'], {
  encoding: 'utf8'
});

if (checkCli.status !== 0) {
  console.error('[reset] Error: Supabase CLI is not installed or not in PATH.');
  console.error('Install via: npm install -g supabase or see https://supabase.com/docs/guides/cli');
  process.exit(127);
}

console.log('[reset] Resetting LOCAL Supabase database (migrations + seed)...');
const resetProc = spawnSync('supabase', ['db', 'reset', '--local'], {
  stdio: 'inherit',
  shell: true
});

if (resetProc.status !== 0) {
  console.error(`[reset] supabase db reset failed with exit code ${resetProc.status}`);
  process.exit(resetProc.status || 1);
}

console.log('[reset] Local demo database reset successfully complete.');

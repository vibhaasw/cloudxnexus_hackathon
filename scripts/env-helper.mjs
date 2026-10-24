/**
 * Smart Warehouse IoT — Shared Environment & Validation Helper
 * 
 * Rules:
 * - Never prints secret values (reports only 'set' or 'missing').
 * - Preserves existing process.env variables (real env vars take priority).
 * - Collects ALL missing or malformed variables in one consolidated message before exiting.
 * - Supports modern Supabase keys (sb_publishable_ / sb_secret_) and legacy keys (anon / service_role).
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const DEFAULT_ENV_PATH = resolve(REPO_ROOT, '.env');

/**
 * Loads .env file using Node.js built-in process.loadEnvFile (v20.6.0+).
 * Real environment variables take priority by default in Node core.
 */
export function loadRootEnv(envPath = DEFAULT_ENV_PATH) {
  if (existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
    } catch (err) {
      console.warn(`[env-helper] Notice: Failed to parse ${envPath}: ${err.message}`);
    }
  }
}

/**
 * Returns resolved Supabase and application keys, supporting modern and legacy names.
 */
export function resolveConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const deviceKey = (process.env.DEVICE_API_KEY || '').trim();
  const registerKey = (process.env.REGISTER_API_KEY || '').trim();
  const unitsPerBox = (process.env.UNITS_PER_BOX || '40').trim();

  return {
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_ANON_KEY: publishableKey, // alias
    SUPABASE_SECRET_KEY: secretKey,
    SUPABASE_SERVICE_ROLE_KEY: secretKey, // alias
    DEVICE_API_KEY: deviceKey,
    REGISTER_API_KEY: registerKey,
    UNITS_PER_BOX: unitsPerBox
  };
}

/**
 * Basic format checks that NEVER echo the secret value.
 */
export function validateKeyFormat(key, type = 'any') {
  if (!key || typeof key !== 'string') return { valid: false, reason: 'missing or empty' };
  const trimmed = key.trim();
  if (trimmed.length < 20) return { valid: false, reason: 'too short (minimum 20 characters)' };
  if (/\s/.test(trimmed)) return { valid: false, reason: 'contains whitespace' };

  const isLegacyJwt = /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
  const isModernPublishable = trimmed.startsWith('sb_publishable_');
  const isModernSecret = trimmed.startsWith('sb_secret_');

  if (type === 'publishable') {
    if (isModernPublishable || isLegacyJwt) return { valid: true, type: isModernPublishable ? 'modern' : 'legacy_jwt' };
    return { valid: false, reason: 'expected modern "sb_publishable_..." or legacy JWT format' };
  }

  if (type === 'secret') {
    if (isModernSecret || isLegacyJwt) return { valid: true, type: isModernSecret ? 'modern' : 'legacy_jwt' };
    return { valid: false, reason: 'expected modern "sb_secret_..." or legacy JWT format' };
  }

  if (isModernPublishable || isModernSecret || isLegacyJwt) return { valid: true };
  return { valid: false, reason: 'unrecognized key format' };
}

export function validateUrl(url) {
  if (!url || typeof url !== 'string') return { valid: false, reason: 'missing or empty' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'protocol must be http: or https:' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'malformed URL' };
  }
}

/**
 * Validates a list of required variables at script start.
 * If any are missing or malformed, lists ALL issues in one message with the exact fix and exits.
 */
export function validateEnv(requiredKeys = [], { scriptName = 'Script' } = {}) {
  const cfg = resolveConfig();
  const errors = [];

  for (const name of requiredKeys) {
    if (name === 'SUPABASE_URL') {
      const check = validateUrl(cfg.SUPABASE_URL);
      if (!check.valid) {
        errors.push({
          name: 'SUPABASE_URL',
          status: cfg.SUPABASE_URL ? 'malformed' : 'missing',
          details: check.reason,
          fix: 'Set SUPABASE_URL="https://<project-id>.supabase.co" in .env or run "npm run setup"'
        });
      }
    } else if (name === 'SUPABASE_ANON_KEY' || name === 'SUPABASE_PUBLISHABLE_KEY') {
      const key = cfg.SUPABASE_PUBLISHABLE_KEY;
      const check = validateKeyFormat(key, 'publishable');
      if (!check.valid) {
        errors.push({
          name: 'SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY',
          status: key ? 'malformed' : 'missing',
          details: check.reason,
          fix: 'Set SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY in .env or run "npm run setup"'
        });
      }
    } else if (name === 'SUPABASE_SERVICE_ROLE_KEY' || name === 'SUPABASE_SECRET_KEY') {
      const key = cfg.SUPABASE_SECRET_KEY;
      const check = validateKeyFormat(key, 'secret');
      if (!check.valid) {
        errors.push({
          name: 'SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY',
          status: key ? 'malformed' : 'missing',
          details: check.reason,
          fix: 'Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in .env or run "npm run setup"'
        });
      }
    } else if (name === 'DEVICE_API_KEY') {
      const key = cfg.DEVICE_API_KEY;
      if (!key) {
        errors.push({
          name: 'DEVICE_API_KEY',
          status: 'missing',
          details: 'required shared secret for scan station',
          fix: 'Run "npm run setup" to generate a 32-byte secret in .env'
        });
      } else if (key.length < 32) {
        errors.push({
          name: 'DEVICE_API_KEY',
          status: 'malformed',
          details: 'must be at least 32 characters',
          fix: 'Run "npm run setup -- --rotate-app-keys" to generate fresh 32-byte keys'
        });
      }
    } else if (name === 'REGISTER_API_KEY') {
      const key = cfg.REGISTER_API_KEY;
      if (!key) {
        errors.push({
          name: 'REGISTER_API_KEY',
          status: 'missing',
          details: 'required shared secret for parcel registration',
          fix: 'Run "npm run setup" to generate a 32-byte secret in .env'
        });
      } else if (key.length < 32) {
        errors.push({
          name: 'REGISTER_API_KEY',
          status: 'malformed',
          details: 'must be at least 32 characters',
          fix: 'Run "npm run setup -- --rotate-app-keys" to generate fresh 32-byte keys'
        });
      }
    } else if (name === 'UNITS_PER_BOX') {
      const n = Number(cfg.UNITS_PER_BOX);
      if (!Number.isInteger(n) || n < 1) {
        errors.push({
          name: 'UNITS_PER_BOX',
          status: 'malformed',
          details: 'must be a positive integer (default 40)',
          fix: 'Set UNITS_PER_BOX=40 in .env'
        });
      }
    }
  }

  // Cross-variable check: DEVICE_API_KEY and REGISTER_API_KEY must never be identical
  if (
    requiredKeys.includes('DEVICE_API_KEY') &&
    requiredKeys.includes('REGISTER_API_KEY') &&
    cfg.DEVICE_API_KEY &&
    cfg.REGISTER_API_KEY &&
    cfg.DEVICE_API_KEY === cfg.REGISTER_API_KEY
  ) {
    errors.push({
      name: 'DEVICE_API_KEY and REGISTER_API_KEY',
      status: 'security conflict',
      details: 'both keys are identical; functions enforce separate scopes',
      fix: 'Run "npm run setup -- --rotate-app-keys" to generate distinct secrets'
    });
  }

  if (errors.length > 0) {
    console.error(`\n===============================================================`);
    console.error(`  CONFIGURATION ERROR: ${errors.length} issue(s) detected for ${scriptName}`);
    console.error(`===============================================================`);
    for (const err of errors) {
      console.error(`  • [${err.status.toUpperCase()}] ${err.name}`);
      console.error(`    Problem: ${err.details}`);
      console.error(`    Fix:     ${err.fix}\n`);
    }
    console.error(`Execution halted before any network calls were attempted.\n`);
    process.exit(2);
  }

  return cfg;
}

/**
 * Returns 'set' or 'missing' status for a variable without printing its value.
 */
export function getStatus(value) {
  return (value && String(value).trim().length > 0) ? 'set' : 'missing';
}

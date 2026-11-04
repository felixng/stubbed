// psql for the crawler. The connection (SUPABASE_DB_URL, default local
// Supabase) goes to psql as PG* environment variables, never argv, and psql's
// own errors are never echoed (they can contain credentials).
import { spawn } from 'node:child_process';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function connectionEnv(url = process.env.SUPABASE_DB_URL ?? LOCAL) {
  const u = new URL(url);
  const env = {
    PGHOST: u.hostname, PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    PGCONNECT_TIMEOUT: '10',
  };
  const ssl = u.searchParams.get('sslmode');
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}

export function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...process.env, ...connectionEnv() }, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Cannot start psql; install the PostgreSQL client')));
    child.on('close', code => {
      if (code !== 0) return reject(new Error('Database operation failed (check connection, privileges and migrations); transaction rolled back'));
      try { resolve(output.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))); }
      catch { reject(new Error('Unexpected database response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}

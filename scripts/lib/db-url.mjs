// Database URL checks for the scripts. Reports structure only – never the URL, user or password.

/** Explains the common ways a pasted value is not a database URL (each causes Prisma P1013). */
export function diagnoseRaw(name, raw) {
  if (raw === undefined) return `${name} is not set.`;
  if (raw.trim() === '') return `${name} is set but empty.`;
  if (raw.trim() === 'System.Security.SecureString') {
    return `${name} contains the text "System.Security.SecureString", not a URL: a SecureString from Read-Host -AsSecureString was assigned directly. Use scripts/neon-env.ps1, which converts it correctly.`;
  }
  if (raw !== raw.trim()) return `${name} has leading or trailing spaces/newlines.`;
  if (/^['"]|['"]$/.test(raw)) return `${name} is wrapped in quotes – remove them.`;
  if (/^psql\s/i.test(raw)) return `${name} contains the "psql '...'" snippet – copy only the connection string (starting with postgresql://).`;
  if (/[<>]|\.\.\.|\bpassword\b@|\bYOUR_|change-me/i.test(raw)) return `${name} still contains a placeholder (<...>, ..., change-me) – paste the real connection string.`;
  if (!/^postgres(ql)?:\/\//.test(raw)) return `${name} does not start with postgresql:// (Prisma P1013: scheme not recognized).`;
  return null;
}

/** Parses a postgres URL into non-secret parts, or returns an error string. */
export function describe(name, raw) {
  const problem = diagnoseRaw(name, raw);
  if (problem) return { error: problem };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: `${name} is not a valid URL. If the password contains special characters (@ : / ? # % space) they must be percent-encoded.` };
  }
  if (url.hash) return { error: `${name} contains an unencoded "#" (password?) – percent-encode it as %23.` };
  if (!url.hostname) return { error: `${name} has no host name.` };
  if (!url.username) return { error: `${name} has no user name.` };
  if (!url.password) return { error: `${name} has no password.` };
  try {
    decodeURIComponent(url.password);
  } catch {
    return { error: `${name}: the password contains a "%" that is not valid percent-encoding – encode it as %25.` };
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    host: url.hostname,
    port: url.port || '5432',
    database,
    user: decodeURIComponent(url.username),
    params: Object.fromEntries(url.searchParams),
    local: ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname),
  };
}

/** Neon rules: pooled vs direct hosts, same endpoint/user/database, TLS. Returns { errors, warnings, info }. */
export function checkNeonPair(pooledRaw, directRaw, expectedDatabase = 'neondb') {
  const errors = [];
  const warnings = [];
  const pooled = describe('DATABASE_URL', pooledRaw);
  const direct = describe('DIRECT_URL', directRaw);
  if (pooled.error) errors.push(pooled.error);
  if (direct.error) errors.push(direct.error);
  if (errors.length) return { errors, warnings };

  for (const [name, d] of [['DATABASE_URL', pooled], ['DIRECT_URL', direct]]) {
    if (!d.host.endsWith('.neon.tech')) errors.push(`${name} host is not a Neon host (*.neon.tech).`);
    if (d.database !== expectedDatabase) errors.push(`${name} database is "${d.database}", expected "${expectedDatabase}".`);
    const ssl = d.params.sslmode;
    if (!['require', 'verify-full', 'verify-ca'].includes(ssl)) errors.push(`${name} must include sslmode=require (Neon accepts TLS connections only).`);
  }
  const pooledLabel = pooled.host.split('.')[0];
  const directLabel = direct.host.split('.')[0];
  if (!pooledLabel.endsWith('-pooler')) errors.push('DATABASE_URL must be the POOLED connection (host contains "-pooler").');
  if (directLabel.endsWith('-pooler')) errors.push('DIRECT_URL must be the DIRECT connection (host without "-pooler").');
  if (pooledLabel.replace(/-pooler$/, '') !== directLabel || pooled.host.split('.').slice(1).join('.') !== direct.host.split('.').slice(1).join('.')) {
    errors.push('DATABASE_URL and DIRECT_URL point to different Neon endpoints.');
  }
  if (pooled.user !== direct.user) errors.push('DATABASE_URL and DIRECT_URL use different database users.');

  if (!pooled.params.connect_timeout) warnings.push('DATABASE_URL has no connect_timeout; Neon recommends connect_timeout=15 so cold starts do not time out.');
  return {
    errors,
    warnings,
    info: {
      pooledHost: pooled.host, directHost: direct.host, database: direct.database,
      pooledParams: Object.keys(pooled.params), directParams: Object.keys(direct.params),
    },
  };
}

/** Removes anything that looks like a connection string or credentials from command output. */
export function redact(text, secrets = []) {
  let out = String(text).replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://***');
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('***');
  return out;
}

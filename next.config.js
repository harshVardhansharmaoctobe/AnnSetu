/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// 'unsafe-inline' scripts are required by Next.js' inline bootstrap without a nonce-based setup;
// everything else is locked to this origin, plus OpenStreetMap tiles for the map.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
];

const nextConfig = {
  poweredByHeader: false,
  images: {
    // Disabled until the image configuration is reviewed: the previous '**' remotePatterns let the
    // optimizer fetch from any host. Serve images as-is instead.
    unoptimized: true,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Uploaded images set their own stricter sandbox CSP in src/app/api/uploads/[name]/route.ts.
      { source: '/((?!api/uploads/).*)', headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }] },
    ];
  },
};

module.exports = nextConfig;

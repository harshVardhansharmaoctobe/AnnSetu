/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Disabled until the image configuration is reviewed: the previous '**' remotePatterns let the
    // optimizer fetch from any host. Serve images as-is instead.
    unoptimized: true,
  },
};

module.exports = nextConfig;

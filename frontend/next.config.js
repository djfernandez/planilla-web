/** @type {import('next').NextConfig} */
const api = process.env.API_URL || 'http://localhost:3001';

const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

module.exports = nextConfig;

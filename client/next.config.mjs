const API_URL = process.env.API_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to the Express API so the browser never deals with CORS or a second origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;

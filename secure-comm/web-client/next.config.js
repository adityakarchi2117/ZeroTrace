/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Only proxy to localhost in development; on Vercel the frontend
    // talks directly to the Render backend via NEXT_PUBLIC_API_URL
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8000/ws/:path*',
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias['@'] = require('path').join(__dirname, 'src');
    return config;
  },
};

module.exports = nextConfig;


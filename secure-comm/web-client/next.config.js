/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
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

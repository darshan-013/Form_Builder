/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Proxy all /api/* calls to the Spring Boot backend on port 8080.
   * This makes session cookies work seamlessly (same-origin from browser's POV).
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Proxy all /api/* calls to the Spring Boot backend on port 8080.
   * The browser only ever talks to localhost:3000, so JSESSIONID is a
   * first-party cookie — Edge/Chrome Tracking Prevention does NOT block it.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
    ];
  },

  /**
   * Response headers for proxied API routes.
   * credentials: 'include' on the fetch side + these headers = cookies always flow.
   */
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',      value: 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Methods',     value: 'GET,POST,PUT,DELETE,OPTIONS,PATCH' },
          { key: 'Access-Control-Allow-Headers',     value: 'Content-Type, Authorization, X-Requested-With' },
        ],
      },
    ];
  },
};

export default nextConfig;

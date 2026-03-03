/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Proxy all /api/* calls to the Spring Boot backend on port 8080.
   * This makes session cookies work seamlessly — the browser only ever
   * talks to localhost:3000, so the JSESSIONID cookie is set on :3000
   * and Edge/Chrome tracking prevention does NOT block it.
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
   * Forward all headers including Set-Cookie from the backend through the proxy.
   * This ensures the session cookie set by Spring Security reaches the browser
   * as if it came from localhost:3000 (the Next.js origin).
   */
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ];
  },
};

export default nextConfig;

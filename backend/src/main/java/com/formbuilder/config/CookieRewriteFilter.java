package com.formbuilder.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Rewrites the Set-Cookie header on every response so that:
 *  - No Domain attribute is set (browser uses the responding host = localhost:3000 via proxy)
 *  - SameSite=Strict is present (Edge Tracking Prevention does NOT block Strict cookies
 *    on same-origin requests; it only targets Lax/None cookies from embedded contexts)
 *  - HttpOnly is present
 *  - Path=/ is present
 *
 * This is needed because Next.js rewrites /api/* → localhost:8080 at the network level,
 * but the browser still sees the response as coming from localhost:3000.
 * Without this filter the cookie would be scoped to :8080 and Edge blocks it.
 */
@Component
@Order(1)
public class CookieRewriteFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletResponse httpResponse = (HttpServletResponse) response;
        CookieResponseWrapper wrapper = new CookieResponseWrapper(httpResponse);
        chain.doFilter(request, wrapper);
        wrapper.flushRewrittenCookies();
    }

    // ── Wrapper that intercepts Set-Cookie headers ─────────────────────────────

    private static class CookieResponseWrapper extends HttpServletResponseWrapper {

        private final List<String> setCookieHeaders = new ArrayList<>();
        private final HttpServletResponse original;

        CookieResponseWrapper(HttpServletResponse response) {
            super(response);
            this.original = response;
        }

        @Override
        public void addHeader(String name, String value) {
            if ("Set-Cookie".equalsIgnoreCase(name)) {
                setCookieHeaders.add(rewrite(value));
            } else {
                super.addHeader(name, value);
            }
        }

        @Override
        public void setHeader(String name, String value) {
            if ("Set-Cookie".equalsIgnoreCase(name)) {
                setCookieHeaders.clear();
                setCookieHeaders.add(rewrite(value));
            } else {
                super.setHeader(name, value);
            }
        }

        @Override
        public Collection<String> getHeaders(String name) {
            if ("Set-Cookie".equalsIgnoreCase(name)) return setCookieHeaders;
            return super.getHeaders(name);
        }

        void flushRewrittenCookies() {
            for (String cookie : setCookieHeaders) {
                original.addHeader("Set-Cookie", cookie);
            }
        }

        /**
         * Rewrite a Set-Cookie string:
         *  - Strip Domain= attribute entirely (so it defaults to the proxy origin :3000)
         *  - Ensure SameSite=Lax
         *  - Ensure HttpOnly
         *  - Ensure Path=/
         */
        private String rewrite(String original) {
            // Split on "; " preserving the parts
            String[] parts = original.split(";");
            List<String> kept = new ArrayList<>();

            boolean hasSameSite = false;
            boolean hasHttpOnly  = false;
            boolean hasPath      = false;

            for (String part : parts) {
                String trimmed = part.trim();
                String lower   = trimmed.toLowerCase();

                if (lower.startsWith("domain=")) continue;               // strip domain
                if (lower.startsWith("samesite=")) { hasSameSite = true; kept.add("SameSite=Strict"); continue; }
                if (lower.equals("httponly"))       { hasHttpOnly  = true; }
                if (lower.startsWith("path="))      { hasPath      = true; }

                kept.add(trimmed);
            }

            if (!hasSameSite) kept.add("SameSite=Strict");
            if (!hasHttpOnly)  kept.add("HttpOnly");
            if (!hasPath)      kept.add("Path=/");

            return String.join("; ", kept);
        }
    }
}

package com.formbuilder.config;

import jakarta.servlet.SessionCookieConfig;
import jakarta.servlet.ServletContext;
import org.springframework.boot.web.servlet.ServletContextInitializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /**
     * Configure the JSESSIONID cookie so Edge / Chrome tracking prevention
     * does NOT block it when the Next.js proxy (port 3000) forwards to Spring (port 8080).
     *
     * Key settings:
     *  - domain left null  → browser scopes cookie to the responding host only
     *  - sameSite = Lax    → sent on top-level navigations, not blocked as third-party
     *  - httpOnly = true   → JS cannot read it (security)
     *  - secure = false    → works over plain HTTP in dev (set true in prod)
     */
    @Bean
    public ServletContextInitializer sessionCookieInitializer() {
        return (ServletContext ctx) -> {
            SessionCookieConfig config = ctx.getSessionCookieConfig();
            config.setHttpOnly(true);
            config.setSecure(false);       // flip to true in production
            // Do NOT set domain — let browser use the origin host automatically
            // This prevents the cross-port cookie blocking in Edge
        };
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:3000", "http://127.0.0.1:3000")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("Set-Cookie")          // allow frontend to see Set-Cookie
                .allowCredentials(true)                // required for session cookies
                .maxAge(3600);
    }
}

package com.formbuilder.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.JdbcUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

import javax.sql.DataSource;
import java.util.Map;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final ObjectMapper mapper = new ObjectMapper();

    // ── Beans ────────────────────────────────────────────────────────────────

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * JdbcUserDetailsManager reads/writes the 'users' and 'authorities' tables
     * created by users_schema.sql (Spring Security expected column names).
     */
    @Bean
    public JdbcUserDetailsManager userDetailsManager(DataSource dataSource) {
        return new JdbcUserDetailsManager(dataSource);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    // ── Filter Chain ─────────────────────────────────────────────────────────

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // CSRF disabled (REST API + session cookie — revisit if adding CSRF token header)
            .csrf(csrf -> csrf.disable())

            // ── Authorization rules ──────────────────────────────────────────
            .authorizeHttpRequests(auth -> auth
                // Auth endpoints: public
                .requestMatchers("/api/auth/**").permitAll()
                // Public form read (needed for preview/submission page)
                .requestMatchers(HttpMethod.GET,  "/api/forms/{id}").permitAll()
                // Public form render (resolves dropdown schema options for renderer)
                .requestMatchers(HttpMethod.GET,  "/api/forms/{id}/render").permitAll()
                // Public form submission
                .requestMatchers(HttpMethod.POST, "/api/forms/{id}/submit").permitAll()
                // Everything else under /api/forms requires authentication
                .requestMatchers("/api/forms/**").authenticated()
                // Shared options — authenticated admin only
                .requestMatchers("/api/shared-options/**").authenticated()
                .anyRequest().permitAll()
            )

            // ── Form-based login (Spring Security processes POST /api/auth/login) ──
            // Frontend sends application/x-www-form-urlencoded { username, password }
            .formLogin(form -> form
                .loginProcessingUrl("/api/auth/login")
                .successHandler((req, res, auth) -> {
                    res.setStatus(HttpStatus.OK.value());
                    res.setContentType("application/json");
                    res.getWriter().write(mapper.writeValueAsString(Map.of(
                        "username",    auth.getName(),
                        "authorities", auth.getAuthorities().stream()
                                           .map(a -> a.getAuthority()).toList()
                    )));
                })
                .failureHandler((req, res, ex) -> {
                    res.setStatus(HttpStatus.UNAUTHORIZED.value());
                    res.setContentType("application/json");
                    res.getWriter().write(mapper.writeValueAsString(
                        Map.of("error", "Invalid username or password")
                    ));
                })
                .permitAll()
            )

            // ── Logout ───────────────────────────────────────────────────────
            .logout(logout -> logout
                .logoutUrl("/api/auth/logout")
                .logoutSuccessHandler((req, res, auth) -> {
                    res.setStatus(HttpStatus.OK.value());
                    res.setContentType("application/json");
                    res.getWriter().write("{\"message\":\"Logged out successfully\"}");
                })
                .permitAll()
            )

            // ── 401 JSON for unauthenticated API calls ───────────────────────
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, authEx) -> {
                    res.setStatus(HttpStatus.UNAUTHORIZED.value());
                    res.setContentType("application/json");
                    res.getWriter().write("{\"error\":\"Authentication required\"}");
                })
            )

            // ── Session management ───────────────────────────────────────────
            .sessionManagement(session -> session
                .maximumSessions(10)      // max concurrent sessions per user
            );

        return http.build();
    }
}

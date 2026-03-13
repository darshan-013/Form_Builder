package com.formbuilder.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.rbac.security.RbacUserDetailsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

import jakarta.servlet.http.HttpSession;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final ObjectMapper mapper = new ObjectMapper();
    private final JdbcTemplate jdbc;
    private final RbacUserDetailsService rbacUserDetailsService;

    // ── Beans ────────────────────────────────────────────────────────────────

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * DaoAuthenticationProvider uses our custom RbacUserDetailsService
     * to authenticate against the rbac_users table directly.
     * No more JdbcUserDetailsManager or Spring Security users/authorities tables.
     */
    @Bean
    public DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(rbacUserDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    // ── Filter Chain ─────────────────────────────────────────────────────────

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .authenticationProvider(authenticationProvider())

            // CSRF disabled (REST API + session cookie)
            .csrf(csrf -> csrf.disable())

            // ── Authorization rules ──────────────────────────────────────────
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET,  "/api/forms/{id}").permitAll()
                .requestMatchers(HttpMethod.GET,  "/api/forms/{id}/render").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/forms/{id}/submit").permitAll()
                .requestMatchers("/api/forms/**").authenticated()
                .requestMatchers("/api/shared-options/**").authenticated()
                .requestMatchers("/api/roles/**").authenticated()
                .requestMatchers("/api/users/**").authenticated()
                .requestMatchers("/api/logs/**").authenticated()
                .requestMatchers("/api/workflows/**").authenticated()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .anyRequest().permitAll()
            )

            // ── Form-based login ─────────────────────────────────────────────
            .formLogin(form -> form
                .loginProcessingUrl("/api/auth/login")
                .successHandler((req, res, auth) -> {
                    // ── Build response with RBAC data ──
                    Map<String, Object> response = new LinkedHashMap<>();
                    response.put("username", auth.getName());
                    response.put("authorities", auth.getAuthorities().stream()
                            .map(a -> a.getAuthority()).toList());

                    try {
                        List<Map<String, Object>> rows = jdbc.queryForList(
                                "SELECT id, username, name, email FROM rbac_users WHERE username = ?",
                                auth.getName());
                        if (!rows.isEmpty()) {
                            Map<String, Object> rbacUser = rows.get(0);
                            Integer userId = (Integer) rbacUser.get("id");

                            // Store in session for PermissionInterceptor
                            HttpSession session = req.getSession(true);
                            session.setAttribute("USER_ID", userId);
                            log.debug("Stored USER_ID={} in session for '{}'", userId, auth.getName());

                            response.put("userId", userId);
                            response.put("name", rbacUser.get("name"));
                            response.put("email", rbacUser.get("email"));

                            // Fetch roles
                            List<Map<String, Object>> roleRows = jdbc.queryForList(
                                    "SELECT r.id, r.role_name, r.is_system_role " +
                                    "FROM user_roles ur JOIN roles r ON r.id = ur.role_id " +
                                    "WHERE ur.user_id = ? ORDER BY r.role_name",
                                    userId);
                            response.put("roles", roleRows.stream().map(row -> {
                                Map<String, Object> role = new LinkedHashMap<>();
                                role.put("id", row.get("id"));
                                role.put("roleName", row.get("role_name"));
                                role.put("isSystemRole", row.get("is_system_role"));
                                return role;
                            }).toList());

                            // Fetch effective permissions
                            List<String> perms = jdbc.queryForList(
                                    "SELECT DISTINCT p.permission_key " +
                                    "FROM user_roles ur " +
                                    "JOIN role_permissions rp ON rp.role_id = ur.role_id " +
                                    "JOIN permissions p ON p.id = rp.permission_id " +
                                    "WHERE ur.user_id = ? ORDER BY p.permission_key",
                                    String.class, userId);
                            response.put("permissions", perms);
                        } else {
                            log.warn("No RBAC profile found for '{}' after successful auth", auth.getName());
                            response.put("roles", List.of());
                            response.put("permissions", List.of());
                        }
                    } catch (Exception e) {
                        log.warn("Could not resolve RBAC profile for '{}': {}", auth.getName(), e.getMessage());
                        response.put("roles", List.of());
                        response.put("permissions", List.of());
                    }

                    res.setStatus(HttpStatus.OK.value());
                    res.setContentType("application/json");
                    res.getWriter().write(mapper.writeValueAsString(response));
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
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID")
                .clearAuthentication(true)
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
                .maximumSessions(10)
            );

        return http.build();
    }
}

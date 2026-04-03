package com.formbuilder.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.formbuilder.constants.AppConstants;
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

            .csrf(csrf -> csrf.disable())

            // ── Authorization rules (v1 only, using AppConstants) ────────────
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(AppConstants.API_AUTH + "/**").permitAll()
                // Public form render and submit
                .requestMatchers(HttpMethod.GET,  AppConstants.API_FORMS + "/{id}/render").permitAll()
                .requestMatchers(HttpMethod.POST, AppConstants.API_FORMS + "/{id}/submit").permitAll()
                .requestMatchers(HttpMethod.POST, AppConstants.API_RUNTIME + "/forms/{id}/submit").permitAll()
                .requestMatchers(HttpMethod.GET,  AppConstants.API_RUNTIME + "/forms/{idOrCode}").permitAll()
                // Authenticated endpoints
                .requestMatchers(AppConstants.API_FORMS + "/**").authenticated()
                .requestMatchers(AppConstants.API_RUNTIME + "/**").authenticated()
                .requestMatchers(AppConstants.API_SHARED_OPTIONS + "/**").authenticated()
                .requestMatchers(AppConstants.API_ROLES + "/**").authenticated()
                .requestMatchers(AppConstants.API_USERS + "/**").authenticated()
                .requestMatchers(AppConstants.API_LOGS + "/**").authenticated()
                .requestMatchers(AppConstants.API_WORKFLOWS + "/**").authenticated()
                .requestMatchers(AppConstants.API_ADMIN + "/**").authenticated()
                .requestMatchers(AppConstants.API_PROFILE + "/**").authenticated()
                .requestMatchers(AppConstants.API_MENUS + "/**").authenticated()
                .requestMatchers(AppConstants.API_MODULES + "/**").authenticated()
                .requestMatchers(AppConstants.API_FILES + "/**").authenticated()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .anyRequest().permitAll()
            )

            // ── Form-based login ─────────────────────────────────────────────
            .formLogin(form -> form
                .loginProcessingUrl(AppConstants.API_AUTH + AppConstants.AUTH_LOGIN)
                .successHandler((req, res, auth) -> {
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

                            HttpSession session = req.getSession(true);
                            session.setAttribute("USER_ID", userId);
                            log.debug("Stored USER_ID={} in session for '{}'", userId, auth.getName());

                            response.put("userId", userId);
                            response.put("name", rbacUser.get("name"));
                            response.put("email", rbacUser.get("email"));

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
                .logoutUrl(AppConstants.API_AUTH + AppConstants.AUTH_LOGOUT)
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

            .sessionManagement(session -> session
                .maximumSessions(10)
            );

        return http.build();
    }
}

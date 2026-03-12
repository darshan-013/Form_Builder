package com.formbuilder.rbac.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Spring MVC HandlerInterceptor that enforces the {@link RequirePermission}
 * annotation on controller methods and classes.
 *
 * <h3>Flow:</h3>
 * <ol>
 *   <li>Check if the handler method (or its declaring class) has {@code @RequirePermission}</li>
 *   <li>Extract {@code USER_ID} from the HttpSession</li>
 *   <li>Run a single SQL query to resolve all permission keys for that user</li>
 *   <li>Verify the required permission exists in the resolved set</li>
 *   <li>If missing → write HTTP 403 JSON response and return {@code false}</li>
 * </ol>
 *
 * <h3>SQL used (exactly as specified):</h3>
 * <pre>
 * SELECT DISTINCT p.permission_key
 * FROM user_roles ur
 * JOIN role_permissions rp ON rp.role_id = ur.role_id
 * JOIN permissions p ON p.id = rp.permission_id
 * WHERE ur.user_id = ?
 * </pre>
 *
 * <h3>Session contract:</h3>
 * On login, SecurityConfig stores:
 * {@code session.setAttribute("USER_ID", rbacUserId)}
 * where rbacUserId is the integer PK from the rbac_users table.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PermissionInterceptor implements HandlerInterceptor {

    /** Session attribute key — set by SecurityConfig login success handler. */
    public static final String SESSION_USER_ID = "USER_ID";

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * Permission resolution query — single JOIN across the three RBAC tables.
     * Returns all distinct permission keys for a given rbac_users.id.
     */
    private static final String PERMISSION_SQL = """
            SELECT DISTINCT p.permission_key
            FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = ?
            """;

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        // ── 1. Only intercept controller handler methods ─────────────────
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true; // static resources, OPTIONS preflight, etc. — pass through
        }

        // ── 2. Find @RequirePermission on method or class ────────────────
        RequirePermission annotation = handlerMethod.getMethodAnnotation(RequirePermission.class);
        if (annotation == null) {
            // Check class-level annotation
            annotation = handlerMethod.getBeanType().getAnnotation(RequirePermission.class);
        }
        if (annotation == null) {
            return true; // no permission gate on this endpoint — pass through
        }

        String requiredPermission = annotation.value();

        // ── 3. Extract USER_ID from session ──────────────────────────────
        HttpSession session = request.getSession(false);
        if (session == null) {
            log.warn("Permission gate: no session — blocking access to {} {}",
                    request.getMethod(), request.getRequestURI());
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                    "Authentication required");
            return false;
        }

        Object userIdObj = session.getAttribute(SESSION_USER_ID);
        if (userIdObj == null) {
            log.warn("Permission gate: USER_ID not in session — blocking access to {} {}",
                    request.getMethod(), request.getRequestURI());
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                    "Authentication required. Please log in.");
            return false;
        }

        Integer userId;
        try {
            userId = (Integer) userIdObj;
        } catch (ClassCastException e) {
            log.error("Permission gate: USER_ID in session is not Integer: {}", userIdObj.getClass());
            writeError(response, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "Session data corrupted. Please log in again.");
            return false;
        }

        // ── 4. Resolve user's permissions via JDBC ───────────────────────
        Set<String> userPermissions = resolvePermissions(userId);

        // ── 5. Check required permission ─────────────────────────────────
        if (userPermissions.contains(requiredPermission)) {
            log.debug("Permission gate: GRANTED '{}' for userId={} on {} {}",
                    requiredPermission, userId, request.getMethod(), request.getRequestURI());
            return true;
        }

        // ── 6. Permission denied — 403 ──────────────────────────────────
        log.warn("Permission gate: DENIED '{}' for userId={} on {} {} — user has: {}",
                requiredPermission, userId, request.getMethod(), request.getRequestURI(),
                userPermissions);
        writeError(response, HttpServletResponse.SC_FORBIDDEN,
                "Access denied. Required permission: " + requiredPermission);
        return false;
    }

    /**
     * Resolves all permission keys for a user via the exact SQL specified.
     * Returns an empty set if the user has no roles/permissions assigned.
     *
     * @param userId the rbac_users.id (stored in session as USER_ID)
     * @return set of permission key strings, e.g. {"READ", "WRITE", "MANAGE"}
     */
    private Set<String> resolvePermissions(Integer userId) {
        try {
            List<String> keys = jdbc.queryForList(PERMISSION_SQL, String.class, userId);
            return Set.copyOf(keys);
        } catch (Exception e) {
            log.error("Permission gate: failed to resolve permissions for userId={}: {}",
                    userId, e.getMessage());
            return Set.of(); // deny by default on query failure
        }
    }

    /**
     * Writes a JSON error response. Matches the project's existing error format:
     * { "error": "message" }
     */
    private void writeError(HttpServletResponse response, int status, String message)
            throws Exception {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(mapper.writeValueAsString(Map.of("error", message)));
    }
}



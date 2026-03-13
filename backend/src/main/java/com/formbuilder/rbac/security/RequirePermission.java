package com.formbuilder.rbac.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Permission gate annotation for controller methods (or entire controllers).
 *
 * When placed on a handler method, the
 * {@link com.formbuilder.rbac.security.PermissionInterceptor} verifies
 * that the authenticated user holds the required permission before the method
 * executes. If the permission is missing → HTTP 403 Forbidden.
 *
 * Usage:
 * <pre>
 *   &#64;RequirePermission("MANAGE")
 *   &#64;PostMapping("/roles")
 *   public ResponseEntity&lt;?&gt; createRole(...) { ... }
 * </pre>
 *
 * Can also be placed at class level to gate all methods in a controller:
 * <pre>
 *   &#64;RequirePermission("READ")
 *   &#64;RestController
 *   public class ReportController { ... }
 * </pre>
 *
 * Multiple permissions are not supported in a single annotation.
 * Use multiple annotations or compose at the service level if needed.
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {

    /**
     * The permission key required to access this endpoint.
     * Must match one of the fixed permission_key values in the permissions table:
     * READ, WRITE, EDIT, DELETE, MANAGE, EXPORT, VISIBILITY, AUDIT
     */
    String value();
}



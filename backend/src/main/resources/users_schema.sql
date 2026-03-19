/*
-- =============================================================
--  Dynamic Form Builder — Users / Auth Schema
--  PostgreSQL 17
--  Spring Security JdbcUserDetailsManager compatible schema.
--  These are the EXACT table/column names Spring Security
--  expects when configured with JdbcUserDetailsManager.
-- =============================================================

-- Spring Boot SQL Script Separator
--;

-- ─────────────────────────────────────────────
--  TABLE: users
--  Stores admin credentials (BCrypt hashed pw).
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    username   VARCHAR(100) NOT NULL PRIMARY KEY,
    password   VARCHAR(255) NOT NULL,   -- BCrypt encoded
    enabled    BOOLEAN      NOT NULL DEFAULT TRUE
)^

-- ─────────────────────────────────────────────
--  TABLE: authorities
--  Stores granted roles per user.
--  Spring Security requires this table name exactly.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authorities (
    username   VARCHAR(100) NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    authority  VARCHAR(50)  NOT NULL,
    CONSTRAINT uq_user_authority UNIQUE (username, authority)
)^

COMMENT ON TABLE users       IS 'Admin accounts managed by Spring Security JdbcUserDetailsManager.'^
COMMENT ON TABLE authorities IS 'Roles/permissions per user. Spring Security reads this via UserDetailsService.'^
*/

package com.formbuilder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AtomicBoolean ensured = new AtomicBoolean(false);

    private void ensureAuditLogStore() {
        if (ensured.get()) {
            return;
        }
        synchronized (ensured) {
            if (ensured.get()) {
                return;
            }
            jdbc.execute("CREATE TABLE IF NOT EXISTS audit_logs (" +
                    "id BIGSERIAL PRIMARY KEY, " +
                    "action VARCHAR(60) NOT NULL, " +
                    "performed_by_user_id INT, " +
                    "performed_by_username VARCHAR(100) NOT NULL, " +
                    "target_entity VARCHAR(30) NOT NULL, " +
                    "target_entity_id VARCHAR(100), " +
                    "description TEXT NOT NULL, " +
                    "created_at TIMESTAMP NOT NULL DEFAULT NOW(), " +
                    "metadata JSONB, " +
                    "related_role_id INT, " +
                    "related_role_name VARCHAR(100), " +
                    "related_user_id INT, " +
                    "related_username VARCHAR(100))");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by_username)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_role ON audit_logs(related_role_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(related_user_id)");
            ensured.set(true);
        }
    }

    public void logEvent(
            String action,
            Integer performedByUserId,
            String performedByUsername,
            String targetEntity,
            String targetEntityId,
            String description,
            Map<String, Object> metadata,
            Integer relatedRoleId,
            String relatedRoleName,
            Integer relatedUserId,
            String relatedUsername) {

        try {
            ensureAuditLogStore();
            String metadataJson = metadata == null || metadata.isEmpty() ? null : objectMapper.writeValueAsString(metadata);
            jdbc.update(
                    "INSERT INTO audit_logs (" +
                            "action, performed_by_user_id, performed_by_username, target_entity, target_entity_id, description, metadata, " +
                            "related_role_id, related_role_name, related_user_id, related_username" +
                            ") VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)",
                    action,
                    performedByUserId,
                    performedByUsername == null || performedByUsername.isBlank() ? "unknown" : performedByUsername,
                    targetEntity,
                    targetEntityId,
                    description,
                    metadataJson,
                    relatedRoleId,
                    relatedRoleName,
                    relatedUserId,
                    relatedUsername
            );
        } catch (JsonProcessingException e) {
            log.warn("Audit log metadata serialization failed for action {}: {}", action, e.getMessage());
        } catch (Exception e) {
            // Never break business flow because audit logging failed.
            log.warn("Audit logging failed for action {}: {}", action, e.getMessage());
        }
    }

    public List<Map<String, Object>> getAdminLogs(String action, String user, LocalDate fromDate, LocalDate toDate) {
        ensureAuditLogStore();
        StringBuilder sql = new StringBuilder(
                "SELECT id, action, performed_by_user_id, performed_by_username, target_entity, target_entity_id, " +
                        "description, created_at, metadata " +
                        "FROM audit_logs WHERE 1=1");

        List<Object> params = new ArrayList<>();

        if (action != null && !action.isBlank()) {
            sql.append(" AND action = ?");
            params.add(action.trim());
        }
        if (user != null && !user.isBlank()) {
            sql.append(" AND performed_by_username ILIKE ?");
            params.add("%" + user.trim() + "%");
        }
        if (fromDate != null) {
            sql.append(" AND created_at >= ?");
            params.add(fromDate.atStartOfDay());
        }
        if (toDate != null) {
            sql.append(" AND created_at < ?");
            params.add(toDate.plusDays(1).atStartOfDay());
        }

        sql.append(" ORDER BY created_at DESC");
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    public List<Map<String, Object>> getRoleAssignmentLogs(Integer roleId, String username, LocalDate fromDate, LocalDate toDate) {
        ensureAuditLogStore();
        StringBuilder sql = new StringBuilder(
                "SELECT id, action, created_at, performed_by_username, description, " +
                        "related_role_id, related_role_name, related_user_id, related_username " +
                        "FROM audit_logs " +
                        "WHERE action IN ('ASSIGN_ROLE', 'REMOVE_ROLE', 'UPDATE_PERMISSION')");

        List<Object> params = new ArrayList<>();

        if (roleId != null) {
            sql.append(" AND related_role_id = ?");
            params.add(roleId);
        }
        if (username != null && !username.isBlank()) {
            sql.append(" AND related_username ILIKE ?");
            params.add("%" + username.trim() + "%");
        }
        if (fromDate != null) {
            sql.append(" AND created_at >= ?");
            params.add(fromDate.atStartOfDay());
        }
        if (toDate != null) {
            sql.append(" AND created_at < ?");
            params.add(toDate.plusDays(1).atStartOfDay());
        }

        sql.append(" ORDER BY created_at DESC");
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    public Integer getSessionUserId(Object sessionUserId) {
        if (sessionUserId instanceof Integer) {
            return (Integer) sessionUserId;
        }
        return null;
    }

    public LocalDateTime now() {
        return LocalDateTime.now();
    }
}



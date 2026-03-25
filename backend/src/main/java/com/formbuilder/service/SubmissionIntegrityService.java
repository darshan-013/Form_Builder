package com.formbuilder.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubmissionIntegrityService {

    private final JdbcTemplate jdbc;
    private static final Pattern TABLE_NAME_PATTERN = Pattern.compile("^form_data_[a-z0-9_]+$");

    /**
     * Finds submissions where the form_version_id in form_submission_meta 
     * does not match the form_version_id in the dynamic data table.
     */
    public List<Map<String, Object>> findVersionMismatches(UUID formId) {
        String tableName = "form_data_" + formId.toString().replace("-", "_");
        validateTableName(tableName);

        String sql = String.format(
            "SELECT m.id as submission_id, m.form_version_id as meta_version, d.form_version_id as data_version " +
            "FROM form_submission_meta m " +
            "JOIN %s d ON m.id = d.id " +
            "WHERE m.form_id = ? AND m.form_version_id != d.form_version_id",
            tableName
        );

        return jdbc.queryForList(sql, formId);
    }

    /**
     * Finds rows in form_submission_meta that have no corresponding row in the dynamic data table.
     */
    public List<Map<String, Object>> findOrphanedMetaRows(UUID formId) {
        String tableName = "form_data_" + formId.toString().replace("-", "_");
        validateTableName(tableName);

        String sql = String.format(
            "SELECT m.id as submission_id, m.status, m.created_at " +
            "FROM form_submission_meta m " +
            "LEFT JOIN %s d ON m.id = d.id " +
            "WHERE m.form_id = ? AND d.id IS NULL",
            tableName
        );

        return jdbc.queryForList(sql, formId);
    }

    private void validateTableName(String tableName) {
        if (!TABLE_NAME_PATTERN.matcher(tableName).matches()) {
            throw new IllegalArgumentException("Invalid table name format: " + tableName);
        }
    }
}

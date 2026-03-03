package com.formbuilder.repository;

import com.formbuilder.model.Form;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class FormRepository {

    private final JdbcTemplate jdbc;

    // ── Queries ───────────────────────────────────────────────────────────────

    public List<Form> findAll() {
        return jdbc.query(
                "SELECT * FROM forms ORDER BY created_at DESC",
                rowMapper());
    }

    public Optional<Form> findById(UUID id) {
        List<Form> rows = jdbc.query(
                "SELECT * FROM forms WHERE id = ?", rowMapper(), id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    public Form save(Form form) {
        String sql = """
                INSERT INTO forms (name, description, table_name, created_at, updated_at)
                VALUES (?, ?, ?, NOW(), NOW())
                RETURNING *
                """;
        return jdbc.queryForObject(sql, rowMapper(),
                form.getName(), form.getDescription(), form.getTableName());
    }

    public Form update(Form form) {
        String sql = """
                UPDATE forms
                SET name = ?, description = ?, updated_at = NOW()
                WHERE id = ?
                RETURNING *
                """;
        return jdbc.queryForObject(sql, rowMapper(),
                form.getName(), form.getDescription(), form.getId());
    }

    public void deleteById(UUID id) {
        jdbc.update("DELETE FROM forms WHERE id = ?", id);
    }

    // ── RowMapper ─────────────────────────────────────────────────────────────

    private RowMapper<Form> rowMapper() {
        return (rs, rowNum) -> Form.builder()
                .id(rs.getObject("id", UUID.class))
                .name(rs.getString("name"))
                .description(rs.getString("description"))
                .tableName(rs.getString("table_name"))
                .createdAt(rs.getTimestamp("created_at").toLocalDateTime())
                .updatedAt(rs.getTimestamp("updated_at").toLocalDateTime())
                .build();
    }
}

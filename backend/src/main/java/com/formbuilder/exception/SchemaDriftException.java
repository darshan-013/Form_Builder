package com.formbuilder.exception;

import com.formbuilder.dto.ValidationError;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Thrown when the physical database schema does not match the form version metadata.
 * Carries structured drift metadata so frontend can show exact mismatch details.
 */
@ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
public class SchemaDriftException extends RuntimeException {
    private final String tableName;
    private final UUID versionId;
    private final List<ValidationError> driftErrors;

    public SchemaDriftException(String message) {
        this(message, null, null, List.of(), null);
    }

    public SchemaDriftException(String message, Throwable cause) {
        this(message, null, null, List.of(), cause);
    }

    public SchemaDriftException(String message, String tableName, UUID versionId, List<ValidationError> driftErrors) {
        this(message, tableName, versionId, driftErrors, null);
    }

    public SchemaDriftException(String message, String tableName, UUID versionId, List<ValidationError> driftErrors, Throwable cause) {
        super(message, cause);
        this.tableName = tableName;
        this.versionId = versionId;
        this.driftErrors = driftErrors == null ? List.of() : List.copyOf(new ArrayList<>(driftErrors));
    }

    public String getTableName() {
        return tableName;
    }

    public UUID getVersionId() {
        return versionId;
    }

    public List<ValidationError> getDriftErrors() {
        return driftErrors;
    }
}

package com.formbuilder.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.dao.DataIntegrityViolationException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Standard error structure for all API responses.
     */
    public record ErrorResponse(
            String errorCode,
            String message,
            List<com.formbuilder.dto.ValidationError> details,
            List<com.formbuilder.dto.ValidationError> errors) {
        public ErrorResponse(String errorCode, String message, List<com.formbuilder.dto.ValidationError> details) {
            this(errorCode, message, details, details);
        }
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(ValidationException ex) {
        List<com.formbuilder.dto.ValidationError> errors = new java.util.ArrayList<>();
        ex.getFieldErrors().forEach((field, messages) -> {
            messages.forEach(msg -> errors.add(new com.formbuilder.dto.ValidationError(field, msg)));
        });
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_ERROR", "Validation failed", errors));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(MethodArgumentNotValidException ex) {
        List<com.formbuilder.dto.ValidationError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(f -> new com.formbuilder.dto.ValidationError(f.getField(), f.getDefaultMessage() != null ? f.getDefaultMessage() : "Invalid value"))
                .toList();
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_ERROR", "Input validation failed", errors));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("NOT_FOUND", ex.getMessage(), List.of()));
    }

    @ExceptionHandler(SubmissionNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleSubmissionNotFound(SubmissionNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("SUBMISSION_NOT_FOUND", ex.getMessage(), List.of()));
    }

    @ExceptionHandler(NoActiveVersionException.class)
    public ResponseEntity<ErrorResponse> handleNoActiveVersion(NoActiveVersionException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse("NO_ACTIVE_VERSION", ex.getMessage(), List.of()));
    }


    @ExceptionHandler(VersionImmutableException.class)
    public ResponseEntity<ErrorResponse> handleVersionImmutable(VersionImmutableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(ex.getErrorCode(), ex.getMessage(), List.of()));
    }

    @ExceptionHandler(SchemaDriftException.class)
    public ResponseEntity<ErrorResponse> handleSchemaDrift(SchemaDriftException ex) {
        String detail = ex.getTableName() != null && ex.getVersionId() != null
                ? String.format("[table=%s, version=%s]", ex.getTableName(), ex.getVersionId())
                : "";
        log.error("Schema drift detected {}: {}", detail, ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse("SCHEMA_DRIFT", ex.getMessage(), ex.getDriftErrors()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleBadArg(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_ARGUMENT", ex.getMessage(), List.of()));
    }

    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException ex) {
        String msg = String.format("Type mismatch for parameter '%s': invalid value '%s'", ex.getName(), ex.getValue());
        return ResponseEntity.badRequest().body(new ErrorResponse("TYPE_MISMATCH", msg, List.of()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("CONFLICT", ex.getMessage(), List.of()));
    }

    @ExceptionHandler(ExpressionEvaluationException.class)
    public ResponseEntity<ErrorResponse> handleExpressionEvaluation(ExpressionEvaluationException ex) {
        log.error("Expression evaluation failed: {} (reason: {}, expression: {})", ex.getMessage(), ex.getReason(), ex.getExpression());
        List<com.formbuilder.dto.ValidationError> errors = List.of(
                new com.formbuilder.dto.ValidationError(ex.getFieldKey() != null ? ex.getFieldKey() : "unknown", ex.getMessage())
        );
        return ResponseEntity.badRequest().body(new ErrorResponse("EXPRESSION_ERROR", ex.getMessage(), errors));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.error("Data integrity violation: {}", ex.getMessage());
        String message = ex.getMostSpecificCause() != null ? ex.getMostSpecificCause().getMessage() : ex.getMessage();
        if (message != null) {
            String lower = message.toLowerCase();
            if (lower.contains("uk_forms_code") || lower.contains("forms_code_key") || lower.contains("duplicate key value") || lower.contains("forms(code)")) {
                return ResponseEntity.badRequest().body(new ErrorResponse(
                        "VALIDATION_ERROR",
                        "Validation failed",
                        List.of(new com.formbuilder.dto.ValidationError("code", "Code already exists."))));
            }
        }
        return ResponseEntity.badRequest().body(new ErrorResponse("DATABASE_ERROR", "A database constraint was violated.", List.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        // Temporarily include ex.getMessage() for easier frontend debugging of 500 errors
        String msg = "An unexpected error occurred: " + ex.getMessage();
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse("SERVER_ERROR", msg, List.of()));
    }
}

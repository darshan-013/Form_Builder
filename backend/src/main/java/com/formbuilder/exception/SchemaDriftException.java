package com.formbuilder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Thrown when the physical database schema does not match the form version metadata
 * and repair fails.
 */
@ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
public class SchemaDriftException extends RuntimeException {
    public SchemaDriftException(String message) {
        super(message);
    }
    public SchemaDriftException(String message, Throwable cause) {
        super(message, cause);
    }
}

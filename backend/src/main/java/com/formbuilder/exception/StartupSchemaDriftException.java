package com.formbuilder.exception;

/**
 * Raised during application startup when published form schema drift is detected.
 * This is intentionally unchecked so startup halts immediately (fail-fast behavior).
 */
public class StartupSchemaDriftException extends RuntimeException {
    public StartupSchemaDriftException(String message, Throwable cause) {
        super(message, cause);
    }
}


package com.formbuilder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Thrown when an attempt is made to modify a published (active) form version.
 * Requirement [T3]: Published versions are immutable.
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class VersionImmutableException extends RuntimeException {
    
    private final String errorCode = "VERSION_IMMUTABLE";

    public VersionImmutableException() {
        super("Published versions cannot be edited. Create a new version to make changes.");
    }

    public VersionImmutableException(String message) {
        super(message);
    }

    public String getErrorCode() {
        return errorCode;
    }
}

package com.formbuilder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.List;

/**
 * Thrown when form submission data fails required-field or regex validation.
 * 
 * @ResponseStatus ensures Spring returns 400 even without the
 *                 GlobalExceptionHandler
 *                 (belt-and-suspenders approach).
 */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class ValidationException extends RuntimeException {

    private final List<String> errors;

    public ValidationException(List<String> errors) {
        super("Validation failed: " + errors);
        this.errors = errors;
    }

    public List<String> getErrors() {
        return errors;
    }
}

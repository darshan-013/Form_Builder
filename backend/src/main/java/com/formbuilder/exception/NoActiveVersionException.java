package com.formbuilder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class NoActiveVersionException extends RuntimeException {
    public NoActiveVersionException(String message) {
        super(message);
    }
}

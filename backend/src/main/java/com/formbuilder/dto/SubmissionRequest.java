package com.formbuilder.dto;

import lombok.Data;
import java.util.Map;

@Data
public class SubmissionRequest {
    /** Key = field_key, Value = user-supplied value for that field. */
    private Map<String, Object> data;
}

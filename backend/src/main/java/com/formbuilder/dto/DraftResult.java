package com.formbuilder.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * DTO for findDraft results.
 * Centralizes the status of a found/missing/discarded draft.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DraftResult {
    public enum Status {
        FOUND,      // Draft exists for the current version
        NOT_FOUND,  // No draft exists for this form/user
        DISCARDED   // Draft existed for an old version and was cleaned up
    }

    private Status status;
    private Map<String, Object> data; // The draft JSON values
    private String submissionId;      // The UUID of the submission meta row
    private String formVersionId;     // The version this draft belongs to
    private String message;           // Optional info
}

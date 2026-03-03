package com.formbuilder.dto;

import lombok.Data;
import java.util.UUID;

/**
 * DTO for field option (normalized storage).
 * Represents a single option for a dropdown or radio field.
 */
@Data
public class FieldOptionDTO {
    private UUID id;              // null for new options
    private String optionValue;   // the display text and submit value
    private int optionOrder;      // display order (0-based)
    private boolean isDefault;    // true if this should be pre-selected
    private boolean isActive;     // false for soft-deleted options
}


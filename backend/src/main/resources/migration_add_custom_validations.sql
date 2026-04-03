-- Add Custom Validation Rules table
CREATE TABLE IF NOT EXISTS custom_validation_rules (
    id UUID PRIMARY KEY,
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL,
    field_key VARCHAR(100),
    expression TEXT NOT NULL,
    error_message TEXT NOT NULL,
    execution_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_validation_version ON custom_validation_rules(form_version_id);
^

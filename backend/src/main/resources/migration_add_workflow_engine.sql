-- =============================================================
--  Workflow Engine Migration
--  Date: 2026-03-13
--
--  Adds chain-of-responsibility approval workflow for form publication.
-- =============================================================

CREATE TABLE IF NOT EXISTS workflow_instances (
    id                 BIGSERIAL PRIMARY KEY,
    form_id            UUID         NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    creator_id         INT          NOT NULL REFERENCES rbac_users(id) ON DELETE RESTRICT,
    target_builder_id  INT          NOT NULL REFERENCES rbac_users(id) ON DELETE RESTRICT,
    current_step_index INTEGER      NOT NULL DEFAULT 1,
    total_steps        INTEGER      NOT NULL,
    status             VARCHAR(20)  NOT NULL,
    created_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT workflow_instances_status_check
        CHECK (status IN ('ACTIVE', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT workflow_instances_total_steps_check
        CHECK (total_steps >= 1),
    CONSTRAINT workflow_instances_current_step_check
        CHECK (current_step_index >= 1 AND current_step_index <= total_steps)
)^

CREATE INDEX IF NOT EXISTS idx_workflow_instances_form_id
    ON workflow_instances(form_id)^

CREATE INDEX IF NOT EXISTS idx_workflow_instances_creator_id
    ON workflow_instances(creator_id)^

CREATE INDEX IF NOT EXISTS idx_workflow_instances_status
    ON workflow_instances(status)^

CREATE TABLE IF NOT EXISTS workflow_steps (
    id          BIGSERIAL PRIMARY KEY,
    instance_id BIGINT       NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    approver_id INT          NOT NULL REFERENCES rbac_users(id) ON DELETE RESTRICT,
    step_index  INTEGER      NOT NULL,
    status      VARCHAR(20)  NOT NULL,
    comments    TEXT,
    decided_at  TIMESTAMP,
    CONSTRAINT workflow_steps_status_check
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT workflow_steps_step_index_check
        CHECK (step_index >= 1),
    CONSTRAINT uq_workflow_step_order UNIQUE (instance_id, step_index)
)^

CREATE INDEX IF NOT EXISTS idx_workflow_steps_instance_id
    ON workflow_steps(instance_id)^

CREATE INDEX IF NOT EXISTS idx_workflow_steps_approver_status
    ON workflow_steps(approver_id, status)^

CREATE OR REPLACE FUNCTION fn_set_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql^

DROP TRIGGER IF EXISTS trg_workflow_instances_updated_at ON workflow_instances^
CREATE TRIGGER trg_workflow_instances_updated_at
    BEFORE UPDATE ON workflow_instances
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_workflow_updated_at()^


-- Migration V5: Create Dynamic Module Management tables

CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    module_name VARCHAR(255) NOT NULL,
    module_description TEXT,
    prefix VARCHAR(255),
    parent_id BIGINT,
    sub_parent_id BIGINT,
    icon_css VARCHAR(100),
    is_parent BOOLEAN DEFAULT FALSE,
    is_sub_parent BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES modules(id) ON DELETE SET NULL,
    CONSTRAINT fk_sub_parent FOREIGN KEY (sub_parent_id) REFERENCES modules(id) ON DELETE SET NULL
)^

CREATE TABLE IF NOT EXISTS role_modules (
    id SERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(role_id, module_id)
)^

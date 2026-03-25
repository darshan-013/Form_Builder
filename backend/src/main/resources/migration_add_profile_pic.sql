-- Add profile_pic column to rbac_users table
ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255);

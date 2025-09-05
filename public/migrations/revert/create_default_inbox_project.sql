-- Revert hasu_todos:create_default_inbox_project from pg

BEGIN;

-- Drop triggers first
DROP TRIGGER IF EXISTS prevent_inbox_flag_removal_trigger ON hasutodo_projects;
DROP TRIGGER IF EXISTS prevent_inbox_deletion_trigger ON hasutodo_projects;

-- Drop triggers
DROP TRIGGER IF EXISTS ensure_inbox_on_project_insert ON hasutodo_projects;
DROP TRIGGER IF EXISTS ensure_inbox_on_todo_insert ON hasutodo_todos;

-- Drop functions
DROP FUNCTION IF EXISTS prevent_inbox_flag_removal();
DROP FUNCTION IF EXISTS prevent_inbox_project_deletion();
DROP FUNCTION IF EXISTS ensure_user_has_inbox_project();

-- Drop constraint
ALTER TABLE hasutodo_projects DROP CONSTRAINT IF EXISTS prevent_inbox_deletion;

COMMIT;

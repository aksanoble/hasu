-- Deploy hasu_todos:remove_inbox_triggers to pg

BEGIN;

-- Drop all inbox-related triggers
DROP TRIGGER IF EXISTS ensure_inbox_on_todo_insert ON hasutodo_todos;
DROP TRIGGER IF EXISTS ensure_inbox_on_project_insert ON hasutodo_projects;
DROP TRIGGER IF EXISTS ensure_inbox_on_project_insert_safe ON hasutodo_projects;
DROP TRIGGER IF EXISTS prevent_inbox_deletion_trigger ON hasutodo_projects;
DROP TRIGGER IF EXISTS prevent_inbox_flag_removal_trigger ON hasutodo_projects;

-- Drop all inbox-related functions
DROP FUNCTION IF EXISTS ensure_user_has_inbox_project();
DROP FUNCTION IF EXISTS ensure_user_has_inbox_project_safe();
DROP FUNCTION IF EXISTS prevent_inbox_project_deletion();
DROP FUNCTION IF EXISTS prevent_inbox_flag_removal();

-- Remove the unique constraint that was added in fix_inbox_duplicates
DROP INDEX IF EXISTS uniq_inbox_per_user;

COMMIT;

-- Revert hasu_todos:fix_todo_project_foreign_key from pg

BEGIN;

-- Remove the foreign key constraint
ALTER TABLE hasutodo_todos DROP CONSTRAINT IF EXISTS fk_todo_project;

COMMIT;

-- Ensure project deletion cascades to its todos to avoid orphans
BEGIN;

-- Drop existing FK if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'fk_todo_project'
      AND tc.table_name = 'hasutodo_todos'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE hasutodo_todos DROP CONSTRAINT fk_todo_project;
  END IF;
END $$;

-- Recreate FK with ON DELETE CASCADE
ALTER TABLE hasutodo_todos
  ADD CONSTRAINT fk_todo_project
  FOREIGN KEY (project_id)
  REFERENCES hasutodo_projects(id)
  ON DELETE CASCADE;

COMMIT;


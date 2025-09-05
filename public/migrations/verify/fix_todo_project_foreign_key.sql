-- Verify hasu_todos:fix_todo_project_foreign_key on pg

BEGIN;

-- Verify that the foreign key constraint exists
SELECT 1/count(*)
FROM information_schema.table_constraints 
WHERE constraint_name = 'fk_todo_project' 
  AND table_name = 'hasutodo_todos'
  AND constraint_type = 'FOREIGN KEY';

ROLLBACK;

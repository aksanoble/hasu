-- Revert hasu_todos:enable_realtime_for_hasu_tables from pg

BEGIN;

-- Disable Supabase realtime for hasutodo tables
-- Remove tables from the realtime publication

-- Disable realtime for todos table
ALTER PUBLICATION supabase_realtime DROP TABLE hasutodo_todos;

-- Disable realtime for projects table
ALTER PUBLICATION supabase_realtime DROP TABLE hasutodo_projects;

COMMIT;

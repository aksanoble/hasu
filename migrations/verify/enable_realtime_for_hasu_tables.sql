-- Verify hasu_todos:enable_realtime_for_hasu_tables on pg

BEGIN;

-- Verify that hasutodo_projects table is in the realtime publication
SELECT 1/count(*)
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'hasutodo_projects';

-- Verify that hasutodo_todos table is in the realtime publication  
SELECT 1/count(*)
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'hasutodo_todos';

ROLLBACK;

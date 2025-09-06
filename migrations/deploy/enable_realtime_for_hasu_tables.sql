-- Deploy hasu_todos:enable_realtime_for_hasu_tables to pg

BEGIN;

-- Enable Supabase realtime for hasutodo tables
-- This allows real-time subscriptions to table changes

-- Enable realtime for projects table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE hasutodo_projects;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'hasutodo_projects already in publication, skipping';
  END;
END $$;

-- Enable realtime for todos table  
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE hasutodo_todos;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'hasutodo_todos already in publication, skipping';
  END;
END $$;

COMMIT;

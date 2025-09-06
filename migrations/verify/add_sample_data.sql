-- Verify hasu_todos:add_sample_data on pg

BEGIN;

-- Verify the sample data creation function exists
SELECT 1/count(*) FROM information_schema.routines 
WHERE routine_name = 'create_sample_data_for_user' 
AND routine_schema = current_schema();

-- Verify the trigger function exists
SELECT 1/count(*) FROM information_schema.routines 
WHERE routine_name = 'ensure_user_has_sample_data' 
AND routine_schema = current_schema();

-- Verify the trigger exists
SELECT 1/count(*) FROM information_schema.triggers 
WHERE trigger_name = 'ensure_sample_data_on_first_todo' 
AND event_object_table = 'hasutodo_todos';

ROLLBACK;

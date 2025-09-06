-- Verify hasu_todos:fix_recursive_trigger on pg

BEGIN;

-- Verify the safe trigger function exists
SELECT 1/count(*) FROM information_schema.routines 
WHERE routine_name = 'ensure_user_has_inbox_project_safe' 
AND routine_schema = current_schema();

-- Verify the safe trigger exists
SELECT 1/count(*) FROM information_schema.triggers 
WHERE trigger_name = 'ensure_inbox_on_project_insert_safe' 
AND event_object_table = 'hasutodo_projects';

-- Verify the old problematic trigger is removed
SELECT 1/count(*) FROM (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'ensure_inbox_on_project_insert' 
    AND event_object_table = 'hasutodo_projects'
    HAVING count(*) = 0
) AS no_old_trigger;

ROLLBACK;

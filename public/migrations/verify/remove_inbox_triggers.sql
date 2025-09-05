-- Verify hasu_todos:remove_inbox_triggers on pg

BEGIN;

-- Verify that all inbox-related triggers have been removed
DO $$
BEGIN
    -- Check that triggers are gone
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name IN (
            'ensure_inbox_on_todo_insert',
            'ensure_inbox_on_project_insert', 
            'ensure_inbox_on_project_insert_safe',
            'prevent_inbox_deletion_trigger',
            'prevent_inbox_flag_removal_trigger'
        )
    ) THEN
        RAISE EXCEPTION 'Inbox triggers still exist after removal';
    END IF;
    
    -- Check that functions are gone
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name IN (
            'ensure_user_has_inbox_project',
            'ensure_user_has_inbox_project_safe', 
            'prevent_inbox_project_deletion',
            'prevent_inbox_flag_removal'
        )
        AND routine_schema = current_schema()
    ) THEN
        RAISE EXCEPTION 'Inbox functions still exist after removal';
    END IF;
    
    -- Check that unique index is gone
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = current_schema() 
        AND indexname = 'uniq_inbox_per_user'
    ) THEN
        RAISE EXCEPTION 'Unique inbox constraint still exists after removal';
    END IF;
END $$;

ROLLBACK;

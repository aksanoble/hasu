-- Deploy hasu_todos:fix_recursive_trigger to pg

BEGIN;

-- Drop the problematic trigger that causes infinite recursion
DROP TRIGGER IF EXISTS ensure_inbox_on_project_insert ON hasutodo_projects;

-- Create a new trigger function that avoids recursion
CREATE OR REPLACE FUNCTION ensure_user_has_inbox_project_safe()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create inbox if we're not already inserting an inbox project
    -- This prevents infinite recursion when the trigger inserts an inbox project
    IF NEW.is_inbox = false OR NEW.is_inbox IS NULL THEN
        -- Check if user already has an inbox project
        IF NOT EXISTS (
            SELECT 1 FROM hasutodo_projects 
            WHERE user_id = NEW.user_id AND is_inbox = true
        ) THEN
            -- Create inbox project for this user
            INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
            VALUES ('Inbox', 'blue', true, false, NEW.user_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add the fixed trigger (only if it doesn't already exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'ensure_inbox_on_project_insert_safe' 
        AND event_object_table = 'hasutodo_projects'
    ) THEN
        CREATE TRIGGER ensure_inbox_on_project_insert_safe
            BEFORE INSERT ON hasutodo_projects
            FOR EACH ROW
            EXECUTE FUNCTION ensure_user_has_inbox_project_safe();
    END IF;
END $$;

COMMIT;

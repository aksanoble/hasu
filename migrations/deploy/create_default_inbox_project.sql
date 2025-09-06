-- Deploy hasu_todos:create_default_inbox_project to pg

BEGIN;

-- Create inbox projects for all existing users who don't have one
INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
SELECT DISTINCT 'Inbox', 'blue', true, false, t.user_id
FROM hasutodo_todos t
WHERE NOT EXISTS (
    SELECT 1 FROM hasutodo_projects p 
    WHERE p.user_id = t.user_id AND p.is_inbox = true
);

-- Create a trigger function to automatically create inbox project for new users
-- This will fire when a user creates their first todo or project
CREATE OR REPLACE FUNCTION ensure_user_has_inbox_project()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if user already has an inbox project
    IF NOT EXISTS (
        SELECT 1 FROM hasutodo_projects 
        WHERE user_id = NEW.user_id AND is_inbox = true
    ) THEN
        -- Create inbox project for this user
        INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
        VALUES ('Inbox', 'blue', true, false, NEW.user_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to ensure inbox project exists when user creates todos (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'ensure_inbox_on_todo_insert' 
        AND event_object_table = 'hasutodo_todos'
    ) THEN
        CREATE TRIGGER ensure_inbox_on_todo_insert
            BEFORE INSERT ON hasutodo_todos
            FOR EACH ROW
            EXECUTE FUNCTION ensure_user_has_inbox_project();
    END IF;
END $$;

-- Add trigger to ensure inbox project exists when user creates projects (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'ensure_inbox_on_project_insert' 
        AND event_object_table = 'hasutodo_projects'
    ) THEN
        CREATE TRIGGER ensure_inbox_on_project_insert
            BEFORE INSERT ON hasutodo_projects
            FOR EACH ROW
            EXECUTE FUNCTION ensure_user_has_inbox_project();
    END IF;
END $$;

-- Removed invalid NOT ENFORCED clause (not supported in Postgres).
-- Deletion protection is implemented via trigger below.

-- Add a trigger to prevent deletion of inbox projects
CREATE OR REPLACE FUNCTION prevent_inbox_project_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_inbox = true THEN
        RAISE EXCEPTION 'Cannot delete inbox project. Inbox projects are required for each user.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to prevent inbox deletion (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'prevent_inbox_deletion_trigger' 
        AND event_object_table = 'hasutodo_projects'
    ) THEN
        CREATE TRIGGER prevent_inbox_deletion_trigger
            BEFORE DELETE ON hasutodo_projects
            FOR EACH ROW
            EXECUTE FUNCTION prevent_inbox_project_deletion();
    END IF;
END $$;

-- Add constraint to prevent changing is_inbox to false for existing inbox projects
CREATE OR REPLACE FUNCTION prevent_inbox_flag_removal()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent removing inbox flag from existing inbox project
    IF OLD.is_inbox = true AND NEW.is_inbox = false THEN
        RAISE EXCEPTION 'Cannot remove inbox flag from inbox project.';
    END IF;
    
    -- Ensure only one inbox project per user
    IF NEW.is_inbox = true AND OLD.is_inbox = false THEN
        IF EXISTS (
            SELECT 1 FROM hasutodo_projects 
            WHERE user_id = NEW.user_id 
            AND is_inbox = true 
            AND id != NEW.id
        ) THEN
            RAISE EXCEPTION 'Each user can only have one inbox project.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to prevent inbox flag removal (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'prevent_inbox_flag_removal_trigger' 
        AND event_object_table = 'hasutodo_projects'
    ) THEN
        CREATE TRIGGER prevent_inbox_flag_removal_trigger
            BEFORE UPDATE ON hasutodo_projects
            FOR EACH ROW
            EXECUTE FUNCTION prevent_inbox_flag_removal();
    END IF;
END $$;

COMMIT;

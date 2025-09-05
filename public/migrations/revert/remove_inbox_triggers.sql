-- Revert hasu_todos:remove_inbox_triggers from pg

BEGIN;

-- This revert restores the inbox creation triggers
-- Note: This is a complex revert that restores the final state of the triggers
-- from the fix_inbox_function_for_todo migration

-- Restore the main inbox creation function
CREATE OR REPLACE FUNCTION ensure_user_has_inbox_project()
RETURNS TRIGGER AS $$
BEGIN
    -- When called from hasutodo_projects, avoid recursion when inserting inbox rows
    IF TG_TABLE_NAME = 'hasutodo_projects' THEN
        IF COALESCE(NEW.is_inbox, false) = false THEN
            IF NOT EXISTS (
                SELECT 1 FROM hasutodo_projects WHERE user_id = NEW.user_id AND is_inbox = true
            ) THEN
                INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
                VALUES ('Inbox', 'blue', true, false, NEW.user_id);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- When called from hasutodo_todos, there is no is_inbox column on NEW
    IF TG_TABLE_NAME = 'hasutodo_todos' THEN
        IF NOT EXISTS (
            SELECT 1 FROM hasutodo_projects WHERE user_id = NEW.user_id AND is_inbox = true
        ) THEN
            INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
            VALUES ('Inbox', 'blue', true, false, NEW.user_id);
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Restore triggers
CREATE TRIGGER ensure_inbox_on_todo_insert
    BEFORE INSERT ON hasutodo_todos
    FOR EACH ROW
    EXECUTE FUNCTION ensure_user_has_inbox_project();

CREATE TRIGGER ensure_inbox_on_project_insert_safe
    BEFORE INSERT ON hasutodo_projects
    FOR EACH ROW
    EXECUTE FUNCTION ensure_user_has_inbox_project();

-- Restore unique constraint
CREATE UNIQUE INDEX uniq_inbox_per_user ON hasutodo_projects (user_id) WHERE is_inbox = true;

COMMIT;

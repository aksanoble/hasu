-- Deploy hasu_todos:fix_inbox_function_for_todo to pg

BEGIN;

-- For hasutodo_todos trigger, NEW has no is_inbox field; only user_id is present.
-- Redefine ensure_user_has_inbox_project to handle both tables safely by checking column existence via TG_TABLE_NAME.

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

COMMIT;



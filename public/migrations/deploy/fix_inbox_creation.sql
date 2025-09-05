-- Deploy hasu_todos:fix_inbox_creation to pg

BEGIN;

-- Create inbox projects for existing users who don't have one
-- Fixed syntax from the previous migration
INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
SELECT 'Inbox', 'blue', true, false, user_id
FROM (
    SELECT DISTINCT user_id 
    FROM hasutodo_todos 
    WHERE user_id NOT IN (
        SELECT DISTINCT user_id 
        FROM hasutodo_projects 
        WHERE is_inbox = true
    )
) AS users_without_inbox;

COMMIT;

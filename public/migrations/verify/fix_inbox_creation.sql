-- Verify hasu_todos:fix_inbox_creation on pg

BEGIN;

-- Verify that users with todos now have inbox projects
-- This should return 0 if all users with todos have inbox projects
SELECT 1/CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM (
    SELECT DISTINCT user_id 
    FROM hasutodo_todos 
    WHERE user_id NOT IN (
        SELECT DISTINCT user_id 
        FROM hasutodo_projects 
        WHERE is_inbox = true
    )
) AS users_without_inbox;

ROLLBACK;

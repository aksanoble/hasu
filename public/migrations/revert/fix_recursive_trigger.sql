-- Revert hasu_todos:fix_recursive_trigger from pg

BEGIN;

-- Drop the fixed trigger
DROP TRIGGER IF EXISTS ensure_inbox_on_project_insert_safe ON hasutodo_projects;

-- Recreate the original problematic trigger (for rollback purposes)
CREATE TRIGGER ensure_inbox_on_project_insert
    BEFORE INSERT ON hasutodo_projects
    FOR EACH ROW
    EXECUTE FUNCTION ensure_user_has_inbox_project();

-- Drop the safe function
DROP FUNCTION IF EXISTS ensure_user_has_inbox_project_safe();

COMMIT;

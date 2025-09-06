-- Revert hasu_todos:add_sample_data from pg

BEGIN;

-- Drop the trigger
DROP TRIGGER IF EXISTS ensure_sample_data_on_first_todo ON hasutodo_todos;

-- Drop the functions
DROP FUNCTION IF EXISTS ensure_user_has_sample_data();
DROP FUNCTION IF EXISTS create_sample_data_for_user(UUID);

COMMIT;

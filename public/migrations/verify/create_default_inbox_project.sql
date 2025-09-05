-- Verify hasu_todos:create_default_inbox_project on pg

BEGIN;

-- Verify auto-inbox triggers exist
SELECT 1/count(*)
FROM pg_trigger
WHERE tgname = 'ensure_inbox_on_todo_insert';

SELECT 1/count(*)
FROM pg_trigger
WHERE tgname = 'ensure_inbox_on_project_insert';

-- Verify triggers exist
SELECT 1/count(*)
FROM pg_trigger
WHERE tgname = 'prevent_inbox_deletion_trigger';

SELECT 1/count(*)
FROM pg_trigger
WHERE tgname = 'prevent_inbox_flag_removal_trigger';

-- Verify functions exist
SELECT 1/count(*)
FROM pg_proc
WHERE proname = 'prevent_inbox_project_deletion';

SELECT 1/count(*)
FROM pg_proc
WHERE proname = 'prevent_inbox_flag_removal';

ROLLBACK;

-- Revert hasu_todos:fix_inbox_creation from pg

BEGIN;

-- Remove inbox projects that were created by this migration
-- Note: This is a destructive operation and should be used carefully
DELETE FROM hasutodo_projects 
WHERE is_inbox = true 
  AND name = 'Inbox' 
  AND color = 'blue';

COMMIT;

-- Deploy hasu_todos:fix_inbox_duplicates to pg

BEGIN;

-- 1) Harden ensure_user_has_inbox_project to be idempotent and safe
CREATE OR REPLACE FUNCTION ensure_user_has_inbox_project()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act when not inserting an inbox already
    IF NEW.is_inbox IS DISTINCT FROM true THEN
        IF NOT EXISTS (
            SELECT 1 FROM hasutodo_projects 
            WHERE user_id = NEW.user_id AND is_inbox = true
        ) THEN
            INSERT INTO hasutodo_projects (name, color, is_inbox, is_favorite, user_id)
            VALUES ('Inbox', 'blue', true, false, NEW.user_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Ensure only one inbox per user by constraint + cleanup
DO $$
DECLARE r RECORD;
BEGIN
  -- For each user with duplicates, keep the smallest id as canonical inbox
  FOR r IN (
    SELECT user_id, MIN(id) AS keep_id
    FROM hasutodo_projects
    WHERE is_inbox = true
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) LOOP
    -- Reassign todos pointing to duplicate inboxes to kept inbox
    UPDATE hasutodo_todos t
    SET project_id = r.keep_id
    WHERE t.project_id IN (
      SELECT id FROM hasutodo_projects
      WHERE user_id = r.user_id AND is_inbox = true AND id <> r.keep_id
    );

    -- Delete duplicate inbox projects
    DELETE FROM hasutodo_projects
    WHERE user_id = r.user_id AND is_inbox = true AND id <> r.keep_id;
  END LOOP;
END $$;

-- 3) Add partial unique index to enforce one inbox per user going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uniq_inbox_per_user'
  ) THEN
    CREATE UNIQUE INDEX uniq_inbox_per_user ON hasutodo_projects (user_id) WHERE is_inbox = true;
  END IF;
END $$;

COMMIT;



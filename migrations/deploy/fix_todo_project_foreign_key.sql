-- Deploy hasu_todos:fix_todo_project_foreign_key to pg

BEGIN;

-- Fix missing foreign key constraint between hasutodo_todos and hasutodo_projects
-- This addresses the PostgREST relationship detection issue

-- Add foreign key constraint for project_id with proper error handling
DO $$
BEGIN
    BEGIN
        ALTER TABLE hasutodo_todos 
        ADD CONSTRAINT fk_todo_project 
        FOREIGN KEY (project_id) REFERENCES hasutodo_projects(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Foreign key constraint fk_todo_project added successfully';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Foreign key constraint fk_todo_project already exists, skipping';
        WHEN undefined_table THEN
            RAISE EXCEPTION 'Required tables do not exist. Run create_hasu_todos_schema migration first';
    END;
END $$;

COMMIT;

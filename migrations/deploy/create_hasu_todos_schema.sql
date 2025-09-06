-- Deploy hasu_todos:create_hasu_todos_schema to pg

BEGIN;

-- Note: Schema is created by the edge function based on app identifier
-- Tables will be created in the current schema (set by search_path)

-- Create the projects table first
CREATE TABLE IF NOT EXISTS hasutodo_projects (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT 'blue',
    is_inbox BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the todos table
CREATE TABLE IF NOT EXISTS hasutodo_todos (
    id BIGSERIAL PRIMARY KEY,
    text TEXT NOT NULL DEFAULT '',
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id BIGINT,
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint for project_id (skip if already exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_todo_project') THEN
        ALTER TABLE hasutodo_todos 
        ADD CONSTRAINT fk_todo_project 
        FOREIGN KEY (project_id) REFERENCES hasutodo_projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for better performance (skip if already exist)
CREATE INDEX IF NOT EXISTS idx_hasutodo_todos_user_id ON hasutodo_todos(user_id);
CREATE INDEX IF NOT EXISTS idx_hasutodo_todos_project_id ON hasutodo_todos(project_id);
CREATE INDEX IF NOT EXISTS idx_hasutodo_todos_completed ON hasutodo_todos(completed);
CREATE INDEX IF NOT EXISTS idx_hasutodo_todos_created_at ON hasutodo_todos(created_at);
CREATE INDEX IF NOT EXISTS idx_hasutodo_projects_user_id ON hasutodo_projects(user_id);

-- Enable Row Level Security (edge function will handle this via dynamic SQL)
-- ALTER TABLE hasutodo_todos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE hasutodo_projects ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies will be created by the edge function dynamically
-- to ensure they work with the current schema context

-- Create functions for updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at (skip if already exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_hasutodo_todos_updated_at') THEN
        CREATE TRIGGER set_hasutodo_todos_updated_at
            BEFORE UPDATE ON hasutodo_todos
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_hasutodo_projects_updated_at') THEN
        CREATE TRIGGER set_hasutodo_projects_updated_at
            BEFORE UPDATE ON hasutodo_projects
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;

COMMIT;

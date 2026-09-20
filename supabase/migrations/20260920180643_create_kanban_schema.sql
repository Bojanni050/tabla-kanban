/*
# Create Kanban Board Schema

Creates the tables for a Trello-style kanban board application:
users, workspaces, boards, lists, and cards.

1. New Tables
- `User`: id (uuid), email (unique), name (nullable), timestamps
- `Workspace`: id (uuid), name, userId (uuid FK to User), timestamps
- `Board`: id (uuid), name, workspaceId (uuid FK to Workspace), timestamps
- `List`: id (uuid), title, position (float), boardId (uuid FK to Board), timestamps
- `Card`: id (uuid), title, description (nullable), position (float), listId (uuid FK to List), timestamps
- Index on Card(listId, position) for efficient card queries

2. Security
- RLS enabled on all tables.
- This is a single-tenant app with no sign-in screen, so anon + authenticated
  roles are granted full CRUD access on all tables (data is intentionally shared).
*/

CREATE TABLE IF NOT EXISTS "User" (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email     TEXT NOT NULL UNIQUE,
  name      TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Workspace" (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  "userId"  UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Board" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "List" (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title     TEXT NOT NULL,
  position  DOUBLE PRECISION NOT NULL,
  "boardId" UUID NOT NULL REFERENCES "Board"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Card" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  position    DOUBLE PRECISION NOT NULL,
  "listId"    UUID NOT NULL REFERENCES "List"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Card_listId_position_idx" ON "Card"("listId", position);

-- Enable RLS on all tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "List" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Card" ENABLE ROW LEVEL SECURITY;

-- RLS Policies: single-tenant app (no auth), anon + authenticated have full access

-- User policies
DROP POLICY IF EXISTS "anon_select_user" ON "User";
CREATE POLICY "anon_select_user" ON "User" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_user" ON "User";
CREATE POLICY "anon_insert_user" ON "User" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_user" ON "User";
CREATE POLICY "anon_update_user" ON "User" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_user" ON "User";
CREATE POLICY "anon_delete_user" ON "User" FOR DELETE TO anon, authenticated USING (true);

-- Workspace policies
DROP POLICY IF EXISTS "anon_select_workspace" ON "Workspace";
CREATE POLICY "anon_select_workspace" ON "Workspace" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workspace" ON "Workspace";
CREATE POLICY "anon_insert_workspace" ON "Workspace" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workspace" ON "Workspace";
CREATE POLICY "anon_update_workspace" ON "Workspace" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workspace" ON "Workspace";
CREATE POLICY "anon_delete_workspace" ON "Workspace" FOR DELETE TO anon, authenticated USING (true);

-- Board policies
DROP POLICY IF EXISTS "anon_select_board" ON "Board";
CREATE POLICY "anon_select_board" ON "Board" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_board" ON "Board";
CREATE POLICY "anon_insert_board" ON "Board" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_board" ON "Board";
CREATE POLICY "anon_update_board" ON "Board" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_board" ON "Board";
CREATE POLICY "anon_delete_board" ON "Board" FOR DELETE TO anon, authenticated USING (true);

-- List policies
DROP POLICY IF EXISTS "anon_select_list" ON "List";
CREATE POLICY "anon_select_list" ON "List" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_list" ON "List";
CREATE POLICY "anon_insert_list" ON "List" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_list" ON "List";
CREATE POLICY "anon_update_list" ON "List" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_list" ON "List";
CREATE POLICY "anon_delete_list" ON "List" FOR DELETE TO anon, authenticated USING (true);

-- Card policies
DROP POLICY IF EXISTS "anon_select_card" ON "Card";
CREATE POLICY "anon_select_card" ON "Card" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_card" ON "Card";
CREATE POLICY "anon_insert_card" ON "Card" FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_card" ON "Card";
CREATE POLICY "anon_update_card" ON "Card" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_card" ON "Card";
CREATE POLICY "anon_delete_card" ON "Card" FOR DELETE TO anon, authenticated USING (true);
-- ── tack — Migration v3: Generation boards ────────────────────────────────
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS public.boards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.board_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url         TEXT NOT NULL,
  prompt            TEXT,
  source_created_at TIMESTAMP WITH TIME ZONE,
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, image_url)
);

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own boards" ON public.boards;
CREATE POLICY "Users can read own boards"
  ON public.boards FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own boards" ON public.boards;
CREATE POLICY "Users can insert own boards"
  ON public.boards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own boards" ON public.boards;
CREATE POLICY "Users can update own boards"
  ON public.boards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own boards" ON public.boards;
CREATE POLICY "Users can delete own boards"
  ON public.boards FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own board items" ON public.board_items;
CREATE POLICY "Users can read own board items"
  ON public.board_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own board items" ON public.board_items;
CREATE POLICY "Users can insert own board items"
  ON public.board_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own board items" ON public.board_items;
CREATE POLICY "Users can update own board items"
  ON public.board_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own board items" ON public.board_items;
CREATE POLICY "Users can delete own board items"
  ON public.board_items FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_board_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.boards
  SET updated_at = NOW()
  WHERE id = COALESCE(NEW.board_id, OLD.board_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS touch_board_on_item_insert ON public.board_items;
CREATE TRIGGER touch_board_on_item_insert
  AFTER INSERT ON public.board_items
  FOR EACH ROW EXECUTE PROCEDURE public.touch_board_updated_at();

DROP TRIGGER IF EXISTS touch_board_on_item_update ON public.board_items;
CREATE TRIGGER touch_board_on_item_update
  AFTER UPDATE ON public.board_items
  FOR EACH ROW EXECUTE PROCEDURE public.touch_board_updated_at();

DROP TRIGGER IF EXISTS touch_board_on_item_delete ON public.board_items;
CREATE TRIGGER touch_board_on_item_delete
  AFTER DELETE ON public.board_items
  FOR EACH ROW EXECUTE PROCEDURE public.touch_board_updated_at();


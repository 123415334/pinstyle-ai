-- Tack migration v8: defense-in-depth RLS, ownership, and function hardening.
-- Review and run after migrations v2-v7.

UPDATE public.user_profiles SET plan = 'studio' WHERE plan = 'unlimited';
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_plan_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_plan_check CHECK (plan IN ('free', 'pro', 'studio'));

-- Legacy usage mutation must never be callable by browser roles.
REVOKE ALL ON FUNCTION public.increment_generations(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_generations(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A board item must belong to the same user as its parent board.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boards_id_user_id_unique') THEN
    ALTER TABLE public.boards
      ADD CONSTRAINT boards_id_user_id_unique UNIQUE (id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.board_items item
    JOIN public.boards board ON board.id = item.board_id
    WHERE item.user_id <> board.user_id
  ) THEN
    RAISE EXCEPTION 'Cross-user board items exist; audit them before applying the ownership constraint';
  END IF;
END $$;

ALTER TABLE public.board_items
  DROP CONSTRAINT IF EXISTS board_items_board_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_items_board_owner_fkey') THEN
    ALTER TABLE public.board_items
      ADD CONSTRAINT board_items_board_owner_fkey
      FOREIGN KEY (board_id, user_id) REFERENCES public.boards(id, user_id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can insert own board items" ON public.board_items;
CREATE POLICY "Users can insert own board items"
  ON public.board_items FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.boards
      WHERE boards.id = board_items.board_id AND boards.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own board items" ON public.board_items;
CREATE POLICY "Users can update own board items"
  ON public.board_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.boards
      WHERE boards.id = board_items.board_id AND boards.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.touch_board_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.boards
  SET updated_at = NOW()
  WHERE id = COALESCE(NEW.board_id, OLD.board_id)
    AND user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure every generation operation is owner-scoped.
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own generations" ON public.generations;
CREATE POLICY "Users can read own generations"
  ON public.generations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own generations" ON public.generations;
CREATE POLICY "Users can insert own generations"
  ON public.generations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own generations" ON public.generations;
CREATE POLICY "Users can update own generations"
  ON public.generations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own generations" ON public.generations;
CREATE POLICY "Users can delete own generations"
  ON public.generations FOR DELETE USING (auth.uid() = user_id);

-- Clients may only write generated images below their own user-id folder.
DROP POLICY IF EXISTS "Users can upload own generated images" ON storage.objects;
CREATE POLICY "Users can upload own generated images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS "Users can update own generated images" ON storage.objects;
CREATE POLICY "Users can update own generated images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS "Users can delete own generated images" ON storage.objects;
CREATE POLICY "Users can delete own generated images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

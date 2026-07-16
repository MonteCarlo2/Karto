-- Счётчик генераций описания в сессии (демо-поток: лимит 2)
ALTER TABLE public.description_data
  ADD COLUMN IF NOT EXISTS description_gens_used integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.description_data.description_gens_used IS
  'Счётчик генераций/переделок описания в сессии (для демо-потока лимит 2)';

-- À exécuter UNE FOIS dans Supabase > SQL Editor
create table if not exists public.favoris_admin (
  song_id bigint primary key,
  created_at timestamptz not null default now()
);

-- Sécurité : RLS activée et AUCUNE politique = personne ne peut lire/écrire
-- depuis le navigateur ; seul le serveur (clé service_role) y accède.
alter table public.favoris_admin enable row level security;



tcxiehk_62hidhezuyohpmp_524FHjfgy872Kxqnzo_ebapn58njgG
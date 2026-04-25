-- Enable Postgres → Realtime for public.profiles so clients can subscribe (e.g. id=eq.<user>).
-- Filtered postgres_changes on UPDATE require REPLICA IDENTITY FULL (Supabase Realtime).

alter table if exists public.profiles replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    ) then
      execute 'alter publication supabase_realtime add table public.profiles';
    end if;
  end if;
end $$;

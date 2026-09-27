-- =============================================================
-- AUDYT BAZY (TYLKO ODCZYT — niczego nie zmienia)
-- Uruchom w: Supabase Dashboard → SQL Editor → Run
-- Wynik to jedna komórka JSON — skopiuj ją w całości
-- i zapisz do pliku docs/security/audit-result.json (plik jest w .gitignore).
-- =============================================================
select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'rls', c.relrowsecurity,
      'rows_estimate', c.reltuples::bigint
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'cmd', cmd,
      'roles', roles, 'using', qual, 'check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'anon_can_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'definition', case when p.prorettype <> 'trigger'::regtype
                          then pg_get_functiondef(p.oid) end
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', event_object_table, 'name', trigger_name,
      'event', event_manipulation, 'timing', action_timing,
      'action', action_statement
    ) order by event_object_table, trigger_name)
    from information_schema.triggers
    where trigger_schema in ('public', 'auth')
  ),
  'foreign_keys_to_profiles_or_users', (
    select jsonb_agg(jsonb_build_object(
      'table', conrelid::regclass::text,
      'constraint', conname,
      'references', confrelid::regclass::text,
      'on_delete', confdeltype,
      'def', pg_get_constraintdef(oid)
    ) order by conrelid::regclass::text)
    from pg_constraint
    where contype = 'f'
      and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
  ),
  'profiles_columns', (
    select jsonb_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
  ),
  'parishes_columns', (
    select jsonb_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'parishes'
  ),
  'storage_buckets', (
    select jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit))
    from storage.buckets
  ),
  'storage_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'using', qual, 'check', with_check))
    from pg_policies where schemaname = 'storage'
  ),
  'counts', jsonb_build_object(
    'auth_users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'parishes', (select count(*) from public.parishes),
    'db_size', pg_size_pretty(pg_database_size(current_database()))
  ),
  'extensions', (select jsonb_agg(extname) from pg_extension)
)) as audit;

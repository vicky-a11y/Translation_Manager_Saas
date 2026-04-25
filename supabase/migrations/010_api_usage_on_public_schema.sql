-- PostgREST 呼叫 public.* RPC 時，authenticated / anon 必須對 schema public 具備 USAGE。
-- 若僅有 EXECUTE on function 而無 schema USAGE，會出現 42501「permission denied for schema public」。

grant usage on schema public to postgres, anon, authenticated, service_role;

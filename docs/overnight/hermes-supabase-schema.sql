-- Dedicated Hermes objects only. Existing Reveal House tables/bucket are untouched.
create table public.hermes_objects (
 logical_key text primary key check(length(logical_key)<=512 and (logical_key like 'hermes/%' or logical_key like 'cutline/private/%')),
 object_path text not null check(object_path ~ '^objects/[a-f0-9-]{36}$'),
 etag uuid not null,
 content_type text not null,
 size bigint not null check(size>=0 and size<=134217728),
 updated_at timestamptz not null default now()
);
alter table public.hermes_objects enable row level security;
revoke all on public.hermes_objects from public,anon,authenticated;
grant select,insert,update on public.hermes_objects to service_role;
create policy hermes_server_only on public.hermes_objects to service_role using (true) with check (true);
create function public.hermes_commit_object(p_key text,p_expected uuid,p_path text,p_etag uuid,p_type text,p_size bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_expected is null then
  insert into public.hermes_objects(logical_key,object_path,etag,content_type,size)
  values(p_key,p_path,p_etag,p_type,p_size) on conflict do nothing;
 else
  update public.hermes_objects set object_path=p_path,etag=p_etag,content_type=p_type,size=p_size,updated_at=now()
  where logical_key=p_key and etag=p_expected;
 end if;
 return found;
end;
$$;
revoke all on function public.hermes_commit_object(text,uuid,text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.hermes_commit_object(text,uuid,text,uuid,text,bigint) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('hermes-private','hermes-private',false,134217728);

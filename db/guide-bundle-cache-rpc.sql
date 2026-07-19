create or replace function merge_guide_bundle_cache(p_bundle_key text, p_new_data jsonb)
returns void as $$
declare
  existing_data jsonb;
  merged_pages jsonb;
  v_title text;
  v_url text;
begin
  -- Lock the row for update to ensure atomicity
  select data into existing_data from public.guide_bundle_cache 
    where bundle_key = p_bundle_key for update;
    
  if not found then
    insert into public.guide_bundle_cache (bundle_key, data) 
      values (p_bundle_key, p_new_data)
      on conflict (bundle_key) do update set data = p_new_data, fetched_at = now();
  else
    -- Combine the raw pages arrays. Dedupe and sort happens in the application layer on read.
    merged_pages := coalesce(existing_data->'pages', '[]'::jsonb) || coalesce(p_new_data->'pages', '[]'::jsonb);
    
    -- Prefer new title/url if present, else keep existing
    v_title := coalesce(nullif(p_new_data->>'title', ''), existing_data->>'title');
    v_url := coalesce(nullif(p_new_data->>'canonicalUrl', ''), existing_data->>'canonicalUrl');
    
    update public.guide_bundle_cache set 
      data = jsonb_build_object(
        'title', v_title,
        'canonicalUrl', v_url,
        'pages', merged_pages
      ),
      fetched_at = now()
    where bundle_key = p_bundle_key;
  end if;
end;
$$ language plpgsql security definer;

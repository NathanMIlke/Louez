create or replace function public.import_customers_snapshot(
  p_store_id varchar,
  p_customers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_id varchar(21);
  v_legacy text;
  v_name text;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_doc text;
  v_cpf text;
  v_cnpj text;
  v_type public.customer_type;
  v_company text;
  v_rg text;
  v_zip text;
  v_city text;
  v_state text;
  v_address text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_customers) is distinct from 'array' then
    raise exception 'customers_must_be_array';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'store_not_found';
  end if;

  for item in select value from jsonb_array_elements(p_customers)
  loop
    v_legacy := nullif(trim(coalesce(item->>'id','')), '');
    v_name := nullif(trim(coalesce(item->>'name', item->>'company_name', '')), '');
    v_email := nullif(lower(trim(coalesce(item->>'email',''))), '');
    v_phone := nullif(regexp_replace(coalesce(item->>'phone',''), '[^0-9]', '', 'g'), '');
    v_doc := regexp_replace(coalesce(item->>'cpf_cnpj', item->>'document', ''), '[^0-9]', '', 'g');
    v_rg := nullif(trim(coalesce(item->>'rg','')), '');
    v_zip := nullif(regexp_replace(coalesce(item->>'address_zipcode',''), '[^0-9]', '', 'g'), '');
    v_city := nullif(trim(coalesce(item->>'address_city', item->>'city', '')), '');
    v_state := upper(nullif(trim(coalesce(item->>'address_state', item->>'state', '')), ''));

    if v_legacy is null or v_name is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if length(v_doc) = 14 or lower(coalesce(item->>'type','')) in ('pj','business','company','juridica','jurídica') then
      v_type := 'business';
      v_cnpj := case when length(v_doc)=14 then v_doc else null end;
      v_cpf := null;
      v_company := v_name;
      v_first := coalesce(nullif(trim(item->>'contact_name'), ''), v_name);
      v_last := '';
    else
      v_type := 'individual';
      v_cpf := case when length(v_doc)=11 then v_doc else null end;
      v_cnpj := null;
      v_company := null;
      v_first := split_part(v_name, ' ', 1);
      v_last := case when position(' ' in v_name) > 0 then substr(v_name, position(' ' in v_name) + 1) else '' end;
    end if;

    v_address := nullif(concat_ws(', ',
      nullif(trim(coalesce(item->>'address_street','')), ''),
      nullif(trim(coalesce(item->>'address_number','')), ''),
      nullif(trim(coalesce(item->>'address_neighborhood','')), ''),
      nullif(trim(coalesce(item->>'address_complement','')), '')
    ), '');

    v_id := null;
    select id into v_id from public.customers
      where store_id = p_store_id and legacy_estoquenow_id = v_legacy
      limit 1;

    if v_id is null and v_cpf is not null then
      select id into v_id from public.customers
        where store_id = p_store_id and cpf = v_cpf
        limit 1;
    end if;

    if v_id is null and v_cnpj is not null then
      select id into v_id from public.customers
        where store_id = p_store_id and cnpj = v_cnpj
        limit 1;
    end if;

    if v_id is null and v_email is not null then
      select id into v_id from public.customers
        where store_id = p_store_id and lower(email) = v_email
        limit 1;
    end if;

    if v_id is null then
      v_id := substr(replace(gen_random_uuid()::text, '-', ''), 1, 21);
      insert into public.customers (
        id, store_id, customer_type, email, first_name, last_name,
        company_name, phone, address, city, state, postal_code,
        country, cpf, cnpj, rg, approval_status, notes,
        legacy_estoquenow_id
      ) values (
        v_id, p_store_id, v_type, v_email, v_first, v_last,
        v_company, v_phone, v_address, v_city,
        case when v_state ~ '^[A-Z]{2}$' then v_state else null end,
        case when length(v_zip)=8 then v_zip else null end,
        'BR', v_cpf, v_cnpj, v_rg, 'approved',
        nullif(trim(coalesce(item->>'observations','')), ''), v_legacy
      );
      v_inserted := v_inserted + 1;
    else
      update public.customers set
        customer_type = v_type,
        email = coalesce(v_email, email),
        first_name = v_first,
        last_name = v_last,
        company_name = v_company,
        phone = coalesce(v_phone, phone),
        address = coalesce(v_address, address),
        city = coalesce(v_city, city),
        state = coalesce(case when v_state ~ '^[A-Z]{2}$' then v_state else null end, state),
        postal_code = coalesce(case when length(v_zip)=8 then v_zip else null end, postal_code),
        cpf = coalesce(v_cpf, cpf),
        cnpj = coalesce(v_cnpj, cnpj),
        rg = coalesce(v_rg, rg),
        approval_status = 'approved',
        notes = coalesce(nullif(trim(coalesce(item->>'observations','')), ''), notes),
        legacy_estoquenow_id = coalesce(legacy_estoquenow_id, v_legacy),
        updated_at = now()
      where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.import_customers_snapshot(varchar, jsonb) from public, anon, authenticated;
grant execute on function public.import_customers_snapshot(varchar, jsonb) to service_role;

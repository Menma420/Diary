-- Operator-reviewed, transactional migration. Never applied automatically by the app.
BEGIN;
CREATE ROLE diary_data_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE diary_entry_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA diary AUTHORIZATION diary_data_owner;
REVOKE ALL ON SCHEMA diary FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO diary_data_owner;
GRANT SELECT ON private.diary_owner TO diary_data_owner;
GRANT USAGE ON SCHEMA diary TO diary_entry_runtime;
CREATE TABLE diary.entries (
  owner_id uuid NOT NULL REFERENCES private.diary_owner(owner_id) ON DELETE RESTRICT,
  entry_date date NOT NULL CHECK (entry_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  content text NOT NULL CHECK (octet_length(content) <= 262144),
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  mutation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, entry_date)
);
-- Retain valid requests, including rejected CAS attempts. NULL version means
-- conflict: the ID remains reserved and can never be reused for another request.
CREATE TABLE diary.mutations (
  owner_id uuid NOT NULL REFERENCES private.diary_owner(owner_id) ON DELETE RESTRICT,
  mutation_id uuid NOT NULL,
  entry_date date NOT NULL,
  base_version bigint NOT NULL,
  content text NOT NULL CHECK (octet_length(content) <= 262144),
  version bigint,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, mutation_id)
);
ALTER TABLE diary.entries OWNER TO diary_data_owner;
ALTER TABLE diary.mutations OWNER TO diary_data_owner;
ALTER TABLE diary.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary.entries FORCE ROW LEVEL SECURITY;
ALTER TABLE diary.mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary.mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY entry_owner ON diary.entries TO diary_data_owner
 USING (owner_id = nullif(current_setting('diary.verified_owner', true),'')::uuid)
 WITH CHECK (owner_id = nullif(current_setting('diary.verified_owner', true),'')::uuid);
CREATE POLICY mutation_owner ON diary.mutations TO diary_data_owner
 USING (owner_id = nullif(current_setting('diary.verified_owner', true),'')::uuid)
 WITH CHECK (owner_id = nullif(current_setting('diary.verified_owner', true),'')::uuid);
CREATE FUNCTION diary.read_entry(p_owner uuid, p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE e diary.entries%ROWTYPE;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM private.diary_owner WHERE owner_id=p_owner)
 THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date < DATE '0001-01-01' OR p_date > DATE '9999-12-31'
 THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.set_config('diary.verified_owner', p_owner::text, true);
 SELECT * INTO e FROM diary.entries WHERE owner_id=p_owner AND entry_date=p_date;
 IF NOT FOUND THEN RETURN jsonb_build_object('exists',false,'date',to_char(p_date,'YYYY-MM-DD'),'content','','version',0); END IF;
 RETURN jsonb_build_object('exists',true,'date',to_char(p_date,'YYYY-MM-DD'),'content',e.content,'version',e.version,
 'lastMutationId',e.mutation_id,'updatedAt',to_char(e.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
CREATE FUNCTION diary.write_entry(p_owner uuid,p_date date,p_content text,p_base bigint,p_mutation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE e diary.entries%ROWTYPE; m diary.mutations%ROWTYPE; v bigint; t timestamptz;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM private.diary_owner WHERE owner_id=p_owner)
 THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date < DATE '0001-01-01' OR p_date > DATE '9999-12-31' OR p_content IS NULL OR
 octet_length(p_content)>262144 OR p_base IS NULL OR p_base<0 OR p_base>=9007199254740991 OR p_mutation IS NULL
 THEN RAISE EXCEPTION 'Invalid mutation' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.set_config('diary.verified_owner', p_owner::text, true);
 -- Serialize this singleton owner's writes, including creation and cross-date ID reuse.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 6));
 SELECT * INTO m FROM diary.mutations WHERE owner_id=p_owner AND mutation_id=p_mutation;
 IF FOUND THEN
   IF m.entry_date<>p_date OR m.base_version<>p_base OR pg_catalog.convert_to(m.content,'UTF8')<>pg_catalog.convert_to(p_content,'UTF8') THEN
     RAISE EXCEPTION 'Mutation identity reused' USING ERRCODE='22023';
   END IF;
   IF m.version IS NULL THEN RETURN jsonb_build_object('kind','conflict','current',diary.read_entry(p_owner,p_date)); END IF;
   RETURN jsonb_build_object('kind','acknowledged','acknowledgement',jsonb_build_object('date',to_char(p_date,'YYYY-MM-DD'),
    'version',m.version,'mutationId',p_mutation,'updatedAt',to_char(m.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 END IF;
 SELECT * INTO e FROM diary.entries WHERE owner_id=p_owner AND entry_date=p_date;
 v := CASE WHEN FOUND THEN e.version ELSE 0 END;
 IF v<>p_base THEN
   INSERT INTO diary.mutations VALUES(p_owner,p_mutation,p_date,p_base,p_content,NULL,clock_timestamp());
   RETURN jsonb_build_object('kind','conflict','current',diary.read_entry(p_owner,p_date));
 END IF;
 t:=clock_timestamp();
 INSERT INTO diary.entries(owner_id,entry_date,content,version,mutation_id,updated_at)
 VALUES(p_owner,p_date,p_content,v+1,p_mutation,t)
 ON CONFLICT(owner_id,entry_date) DO UPDATE SET content=EXCLUDED.content,version=EXCLUDED.version,mutation_id=EXCLUDED.mutation_id,updated_at=EXCLUDED.updated_at;
 INSERT INTO diary.mutations VALUES(p_owner,p_mutation,p_date,p_base,p_content,v+1,t);
 RETURN jsonb_build_object('kind','acknowledged','acknowledgement',jsonb_build_object('date',to_char(p_date,'YYYY-MM-DD'),
 'version',v+1,'mutationId',p_mutation,'updatedAt',to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
END $$;
ALTER FUNCTION diary.read_entry(uuid,date) OWNER TO diary_data_owner;
ALTER FUNCTION diary.write_entry(uuid,date,text,bigint,uuid) OWNER TO diary_data_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA diary FROM PUBLIC, diary_entry_runtime, diary_auth_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA diary FROM PUBLIC, diary_auth_runtime;
GRANT EXECUTE ON FUNCTION diary.read_entry(uuid,date),diary.write_entry(uuid,date,text,bigint,uuid) TO diary_entry_runtime;
COMMIT;

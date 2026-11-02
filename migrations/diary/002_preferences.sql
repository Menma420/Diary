-- Reviewed separately from entries; operator/disposable fixtures only.
BEGIN;
CREATE TABLE diary.preferences (
 owner_id uuid PRIMARY KEY REFERENCES private.diary_owner(owner_id) ON DELETE RESTRICT,
 theme text NOT NULL DEFAULT 'sakura-pink' CHECK(theme IN ('sakura-pink','dreamy-sky','lavender-dreams','vintage-journal')),
 timezone text NOT NULL DEFAULT 'Asia/Kolkata' CHECK(length(timezone) BETWEEN 1 AND 100),
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 last_mutation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE diary.preference_mutations (
 owner_id uuid NOT NULL REFERENCES private.diary_owner(owner_id) ON DELETE RESTRICT,
 mutation_id uuid NOT NULL,theme text NOT NULL,timezone text NOT NULL,base_version bigint NOT NULL,
 version bigint,updated_at timestamptz NOT NULL,PRIMARY KEY(owner_id,mutation_id)
);
ALTER TABLE diary.preferences OWNER TO diary_data_owner;
ALTER TABLE diary.preference_mutations OWNER TO diary_data_owner;
ALTER TABLE diary.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary.preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE diary.preference_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary.preference_mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY preferences_owner ON diary.preferences TO diary_data_owner
 USING(owner_id=nullif(current_setting('diary.verified_owner',true),'')::uuid)
 WITH CHECK(owner_id=nullif(current_setting('diary.verified_owner',true),'')::uuid);
CREATE POLICY preference_mutations_owner ON diary.preference_mutations TO diary_data_owner
 USING(owner_id=nullif(current_setting('diary.verified_owner',true),'')::uuid)
 WITH CHECK(owner_id=nullif(current_setting('diary.verified_owner',true),'')::uuid);
-- A table constraint cannot query the installed IANA catalog. Enforce it on every
-- table write as well as at the controlled function boundary.
CREATE FUNCTION diary.validate_preference_timezone() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog, pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone)
 THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION diary.validate_preference_timezone() OWNER TO diary_data_owner;
CREATE TRIGGER preference_timezone BEFORE INSERT OR UPDATE ON diary.preferences
 FOR EACH ROW EXECUTE FUNCTION diary.validate_preference_timezone();
CREATE FUNCTION diary.read_preferences(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, pg_temp AS $$
DECLARE p diary.preferences%ROWTYPE;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM private.diary_owner WHERE owner_id=p_owner)
 THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.set_config('diary.verified_owner',p_owner::text,true);
 SELECT * INTO p FROM diary.preferences WHERE owner_id=p_owner;
 IF NOT FOUND THEN RETURN jsonb_build_object('theme','sakura-pink','timezone','Asia/Kolkata','version',0,'lastMutationId',NULL,'createdAt',NULL,'updatedAt',NULL); END IF;
 RETURN jsonb_build_object('theme',p.theme,'timezone',p.timezone,'version',p.version,'lastMutationId',p.last_mutation_id,
 'createdAt',to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'updatedAt',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
CREATE FUNCTION diary.write_preferences(p_owner uuid,p_theme text,p_timezone text,p_base bigint,p_mutation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, pg_temp AS $$
DECLARE m diary.preference_mutations%ROWTYPE; v bigint; t timestamptz;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS(SELECT 1 FROM private.diary_owner WHERE owner_id=p_owner)
 THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_theme IS NULL OR p_theme NOT IN ('sakura-pink','dreamy-sky','lavender-dreams','vintage-journal') OR
 p_timezone IS NULL OR length(p_timezone)>100 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) OR
 p_base IS NULL OR p_base<0 OR p_base>=9007199254740991 OR p_mutation IS NULL
 THEN RAISE EXCEPTION 'Invalid preferences' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.set_config('diary.verified_owner',p_owner::text,true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,7));
 SELECT * INTO m FROM diary.preference_mutations WHERE owner_id=p_owner AND mutation_id=p_mutation;
 IF FOUND THEN
  IF pg_catalog.convert_to(m.theme,'UTF8')<>pg_catalog.convert_to(p_theme,'UTF8') OR pg_catalog.convert_to(m.timezone,'UTF8')<>pg_catalog.convert_to(p_timezone,'UTF8') OR m.base_version<>p_base
  THEN RAISE EXCEPTION 'Mutation identity reused' USING ERRCODE='22023'; END IF;
  IF m.version IS NULL THEN RETURN jsonb_build_object('kind','conflict','current',diary.read_preferences(p_owner)); END IF;
  RETURN jsonb_build_object('kind','acknowledged','acknowledgement',jsonb_build_object('version',m.version,'mutationId',p_mutation,'updatedAt',to_char(m.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 END IF;
 SELECT version INTO v FROM diary.preferences WHERE owner_id=p_owner; v:=coalesce(v,0);t:=clock_timestamp();
 IF v<>p_base THEN
  INSERT INTO diary.preference_mutations VALUES(p_owner,p_mutation,p_theme,p_timezone,p_base,NULL,t);
  RETURN jsonb_build_object('kind','conflict','current',diary.read_preferences(p_owner));
 END IF;
 INSERT INTO diary.preferences(owner_id,theme,timezone,version,last_mutation_id,updated_at)
 VALUES(p_owner,p_theme,p_timezone,v+1,p_mutation,t)
 ON CONFLICT(owner_id) DO UPDATE SET theme=EXCLUDED.theme,timezone=EXCLUDED.timezone,version=EXCLUDED.version,last_mutation_id=EXCLUDED.last_mutation_id,updated_at=EXCLUDED.updated_at;
 INSERT INTO diary.preference_mutations VALUES(p_owner,p_mutation,p_theme,p_timezone,p_base,v+1,t);
 RETURN jsonb_build_object('kind','acknowledged','acknowledgement',jsonb_build_object('version',v+1,'mutationId',p_mutation,'updatedAt',to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
END $$;
ALTER FUNCTION diary.read_preferences(uuid) OWNER TO diary_data_owner;
ALTER FUNCTION diary.write_preferences(uuid,text,text,bigint,uuid) OWNER TO diary_data_owner;
REVOKE ALL ON diary.preferences,diary.preference_mutations FROM PUBLIC,diary_entry_runtime,diary_auth_runtime;
REVOKE ALL ON FUNCTION diary.validate_preference_timezone(),diary.read_preferences(uuid),diary.write_preferences(uuid,text,text,bigint,uuid) FROM PUBLIC,diary_auth_runtime;
GRANT EXECUTE ON FUNCTION diary.read_preferences(uuid),diary.write_preferences(uuid,text,text,bigint,uuid) TO diary_entry_runtime;
COMMIT;

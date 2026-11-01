-- Operator-owned schema. Apply only after reviewing 001. No diary data tables.
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
CREATE TABLE private.diary_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_id uuid NOT NULL UNIQUE,
  auth_user_id text NOT NULL UNIQUE REFERENCES public.auth_user(id) ON DELETE RESTRICT
);
CREATE TABLE private.auth_rate_limit (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count > 0),
  started_at timestamptz NOT NULL
);
-- Provision a separate LOGIN principal as a member of this group out of band.
CREATE ROLE diary_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON public.auth_user, public.auth_account, public.auth_session,
  public.auth_verification, private.diary_owner, private.auth_rate_limit FROM PUBLIC;
GRANT USAGE ON SCHEMA public, private TO diary_auth_runtime;
GRANT SELECT ON public.auth_user, public.auth_account TO diary_auth_runtime;
GRANT UPDATE ("emailVerified", "updatedAt") ON public.auth_user TO diary_auth_runtime;
GRANT UPDATE (password, "updatedAt") ON public.auth_account TO diary_auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_session, public.auth_verification, private.auth_rate_limit TO diary_auth_runtime;
GRANT SELECT ON private.diary_owner TO diary_auth_runtime;

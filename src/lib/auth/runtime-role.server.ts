import "server-only";
import type { Pool } from "pg";

// Effective privileges include PUBLIC/inherited grants and column-level grants.
// This guard never promotes a role or repairs production permissions.
export async function assertAuthRuntime(pool: Pool) {
  const { rows } = await pool.query<{ unsafe: boolean }>(`SELECT
    EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user, r.oid, 'MEMBER')
      AND (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='diary' AND p.proname IN ('read_entry','write_entry','read_preferences','write_preferences') AND has_function_privilege(current_user,p.oid,'EXECUTE'))
    OR has_database_privilege(current_user, current_database(), 'CREATE')
    OR has_schema_privilege(current_user, 'public', 'CREATE')
    OR has_schema_privilege(current_user, 'private', 'CREATE')
    OR has_table_privilege(current_user, 'private.diary_owner', 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    OR has_any_column_privilege(current_user, 'private.diary_owner', 'INSERT,UPDATE')
    OR has_table_privilege(current_user, 'public.auth_user', 'INSERT,DELETE,TRUNCATE,TRIGGER')
    OR has_any_column_privilege(current_user, 'public.auth_user', 'INSERT')
    OR has_table_privilege(current_user, 'public.auth_account', 'INSERT,DELETE,TRUNCATE,TRIGGER')
    OR has_any_column_privilege(current_user, 'public.auth_account', 'INSERT')
    OR EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name IN ('auth_user', 'auth_account')
      AND NOT (c.table_name = 'auth_user' AND c.column_name IN ('emailVerified','updatedAt'))
      AND NOT (c.table_name = 'auth_account' AND c.column_name IN ('password','updatedAt'))
      AND has_column_privilege(current_user, format('%I.%I', c.table_schema, c.table_name), c.column_name, 'UPDATE')) AS unsafe`);
  if (rows.length !== 1 || rows[0]?.unsafe !== false) throw new Error("Auth runtime privileges are unsafe");
}

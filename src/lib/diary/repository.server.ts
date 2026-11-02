import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { postgresPoolOptions } from "../postgres-config.ts";
import type { VerifiedOwner } from "../auth/owner";
import type { CalendarDate } from "../dates";
import { entryWriteSchema, parseAcknowledgement, parseEntryForDate, type EntryWrite, type EntryWriteResult } from "./persistence-contracts.ts";

let pool: Pool | undefined;
export function diaryPool() {
  if (pool) return pool;
  // Never fall back to the provisioning or auth connection. Lazy: no build-time DB access.
  const value = process.env.DIARY_DATABASE_URL;
  if (!value || value === process.env.AUTH_DATABASE_URL || value === process.env.DATABASE_URL || value === process.env.DATABASE_URL_UNPOOLED) throw new Error("Separate diary runtime connection required");
  pool = new Pool(postgresPoolOptions(value));
  pool.on("error", () => {});
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}
export async function assertDiaryRuntime(connection: Pool) {
  const { rows } = await connection.query<{ unsafe: boolean }>(`SELECT
    EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user,r.oid,'MEMBER') AND
      (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolname='diary_data_owner'))
    OR has_database_privilege(current_user,current_database(),'CREATE')
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE'))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('diary','private','public') AND c.relkind IN ('r','p') AND
      (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='diary' AND c.relkind IN ('r','p') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR r.rolname<>'diary_data_owner'))
    OR has_function_privilege(current_user,'diary.read_entry(uuid,date)','EXECUTE WITH GRANT OPTION')
    OR has_function_privilege(current_user,'diary.write_entry(uuid,date,text,bigint,uuid)','EXECUTE WITH GRANT OPTION')
    OR has_function_privilege(current_user,'diary.read_preferences(uuid)','EXECUTE WITH GRANT OPTION')
    OR has_function_privilege(current_user,'diary.write_preferences(uuid,text,text,bigint,uuid)','EXECUTE WITH GRANT OPTION')
    OR NOT has_function_privilege(current_user,'diary.read_preferences(uuid)','EXECUTE')
    OR NOT has_function_privilege(current_user,'diary.write_preferences(uuid,text,text,bigint,uuid)','EXECUTE')
    OR NOT has_function_privilege(current_user,'diary.read_entry(uuid,date)','EXECUTE')
    OR NOT has_function_privilege(current_user,'diary.write_entry(uuid,date,text,bigint,uuid)','EXECUTE')
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='diary' AND p.proname IN ('read_entry','write_entry','read_preferences','write_preferences')
      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp'] AND r.rolname='diary_data_owner')<>4
    AS unsafe`);
  if (rows.length !== 1 || rows[0]?.unsafe !== false) throw new Error("Diary runtime privileges are unsafe");
}
export async function readEntry(owner: VerifiedOwner, date: CalendarDate, connection = diaryPool()) {
  await assertDiaryRuntime(connection);
  const { rows } = await connection.query("SELECT diary.read_entry($1::uuid,$2::date) AS result", [owner.ownerId, date]);
  return parseEntryForDate(date, rows[0]?.result);
}
export async function writeEntry(owner: VerifiedOwner, date: CalendarDate, input: EntryWrite, connection = diaryPool()): Promise<EntryWriteResult> {
  const request = entryWriteSchema.parse(input);
  await assertDiaryRuntime(connection);
  const { rows } = await connection.query("SELECT diary.write_entry($1::uuid,$2::date,$3::text,$4::bigint,$5::uuid) AS result", [owner.ownerId,date,request.content,request.baseVersion,request.mutationId]);
  const result: unknown = rows[0]?.result;
  if (typeof result !== "object" || !result) throw new Error("Invalid database response");
  if ("kind" in result && result.kind === "conflict" && "current" in result) return { kind: "conflict", current: parseEntryForDate(date, result.current) };
  if ("kind" in result && result.kind === "acknowledged" && "acknowledgement" in result) return { kind: "acknowledged", acknowledgement: parseAcknowledgement({ date, revision: 0, request }, result.acknowledgement) };
  throw new Error("Invalid database response");
}

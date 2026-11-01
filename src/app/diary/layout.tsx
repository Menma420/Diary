import { DiaryAccess } from "@/components/auth/DiaryAccess";
import { ownerResult } from "@/lib/auth/auth.server";
import { publicAccess } from "@/lib/auth/auth.server";
import { getServerEnvironment } from "@/lib/env.server";

export default async function DiaryLayout({ children }: { children: React.ReactNode }) {
  return <DiaryAccess initial={publicAccess(await ownerResult())} timeZone={getServerEnvironment().DEFAULT_TIMEZONE}>{children}</DiaryAccess>;
}

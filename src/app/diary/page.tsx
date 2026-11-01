import { redirect } from "next/navigation";
import { diaryPath, today } from "@/lib/dates";
import { getServerEnvironment } from "@/lib/env.server";
import { ownerResult } from "@/lib/auth/auth.server";

export const dynamic = "force-dynamic";
export default async function TodayPage() {
  if ((await ownerResult()).kind !== "owner") redirect("/login");
  redirect(diaryPath(today(getServerEnvironment().DEFAULT_TIMEZONE)));
}

import { redirect } from "next/navigation";
import { diaryPath, today } from "@/lib/dates";
import { getServerEnvironment } from "@/lib/env.server";

export const dynamic = "force-dynamic";
export default function TodayPage() {
  redirect(diaryPath(today(getServerEnvironment().DEFAULT_TIMEZONE)));
}

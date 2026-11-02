import { redirect } from "next/navigation";
import { diaryPath, today } from "@/lib/dates";
import { ownerPresentation } from "@/lib/preferences/presentation.server";
import { RouteNotice } from "@/components/diary/RouteNotice";


export const dynamic = "force-dynamic";
export default async function TodayPage() {
  const { access,preferences }=await ownerPresentation();
  if(access.kind!=="owner")redirect("/login");
  if(preferences.kind!=="loaded")return <RouteNotice title="Preferences unavailable"><p>Please retry loading this page. Your writing is unchanged.</p></RouteNotice>;
  redirect(diaryPath(today(preferences.preferences.timezone)));
}

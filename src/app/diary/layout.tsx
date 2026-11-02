import { DiaryAccess } from "@/components/auth/DiaryAccess";
import { ownerPresentation } from "@/lib/preferences/presentation.server";
import { publicAccess } from "@/lib/auth/auth.server";


export default async function DiaryLayout({ children }: { children: React.ReactNode }) {
  const { access,preferences }=await ownerPresentation();
  return <DiaryAccess initial={publicAccess(access)} initialPreferences={preferences} timeZone="Asia/Kolkata">{children}</DiaryAccess>;
}

import { DiarySession } from "@/components/diary/DiarySession";
import { getServerEnvironment } from "@/lib/env.server";

export default function DiaryLayout({ children }: { children: React.ReactNode }) {
  return <DiarySession timeZone={getServerEnvironment().DEFAULT_TIMEZONE}>{children}</DiarySession>;
}

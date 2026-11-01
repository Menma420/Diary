"use client";
import { RouteNotice } from "@/components/diary/RouteNotice";
export default function DiaryError({ retry }: { error: unknown; retry: () => void }) {
  return <RouteNotice title="This date could not be opened"><p>Your temporary drafts remain in this tab. Try opening the page again.</p><button type="button" onClick={retry}>Try again</button></RouteNotice>;
}

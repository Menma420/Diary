import { notFound } from "next/navigation";
import { DiaryRoute } from "@/components/auth/DiaryAccess";
import { ownerResult } from "@/lib/auth/auth.server";
import { publicAccess } from "@/lib/auth/auth.server";
import { dateFromRoute, type DateRouteParams } from "@/lib/dates";

export default async function DiaryPage({ params }: { params: Promise<DateRouteParams> }) {
  const date = dateFromRoute(await params);
  if (!date) notFound();
  return <DiaryRoute date={date} access={publicAccess(await ownerResult())} />;
}

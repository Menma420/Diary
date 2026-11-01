import { notFound } from "next/navigation";
import { DiaryPreview } from "@/components/diary/DiaryPreview";
import { dateFromRoute, type DateRouteParams } from "@/lib/dates";

export default async function DiaryPage({ params }: { params: Promise<DateRouteParams> }) {
  const date = dateFromRoute(await params);
  if (!date) notFound();
  return <DiaryPreview date={date} />;
}

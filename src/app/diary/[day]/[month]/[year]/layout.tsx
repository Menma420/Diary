import { notFound } from "next/navigation";
import { dateFromRoute, type DateRouteParams } from "@/lib/dates";

// Validate before the page's loading boundary streams a successful response.
export default async function DateLayout({ children, params }: { children: React.ReactNode; params: Promise<DateRouteParams> }) {
  if (!dateFromRoute(await params)) notFound();
  return children;
}

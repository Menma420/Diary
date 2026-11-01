import { RouteNotice } from "@/components/diary/RouteNotice";
export default function LoadingDate() {
  return <RouteNotice title="Opening your diary…"><p role="status">Loading the selected date.</p></RouteNotice>;
}

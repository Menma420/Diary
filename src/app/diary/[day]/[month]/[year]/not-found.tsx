import { RouteNotice } from "@/components/diary/RouteNotice";
export default function InvalidDate() {
  return <RouteNotice title="This date is not valid"><p>Use a Gregorian calendar date in DD/MM/YYYY format, from 01/01/0001 to 31/12/9999.</p></RouteNotice>;
}

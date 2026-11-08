import { OperationalView } from "@/components/operational-view";
import { getDashboard } from "@/lib/dashboard/service";

export default function Home() {
  return <OperationalView section="overview" fallback={getDashboard("operational")} />;
}

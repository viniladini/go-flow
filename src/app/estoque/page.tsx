import type { Metadata } from "next";
import { OperationalView } from "@/components/operational-view";
import { getDashboard } from "@/lib/dashboard/service";
export const metadata: Metadata = { title: "Saúde do estoque", description: "Indicadores de estoque calculados na fonte ativa do go.flow." };
export default function StockPage() { return <OperationalView section="stock" fallback={getDashboard("operational")} />; }

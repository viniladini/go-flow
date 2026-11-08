import type { Metadata } from "next";
import { OperationalView } from "@/components/operational-view";
export const metadata: Metadata = { title: "Oportunidades" };
export default function OpportunitiesPage() { return <OperationalView section="opportunities" />; }

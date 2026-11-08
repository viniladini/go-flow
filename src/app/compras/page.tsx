import type { Metadata } from "next";
import { OperationalView } from "@/components/operational-view";
export const metadata: Metadata = { title: "Compras inteligentes" };
export default function BuyingPage() { return <OperationalView section="buying" />; }

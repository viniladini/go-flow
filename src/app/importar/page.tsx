import type { Metadata } from "next";
import { FlowImport } from "@/components/flow-import";
export const metadata: Metadata = { title: "Flow Import", description: "Importação de dados operacionais processada exclusivamente no navegador, sem upload." };
export default function ImportPage() { return <FlowImport />; }

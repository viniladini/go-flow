import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent-workspace";
export const metadata: Metadata = { title: "Central de ações" };
export default function ActionsPage() { return <AgentWorkspace central />; }

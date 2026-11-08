import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent-workspace";
export const metadata: Metadata = { title: "go.agent" };
export default function AgentPage() { return <AgentWorkspace />; }

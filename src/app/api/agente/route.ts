import { agentHandlers } from "@/lib/agent/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;
export const POST = agentHandlers.POST;
export const PATCH = agentHandlers.PATCH;

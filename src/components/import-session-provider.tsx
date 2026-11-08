"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { createImportSession, type ImportSession } from "@/lib/flow-import/session";
import { createImportWizard, type ImportWizard } from "@/lib/flow-import/wizard";
import { createOperationalResource, type OperationalResource } from "@/lib/operations/resource";
import type { OperationalResult } from "@/lib/operations/service";
import { createAgentSession, type AgentSession } from "@/lib/agent/session";
import { agentTransport } from "@/lib/agent/client";
const Context = createContext<{ session: ImportSession; wizard: ImportWizard; operations: OperationalResource; agent: AgentSession } | null>(null);
export function ImportSessionProvider({ children, initialDemo }: { children: React.ReactNode; initialDemo?: OperationalResult }) {
  const [value] = useState(() => {
    const session = createImportSession();
    const wizard = createImportWizard(session, () => new Worker(new URL("../lib/flow-import/import.worker.ts", import.meta.url), { type: "module" }));
    const operations = createOperationalResource(session, () => new Worker(new URL("../lib/operations/operations.worker.ts", import.meta.url), { type: "module" }), initialDemo);
    const agent = createAgentSession(session, agentTransport);
    return { session, wizard, operations, agent };
  });
  useEffect(() => { value.operations.start(); value.agent.start(); return () => { value.wizard.dispose(); value.operations.dispose(); value.agent.dispose(); }; }, [value]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAgentSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Sessão do agente indisponível.");
  const state = useSyncExternalStore(value.agent.subscribe, value.agent.getSnapshot, value.agent.getSnapshot);
  return { agent: value.agent, state };
}
export function useOperationalSource() {
  const value = useContext(Context);
  const emptySubscribe = () => () => {};
  const state = useSyncExternalStore(value?.operations.subscribe ?? emptySubscribe, value?.operations.getSnapshot ?? (() => null), value?.operations.getSnapshot ?? (() => null));
  return value && state ? { state, retry: value.operations.retry } : null;
}
export function useImportSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Sessão de importação indisponível.");
  const { session } = value;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, snapshot };
}
export function useImportWizard() {
  const value = useContext(Context);
  if (!value) throw new Error("Fluxo de importação indisponível.");
  const state = useSyncExternalStore(value.wizard.subscribe, value.wizard.getSnapshot, value.wizard.getSnapshot);
  return { wizard: value.wizard, state };
}

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { AGENT_LIMITS, AgentError, validReviewToken } from "./contracts";
import type { AgentAction } from "./contracts";

// Domain-separated from API authentication. Key rotation invalidates old receipts.
function mac(key: string, purpose: string, value: string) {
  return createHmac("sha256", key).update(`go.flow/v1/${purpose}\0${value}`).digest("hex");
}
export function visitor(request: Request) {
  const secure = process.env.NODE_ENV === "production";
  const name = secure ? "__Host-goflow-demo-session" : "goflow-demo-session";
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  const existing = values.length === 1 ? values[0].slice(name.length + 1) : "";
  const id = /^[a-f0-9]{64}$/.test(existing) ? existing : null;
  return { id, create: () => {
    const value = id ?? randomBytes(32).toString("hex");
    return { id: value, cookie: `${name}=${value}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}` };
  } };
}
export function signAction(action: AgentAction, session: string, key: string) {
  const payload = Buffer.from(JSON.stringify({ v: 1, visitor: mac(key, "visitor", session), action }));
  if (payload.length > AGENT_LIMITS.receiptBytes) throw new AgentError("RESULT_TOO_LARGE", "Resultado acima do limite de revisão. Reduza o escopo.", 422);
  const encoded = deflateSync(payload).toString("base64url");
  const token = `${encoded}.${mac(key, "receipt", encoded)}`;
  if (!validReviewToken(token)) throw new AgentError("RESULT_TOO_LARGE", "Resultado acima do limite de revisão. Reduza o escopo.", 422);
  return token;
}
export function verifyAction(token: string, id: string, session: string | null, key: string, now: number): AgentAction {
  try {
    if (!session || !validReviewToken(token)) throw new Error();
    const [encoded, signature] = token.split(".");
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(key, "receipt", encoded), "hex"))) throw new Error();
    // Authenticate before decompressing. Neither untrusted JSON nor zip bombs reach parsing.
    const value = JSON.parse(inflateSync(Buffer.from(encoded, "base64url"), { maxOutputLength: AGENT_LIMITS.receiptBytes }).toString("utf8"));
    const action = value.action as AgentAction;
    if (value.v !== 1 || value.visitor !== mac(key, "visitor", session) || action.id !== id || action.source !== "demo" ||
      !Number.isFinite(Date.parse(action.expiresAt)) || Date.parse(action.expiresAt) <= now || Date.parse(action.createdAt) > now) throw new Error();
    return action;
  } catch { throw new AgentError("NOT_FOUND", "Comprovante expirado, indisponível ou pertencente a outra sessão. Nenhuma compra foi executada.", 404); }
}

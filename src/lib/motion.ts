/** One motion owner per element: native snapshots OR WAAPI, never both. */
export const MOTION = { instant: 100, quick: 210, panelExit: 280, standard: 330, spatial: 480, editorial: 780 } as const;
export const MOTION_EASING = {
  spatial: "cubic-bezier(.26,.05,.2,1)",
  panel: "cubic-bezier(.3,0,.2,1)",
} as const;
export type RouteMotion = "lateral" | "planning" | "analysis" | "agent" | "review" | "return";
export function routeMotion(from: string, to: string): RouteMotion {
  if (from === to) return "return";
  if (to === "/acoes") return "review";
  if (to === "/agente") return "agent";
  if (to === "/oportunidades") return "analysis";
  if (to === "/compras") return "planning";
  if (to === "/") return "return";
  return "lateral";
}
export function routeFrames(kind: RouteMotion): Keyframe[] {
  const origins: Record<RouteMotion, string> = {
    lateral: "translateX(12px)", planning: "translateY(10px)", analysis: "translateY(6px)",
    agent: "translateX(10px) scale(.99)", review: "translateX(16px)", return: "scale(.995)",
  };
  return [{ opacity: .25, transform: origins[kind] }, { opacity: 1, transform: "none" }];
}

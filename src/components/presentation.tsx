"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileUp, Play, RotateCcw, Sparkles } from "lucide-react";
import { Brand } from "./brand";
import { FlowOrb } from "./flow-orb";
import { ProductFlow } from "./product-flow";
import { useImportSession } from "./import-session-provider";
import { PRESENTATION_KEY, PRESENTATION_SCENES, RETURNING_FRAME_MS, SCENE_TRANSITION_MS, SPLASH_FRAME_MS, viewportIris } from "@/lib/presentation";

const ReplayContext = createContext<(() => void) | null>(null);
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
function reducedMotion() { return window.matchMedia?.(motionQuery).matches ?? false; }
const subscribeVisit = () => () => {};
function visited() { try { return window.localStorage.getItem(PRESENTATION_KEY) === "seen"; } catch { return false; } }
type Screen = { mode: "splash" | "scenes" | "handoff" | "closed"; frame: number; scene: number; target: string | null; previous: number | null; transition: string; returning: boolean; splashExit: boolean; replaying: boolean; exitBox: CSSProperties | undefined };
const initial: Screen = { mode: "splash", frame: 0, scene: 0, target: null, previous: null, transition: "initial", returning: false, splashExit: false, replaying: false, exitBox: undefined };

export function PresentationReplay({ onReplay }: { onReplay?: () => void }) {
  const replay = useContext(ReplayContext);
  return replay ? <button className="presentation-replay" onClick={() => { onReplay?.(); replay(); }}><RotateCcw size={16} aria-hidden="true" />Rever apresentação</button> : null;
}

export function Presentation({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const { snapshot } = useImportSession();
  const [screen, setScreen] = useState<Screen>(initial);
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const seen = useSyncExternalStore(subscribeVisit, visited, () => false);
  const shortOpening = screen.returning || (seen && !screen.replaying && screen.mode === "splash");
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const handoff = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null), finishing = useRef(false);
  const returning = useRef(false), moving = useRef(false);
  const ready = screen.mode === "handoff" && (!screen.target || pathname === screen.target);

  useLayoutEffect(() => {
    if (ready && handoff.current) handoff.current.scrollTop = dialog.current?.scrollTop ?? 0;
  }, [ready]);

  useEffect(() => {
    let seen = false;
    try { seen = window.localStorage.getItem(PRESENTATION_KEY) === "seen"; } catch { /* Optional preference. */ }
    returning.current = seen;
    restoreFocus.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    document.documentElement.dataset.presentationBooted = "true";
    return () => { delete document.documentElement.dataset.presentationBooted; };
  }, []);

  useEffect(() => {
    if (!dialog.current?.open || screen.mode !== "splash") return;
    const short = returning.current;
    if (!short && screen.frame === 1) return;
    const timer = window.setTimeout(() => {
      if (!short && screen.frame === 2) moving.current = false;
      setScreen((current) => {
      if (current.mode !== "splash") return current;
      if (short && (reduce || current.frame === 1)) return { ...current, mode: "handoff", returning: true };
      if (current.frame === 2) return { ...current, mode: "scenes", scene: 0 };
      if (reduce) return { ...current, frame: 1 };
      return { ...current, frame: current.frame + 1, returning: short };
      });
    }, reduce ? 0 : (short ? RETURNING_FRAME_MS : SPLASH_FRAME_MS)[screen.frame]);
    return () => window.clearTimeout(timer);
  }, [screen, reduce]);

  useLayoutEffect(() => {
    if (screen.mode !== "splash" || screen.frame !== 2) return;
    const measure = () => {
      const point = dialog.current?.querySelector(".splash-dot")?.getBoundingClientRect();
      if (!point || !dialog.current) return;
      const iris = viewportIris(window.innerWidth, window.innerHeight, point.left + point.width / 2, point.bottom - point.height * .15);
      dialog.current.style.setProperty("--iris-x", `${iris.x}px`);
      dialog.current.style.setProperty("--iris-y", `${iris.y}px`);
      dialog.current.style.setProperty("--iris-size", `${iris.diameter}px`);
    };
    measure(); window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [screen.mode, screen.frame]);

  useEffect(() => {
    if (screen.previous === null) return;
    const timer = window.setTimeout(() => {
      moving.current = false;
      setScreen((current) => ({ ...current, previous: null }));
    }, reduce ? 0 : SCENE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [screen.previous, screen.scene, reduce]);

  useEffect(() => {
    if (screen.mode === "scenes" && dialog.current?.open) heading.current?.focus({ preventScroll: true });
  }, [screen.mode, screen.scene]);

  useEffect(() => {
    if (!ready) return;
    const x = window.scrollX, y = window.scrollY;
    dialog.current?.close();
    const target = screen.target || !restoreFocus.current?.isConnected || restoreFocus.current === document.body
      ? document.querySelector<HTMLElement>("#conteudo") : restoreFocus.current;
    target?.focus({ preventScroll: true });
    // Undo only a native dialog/focus jump, never the destination router's scroll.
    if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
  }, [ready, screen.target]);

  // Fallback also completes handoff if CSS animations are disabled or interrupted.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setScreen((current) => ({ ...current, mode: "closed" })), reduce ? 0 : 850);
    return () => window.clearTimeout(timer);
  }, [ready, reduce]);

  const replay = () => {
    finishing.current = false;
    returning.current = false; moving.current = false;
    restoreFocus.current = document.activeElement as HTMLElement;
    setScreen({ ...initial, replaying: true });
    dialog.current?.showModal();
  };
  const finish = (target: string | null) => {
    if (finishing.current) return;
    finishing.current = true;
    try { window.localStorage.setItem(PRESENTATION_KEY, "seen"); } catch { /* Never required for entry. */ }
    document.documentElement.dataset.presentationVisit = "returning";
    moving.current = false;
    setScreen((current) => ({ ...current, mode: "handoff", previous: null, splashExit: current.mode === "splash", target }));
    if (target && pathname !== target) router.push(target);
  };
  const move = (direction: number) => {
    if (screen.mode !== "scenes" || moving.current) return;
    const next = Math.max(0, Math.min(4, screen.scene + direction));
    if (screen.mode === "scenes" && next === screen.scene) return;
    returning.current = false;
    moving.current = !reduce && screen.mode === "scenes";
    const previous = moving.current ? screen.scene : null;
    const node = heading.current?.closest(".presentation-scene");
    const box = node?.getBoundingClientRect(), stage = node?.parentElement?.getBoundingClientRect();
    const exitBox = previous !== null && box?.width && stage ? { width: box.width, height: box.height, top: box.top - stage.top, left: box.left - stage.left, right: "auto", bottom: "auto", margin: 0 } : undefined;
    setScreen((current) => ({ ...current, mode: "scenes", returning: false, scene: next, previous, exitBox, transition: current.mode === "scenes" ? `${current.scene}-${next}` : "initial" }));
  };
  const enter = () => {
    if (screen.mode !== "splash" || moving.current || shortOpening) return;
    moving.current = !reduce;
    setScreen((current) => ({ ...current, frame: reduce ? 1 : 2, mode: reduce ? "scenes" : "splash", scene: 0 }));
  };
  const skip = () => {
    if (screen.mode === "handoff") setScreen((current) => ({ ...current, target: null }));
    else finish(null);
  };
  const renderScene = (index: number, outgoing = false, clone = false) => {
    const scene = PRESENTATION_SCENES[index];
    return <section className={`presentation-scene${outgoing ? " outgoing" : ""}`} key={`${clone ? "handoff" : "dialog"}:scene:${index}`} data-scene={index} style={outgoing ? screen.exitBox : undefined} inert={outgoing || clone || undefined}
      aria-hidden={outgoing || clone || undefined} aria-labelledby={outgoing || clone ? undefined : "presentation-title"}>
        <h1 className={index === 3 ? "sr-only" : undefined} ref={outgoing || clone ? undefined : heading} id={outgoing || clone ? undefined : "presentation-title"} tabIndex={-1}>{index === 1 ? <><span>o próximo</span>{" "}<mark>movimento</mark>{" "}<span>começa aqui.</span></> : index === 2 ? <><span>conheça o</span>{" "}<span className="agent-title-accent">go.agent.</span></> : index === 4 ? <><span>como deseja</span>{" "}<span>começar?</span></> : scene.title}</h1>
        {index === 0 && <p className="presentation-welcome">bem-vindo ao<br />go.flow.</p>}
        <p className="presentation-description">{scene.description}</p>
        {index === 3 && <ProductFlow journey />}
        {index === 2 && <><div className="presentation-orb"><svg className="orb-trail" viewBox="0 0 320 280" aria-hidden="true"><path d="M330 270H225C55 270 285 30 100 45H-20" /></svg><FlowOrb /></div><p className="presentation-agent"><Sparkles size={20} aria-hidden="true" />Ferramenta real. Cálculo determinístico. Revisão humana.</p></>}
        {index === 4 && <div className="presentation-choices">
          <button onClick={() => finish("/")} disabled={screen.mode === "handoff"} className="presentation-choice"><Play size={22} aria-hidden="true" /><strong>{snapshot.operation ? "Continuar operação ativa" : "Explorar ambiente demonstrativo"}</strong><span>{snapshot.operation ? "Sua fonte local e seus dados permanecem intactos." : "Dados sintéticos independentes, dashboards e go.agent com IA. Sem login."}</span><ArrowRight size={20} aria-hidden="true" /></button>
          <button onClick={() => finish("/importar")} disabled={screen.mode === "handoff"} className="presentation-choice"><FileUp size={22} aria-hidden="true" /><strong>Analisar operação local</strong><span>Importe seus arquivos. Análises no navegador, sem enviar dados ou pedidos à IA externa.</span><ArrowRight size={20} aria-hidden="true" /></button>
        </div>}
        {index === 4 && <p className="presentation-route-status" role="status">{screen.mode === "handoff" && !ready ? "Abrindo a aplicação…" : "\u00a0"}</p>}
      </section>;
  };
  const renderWordmark = (compact = false) => <div className="splash-wordmark" data-frame={compact ? 1 : screen.frame} aria-hidden="true"><span>go<span className="splash-dot">.</span></span><span className="splash-flow">flow</span></div>;
  const renderContents = (clone = false) => shortOpening ? <div className="presentation-splash presentation-returning" aria-label="go.flow">{renderWordmark(true)}</div> : <>
      <header className="presentation-header">{screen.mode === "splash" || screen.splashExit ? <span className="splash-signature">gogroup</span> : <span className="scene-caption">{["01 / olá", "02 / propósito", "03 / go.agent", "04 / como funciona", "05 / vamos começar"][screen.scene]}</span>}<div className="presentation-header-right">{screen.mode !== "splash" && <ol className="scene-dots" aria-label="Progresso da apresentação">{PRESENTATION_SCENES.map((item, index) => <li key={item.title} aria-current={index === screen.scene ? "step" : undefined}><span className="sr-only">{index + 1}: {item.title}</span></li>)}</ol>}<button className="presentation-skip" onClick={skip}>{screen.mode === "handoff" ? "Voltar à aplicação" : "Pular apresentação"}</button></div></header>
      <p className="presentation-slogan" key={`${clone ? "handoff" : "dialog"}:slogan`}><span>From insight to action.</span></p>
      <div className="presentation-curves" aria-hidden="true"><svg viewBox="0 0 400 400" fill="none"><path d="M-30 340H90C240 340 120 80 300 80H430" /><path d="M-30 390H120C280 390 160 130 330 130H430" /><circle cx="300" cy="80" r="12" /></svg></div>
      {screen.previous !== null && <div className="cinematic-surface" data-from={screen.previous} data-transition={screen.transition} key={`${clone ? "handoff" : "dialog"}:surface:${screen.transition}`} aria-hidden="true" />}
      {screen.mode === "splash" && screen.frame === 2 && <div className="presentation-iris" aria-hidden="true"><div className="iris-depth" /><svg className="iris-curves" viewBox="0 0 1000 1000" fill="none"><path d="M-80 700H240C650 700 340 200 900 200H1100" /><path d="M-80 760H260C720 760 370 260 940 260H1100" /></svg></div>}
      {screen.mode === "splash" || screen.returning || screen.splashExit ? <div className="presentation-splash" aria-label="go.flow — From insight to action.">
        {renderWordmark()}
        <p className="splash-description">inteligência operacional<br />que conecta dados,<br />decisões e ação.</p>
        <button className="presentation-next" onClick={enter}>Conheça o go.flow <ArrowRight size={18} aria-hidden="true" /></button>
      </div> : <div className="cinematic-stage" data-transition={screen.transition}>
        {renderScene(screen.scene, false, clone)}
        {screen.previous !== null && renderScene(screen.previous, true, clone)}
      </div>}
      <svg className="cinematic-guide" data-transition={screen.transition} key={`${clone ? "handoff" : "dialog"}:guide:${screen.transition}`} viewBox="0 0 1000 600" fill="none" aria-hidden="true"><path d="M-40 520H120C460 520 260 100 650 100H1040" /></svg>
      <footer className="presentation-footer"><span>Protótipo independente · Gogroup</span>{screen.mode !== "splash" && <nav aria-label="Controles da apresentação">
        {screen.scene > 0 && <button aria-label="Voltar" onClick={() => move(-1)} disabled={screen.mode !== "scenes" || screen.previous !== null}><ArrowLeft size={18} aria-hidden="true" /><span className="sr-only">Voltar</span></button>}
        <span role="status" aria-live="polite">{screen.scene + 1} de 5</span>
        {screen.scene < 4 && <button className="scene-next" aria-label={screen.scene === 0 ? "Começar" : "Avançar"} onClick={() => move(1)} disabled={screen.mode !== "scenes" || screen.previous !== null}><span className="sr-only">{screen.scene === 0 ? "Começar" : "Avançar"}</span><ArrowRight size={22} aria-hidden="true" /></button>}
      </nav>}</footer>
  </>;
  return <ReplayContext.Provider value={replay}>
    <div className="presentation-underlay" data-handoff={ready && !reduce ? "true" : undefined}>{children}</div>
    <div className="presentation-primer" aria-hidden="true"><Brand /></div>
    <dialog ref={dialog} className="presentation-dialog" data-mode={screen.mode} data-scene={screen.scene} data-frame={screen.frame} data-returning={shortOpening || undefined} data-opening={shortOpening || screen.splashExit || undefined}
      aria-label="Apresentação do go.flow" aria-modal="true" onCancel={(event) => { event.preventDefault(); skip(); }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      }}>{renderContents()}</dialog>
    {ready && !reduce && <div ref={handoff} className="presentation-dialog presentation-handoff" data-mode={screen.mode} data-scene={screen.scene} data-frame={screen.frame} data-returning={screen.returning || undefined} data-opening={screen.returning || screen.splashExit || undefined} aria-hidden="true" inert
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) setScreen((current) => ({ ...current, mode: "closed" })); }}>{renderContents(true)}</div>}
  </ReplayContext.Provider>;
}

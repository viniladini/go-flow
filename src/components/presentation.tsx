"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileUp, Play, RotateCcw, Sparkles } from "lucide-react";
import { Brand } from "./brand";
import { FlowOrb } from "./flow-orb";
import { useImportSession } from "./import-session-provider";
import { PRESENTATION_KEY, PRESENTATION_SCENES, PRESENTATION_PALETTE, presentationColors, SCENE_TRANSITION_MS, SPLASH_FRAME_MS, IRIS_EXPANSION_MS, WELCOME_OVERLAP_MS, WELCOME_ENTER_MS, LOGO_GO_MS, LOGO_FLOW_MS, LOGO_FLOW_DELAY_MS, viewportIris } from "@/lib/presentation";

const ReplayContext = createContext<(() => void) | null>(null);
const prototypeNotice = "Protótipo independente · Gogroup";
const sceneCaptions = ["01 / olá", "02 / natureza", "03 / movimento", "04 / go.agent", "05 / vamos começar"];
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
function reducedMotion() { return window.matchMedia?.(motionQuery).matches ?? false; }
const subscribeVisit = () => () => {};
function visited() { try { return window.localStorage.getItem(PRESENTATION_KEY) === "seen"; } catch { return false; } }
type Screen = { mode: "splash" | "scenes" | "handoff" | "closed"; frame: number; scene: number; target: string | null; previous: number | null; transition: string; returning: boolean; splashExit: boolean; replaying: boolean; exitBox: CSSProperties | undefined; covered: boolean; fast: boolean; splashBox?: CSSProperties };
const initial: Screen = { mode: "splash", frame: 0, scene: 0, target: null, previous: null, transition: "initial", returning: false, splashExit: false, replaying: false, exitBox: undefined, covered: false, fast: false };

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
  const revealing = screen.mode === "splash" && screen.frame === 2;
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const handoff = useRef<HTMLDivElement>(null);
  const noticeFooter = useRef<HTMLElement>(null), noticeAnchor = useRef<HTMLSpanElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null), finishing = useRef(false);
  const returning = useRef(false), moving = useRef(false);
  const ready = screen.mode === "handoff" && (screen.covered || reduce) && (!screen.target || pathname === screen.target);
  const sceneNoticeVisible = screen.mode === "scenes" || (screen.mode === "handoff" && !screen.splashExit && !shortOpening);

  useLayoutEffect(() => {
    const footer = noticeFooter.current, anchor = noticeAnchor.current, root = dialog.current;
    if (!footer || !anchor || !root) return;
    const slogan = root.querySelector<HTMLElement>('[data-chrome-anchor="slogan"] > span');
    let sloganFrame: number | undefined;
    const syncSlogan = () => { if (slogan) root.style.setProperty("--chrome-slogan-transform", getComputedStyle(slogan).transform || "none"); };
    const followSlogan = () => { syncSlogan(); sloganFrame = window.requestAnimationFrame(followSlogan); };
    const sloganTransition = (event: TransitionEvent) => {
      if (event.target !== slogan || event.propertyName !== "transform") return;
      if (sloganFrame !== undefined) window.cancelAnimationFrame(sloganFrame);
      sloganFrame = undefined;
      syncSlogan();
      if (event.type === "transitionrun") sloganFrame = window.requestAnimationFrame(followSlogan);
    };
    // Preserve the existing footer's exact layout. Only geometry is shared;
    // each scene owns its notice's ink/surface and its existing reveal mask.
    const measure = () => {
      const bar = footer.getBoundingClientRect(), text = anchor.getBoundingClientRect();
      if (bar.width) {
        const geometry = {
        "bar-x": bar.left, "bar-y": bar.top, "bar-width": bar.width, "bar-height": bar.height,
        "copy-x": text.left - bar.left, "copy-y": text.top - bar.top, "copy-width": text.width, "copy-height": text.height,
      };
      for (const [key, value] of Object.entries(geometry)) root.style.setProperty(`--notice-${key}`, `${value}px`);
      const textStyle = getComputedStyle(anchor);
      if (textStyle.font) root.style.setProperty("--notice-font", textStyle.font);
      root.style.setProperty("--notice-text-align", textStyle.textAlign || "start");
      root.style.setProperty("--notice-letter-spacing", textStyle.letterSpacing || "normal");
      }
      for (const name of ["header", "slogan"] as const) {
        const element = root.querySelector<HTMLElement>(`[data-chrome-anchor="${name}"]`);
        const box = element?.getBoundingClientRect();
        if (!box?.width) continue;
        for (const [key, value] of Object.entries({ x: box.left, y: box.top, width: box.width, height: box.height })) root.style.setProperty(`--chrome-${name}-${key}`, `${value}px`);
      }
      const skip = root.querySelector<HTMLButtonElement>('[data-chrome-anchor="header"] button.presentation-skip');
      if (skip) {
        const box = skip.getBoundingClientRect();
        // Empty slots reserve the dots' position; no masked copy of the label.
        if (box.width && box.height) {
          root.style.setProperty("--chrome-skip-width", `${box.width}px`);
          root.style.setProperty("--chrome-skip-height", `${box.height}px`);
        }
      }
      const navigation = root.querySelector<HTMLElement>('[data-chrome-anchor="navigation"]');
      const box = navigation?.getBoundingClientRect();
      if (navigation && box?.width && bar.width) {
        root.style.setProperty("--chrome-nav-top", `${box.top - bar.top}px`);
        root.style.setProperty("--chrome-nav-right", `${bar.right - box.right}px`);
        root.style.setProperty("--chrome-nav-gap", getComputedStyle(navigation).columnGap || "20px");
      }
      syncSlogan();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(footer); observer?.observe(anchor);
    root.querySelectorAll<HTMLElement>("[data-chrome-anchor]").forEach((element) => observer?.observe(element));
    const skip = root.querySelector<HTMLButtonElement>('[data-chrome-anchor="header"] button.presentation-skip');
    if (skip) observer?.observe(skip);
    window.addEventListener("resize", measure);
    slogan?.addEventListener("transitionrun", sloganTransition);
    slogan?.addEventListener("transitionend", sloganTransition);
    slogan?.addEventListener("transitioncancel", sloganTransition);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", measure);
      if (sloganFrame !== undefined) window.cancelAnimationFrame(sloganFrame);
      slogan?.removeEventListener("transitionrun", sloganTransition);
      slogan?.removeEventListener("transitionend", sloganTransition);
      slogan?.removeEventListener("transitioncancel", sloganTransition);
    };
  }, [screen.mode, screen.frame, screen.scene]);

  useLayoutEffect(() => {
    const button = skipButton.current, root = dialog.current;
    const label = button?.querySelector<HTMLElement>(".presentation-skip-label");
    if (!button || !label || !root) return;
    const clearPaint = () => {
      delete button.dataset.revealing;
      for (const property of ["--skip-reveal-paint", "--skip-paint-size", "--skip-label-position"]) button.style.removeProperty(property);
    };
    const incoming = root.querySelector<HTMLElement>(".cinematic-stage > .presentation-scene:not(.outgoing)");
    const iris = revealing ? root.querySelector<HTMLElement>(".presentation-iris") : null;
    if ((!sceneNoticeVisible && !iris) || !incoming) { clearPaint(); button.style.removeProperty("--skip-ink"); return; }
    const canvasStyle = getComputedStyle(incoming), targetInk = canvasStyle.color;
    if (reduce || (!iris && (!canvasStyle.clipPath || canvasStyle.clipPath === "none"))) { clearPaint(); button.style.setProperty("--skip-ink", targetInk); return; }
    const outgoing = root.querySelector<HTMLElement>(".cinematic-stage > .outgoing");
    const sourceInk = outgoing ? getComputedStyle(outgoing).color : getComputedStyle(button).color;
    button.style.setProperty("--skip-ink", sourceInk);
    let frame: number | undefined;
    const followMask = () => {
      const canvas = incoming.getBoundingClientRect(), box = button.getBoundingClientRect(), text = label.getBoundingClientRect();
      const circle = iris?.getBoundingClientRect();
      const clip = circle ? `circle(${circle.width / 2}px at ${circle.left + circle.width / 2 - canvas.left}px ${circle.top + circle.height / 2 - canvas.top}px)` : getComputedStyle(incoming).clipPath;
      if (!circle && (!clip || clip === "none")) { clearPaint(); button.style.setProperty("--skip-ink", targetInk); return; }
      if (box.width && box.height && canvas.width && canvas.height) {
        // Reuse the browser's interpolated mask verbatim, in the same viewport
        // coordinates. This tiny ink image contains NO text: one natural-size
        // HTML label and one border sample it. Even a mask crossing a glyph is
        // spatially correct, rather than switching the whole button at a threshold.
        // Crop to the button (+ its existing hover ring), never a viewport bitmap.
        const width = box.width + 4, height = box.height + 4;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${sourceInk}"/><svg x="${canvas.left - box.left + 2}" y="${canvas.top - box.top + 2}" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><rect width="100%" height="100%" fill="${targetInk}" style="clip-path:${clip || "none"}"/></svg></svg>`;
        button.style.setProperty("--skip-reveal-paint", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
        button.style.setProperty("--skip-paint-size", `${width}px ${height}px`);
        button.style.setProperty("--skip-label-position", `${box.left - text.left - 2}px ${box.top - text.top - 2}px`);
        button.dataset.revealing = "true";
      }
      frame = window.requestAnimationFrame(followMask);
    };
    followMask();
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); clearPaint(); };
  }, [screen.mode, screen.scene, screen.previous, sceneNoticeVisible, revealing, reduce]);

  useEffect(() => {
    if (screen.mode !== "handoff" || screen.covered) return;
    const timer = window.setTimeout(() => setScreen((current) => ({ ...current, covered: true })), reduce ? 0 : screen.fast ? 120 : 720);
    return () => window.clearTimeout(timer);
  }, [screen.mode, screen.covered, screen.fast, reduce]);

  useLayoutEffect(() => {
    if (ready && handoff.current) handoff.current.scrollTop = dialog.current?.scrollTop ?? 0;
  }, [ready]);

  useEffect(() => {
    let active = true;
    let seen = false;
    try { seen = window.localStorage.getItem(PRESENTATION_KEY) === "seen"; } catch { /* Optional preference. */ }
    returning.current = seen;
    restoreFocus.current = document.activeElement as HTMLElement;
    if (seen) {
      // Returning visitors enter directly: no timed logo/colour/handoff sequence.
      queueMicrotask(() => { if (active) setScreen((current) => ({ ...current, mode: "closed" })); });
    } else dialog.current?.showModal();
    document.documentElement.dataset.presentationBooted = "true";
    return () => { active = false; delete document.documentElement.dataset.presentationBooted; };
  }, []);

  useEffect(() => {
    if (!dialog.current?.open || screen.mode !== "splash") return;
    if (screen.frame === 1) return;
    const timer = window.setTimeout(() => {
      if (screen.frame === 2) moving.current = false;
      setScreen((current) => {
      if (current.mode !== "splash") return current;
      if (current.frame === 2) return { ...current, mode: "scenes", scene: 0 };
      if (reduce) return { ...current, frame: 1 };
      return { ...current, frame: current.frame + 1 };
      });
    }, reduce ? 0 : SPLASH_FRAME_MS[screen.frame]);
    return () => window.clearTimeout(timer);
  }, [screen, reduce]);

  useLayoutEffect(() => {
    if (!(screen.mode === "splash" && screen.frame === 2) && screen.mode !== "handoff") return;
    const measure = () => {
      const point = dialog.current?.querySelector(".splash-dot")?.getBoundingClientRect();
      if (!dialog.current) return;
      const x = point?.width ? point.left + point.width / 2 : parseFloat(dialog.current.style.getPropertyValue("--iris-x")) || window.innerWidth / 2;
      const y = point?.height ? point.top + point.height / 2 : parseFloat(dialog.current.style.getPropertyValue("--iris-y")) || window.innerHeight / 2;
      const iris = viewportIris(window.innerWidth, window.innerHeight, x, y);
      dialog.current.style.setProperty("--iris-x", `${iris.x}px`);
      dialog.current.style.setProperty("--iris-y", `${iris.y}px`);
      dialog.current.style.setProperty("--iris-size", `${iris.diameter}px`);
      if (point?.width) dialog.current.style.setProperty("--iris-seed-scale", `${Math.max(1, point.width) / iris.diameter}`);
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
    const timer = window.setTimeout(() => setScreen((current) => ({ ...current, mode: "closed" })), reduce ? 0 : 1200);
    return () => window.clearTimeout(timer);
  }, [ready, reduce]);

  const replay = () => {
    finishing.current = false;
    returning.current = false; moving.current = false;
    restoreFocus.current = document.activeElement as HTMLElement;
    setScreen({ ...initial, replaying: true });
    dialog.current?.showModal();
  };
  const finish = (target: string | null, fast = false) => {
    if (finishing.current) return;
    finishing.current = true;
    try { window.localStorage.setItem(PRESENTATION_KEY, "seen"); } catch { /* Never required for entry. */ }
    document.documentElement.dataset.presentationVisit = "returning";
    const point = dialog.current?.querySelector(".splash-dot")?.getBoundingClientRect();
    const iris = point?.width ? viewportIris(window.innerWidth, window.innerHeight, point.left + point.width / 2, point.top + point.height / 2) : null;
    if (iris && dialog.current) {
      dialog.current.style.setProperty("--iris-x", `${iris.x}px`);
      dialog.current.style.setProperty("--iris-y", `${iris.y}px`);
      dialog.current.style.setProperty("--iris-size", `${iris.diameter}px`);
      dialog.current.style.setProperty("--iris-seed-scale", `${Math.max(1, point!.width) / iris.diameter}`);
    }
    moving.current = false;
    setScreen((current) => ({ ...current, mode: "handoff", previous: null, splashExit: current.mode === "splash", target, covered: false, fast }));
    if (target && pathname !== target) router.push(target);
  };
  const move = (direction: number) => {
    if (screen.mode !== "scenes") return;
    const next = Math.max(0, Math.min(4, screen.scene + direction));
    if (screen.mode === "scenes" && next === screen.scene) return;
    returning.current = false;
    moving.current = !reduce && screen.mode === "scenes";
    const previous = moving.current ? screen.scene : null;
    const node = heading.current?.closest(".presentation-scene");
    const orb = node?.querySelector(".presentation-orb")?.getBoundingClientRect();
    if (orb?.width && dialog.current) {
      dialog.current.style.setProperty("--scene-origin-x", `${orb.left + orb.width / 2}px`);
      dialog.current.style.setProperty("--scene-origin-y", `${orb.top + orb.height / 2}px`);
    }
    // The viewport canvas never moves; only its content leaves. A new click replaces
    // the transition rather than queuing scenes or holding controls disabled.
    const ink = node?.querySelector(".scene-content");
    const exitBox = previous !== null ? { "--exit-opacity": ink ? getComputedStyle(ink).opacity : "1", "--exit-transform": ink ? getComputedStyle(ink).transform : "none" } as CSSProperties : undefined;
    setScreen((current) => ({ ...current, mode: "scenes", returning: false, scene: next, previous, exitBox, transition: current.mode === "scenes" ? `${current.scene}-${next}` : "initial" }));
  };
  const enter = () => {
    if (screen.mode !== "splash" || moving.current || shortOpening) return;
    moving.current = !reduce;
    const box = dialog.current?.querySelector(".presentation-splash")?.getBoundingClientRect();
    const splashBox: CSSProperties | undefined = box?.width ? { position: "fixed", left: box.left, top: box.top, width: box.width, height: box.height, margin: 0 } : undefined;
    setScreen((current) => ({ ...current, frame: reduce ? 1 : 2, mode: reduce ? "scenes" : "splash", scene: 0, splashBox }));
  };
  const skip = () => {
    if (screen.mode === "handoff") setScreen((current) => ({ ...current, target: null }));
    else finish(null, true);
  };
  const renderScene = (index: number, outgoing = false, clone = false) => {
    const scene = PRESENTATION_SCENES[index];
    return <section className={`presentation-scene${outgoing ? " outgoing" : ""}`} key={`${clone ? "handoff" : "dialog"}:scene:${index}`} data-scene={index} data-palette={PRESENTATION_PALETTE[index]} style={{ ...presentationColors(index), ...(outgoing ? screen.exitBox : {}) }} inert={outgoing || clone || undefined}
      aria-hidden={outgoing || clone || undefined} aria-labelledby={outgoing || clone ? undefined : "presentation-title"}>
        <div className="scene-content">
        <h1 ref={outgoing || clone ? undefined : heading} id={outgoing || clone ? undefined : "presentation-title"} tabIndex={-1}>{index === 1 ? <>{["ousados.", "inquietos.", "criativos."].map((word, position) => <span className="signature-word" key={word}>{position > 0 && " "}<span>{word}</span></span>)}</> : index === 2 ? <><span>o próximo</span>{" "}<mark>movimento</mark>{" "}<span>começa aqui.</span></> : index === 3 ? <><span>conheça o</span>{" "}<span className="agent-title-accent">go.agent.</span></> : index === 4 ? <><span>como deseja</span>{" "}<span>começar?</span></> : scene.title}</h1>
        {index === 0 && <p className="presentation-welcome">bem-vindo ao<br />go.flow.</p>}
        <p className="presentation-description">{scene.description}</p>
        {index === 2 && <ol className="signature-chain" aria-label="Fluxo da decisão"><li>dados</li><li>inteligência</li><li>ação</li></ol>}
        {index === 3 && <><div className="presentation-orb"><FlowOrb /></div><p className="presentation-agent"><Sparkles size={20} aria-hidden="true" />Ferramenta real. Cálculo determinístico. Revisão humana.</p></>}
        {index === 4 && <div className="handoff-wordmark" aria-hidden="true">go<span className="splash-dot">.</span>flow</div>}
        {index === 4 && <div className="presentation-choices">
          <button onClick={() => finish("/")} disabled={screen.mode === "handoff"} className="presentation-choice"><Play size={22} aria-hidden="true" /><strong>{snapshot.operation ? "Continuar operação ativa" : "Explorar ambiente demonstrativo"}</strong><span>{snapshot.operation ? "Sua fonte local e seus dados permanecem intactos." : "Dados sintéticos independentes, dashboards e go.agent com IA. Sem login."}</span><ArrowRight size={20} aria-hidden="true" /></button>
          <button onClick={() => finish("/importar")} disabled={screen.mode === "handoff"} className="presentation-choice"><FileUp size={22} aria-hidden="true" /><strong>Analisar operação local</strong><span>Importe seus arquivos. Análises no navegador, sem enviar dados ou pedidos à IA externa.</span><ArrowRight size={20} aria-hidden="true" /></button>
        </div>}
        {index === 4 && <p className="presentation-route-status" role="status">{screen.mode === "handoff" && !ready ? "Abrindo a aplicação…" : "\u00a0"}</p>}
        </div>
        <div className="presentation-header scene-chrome scene-chrome-header" aria-hidden="true" inert>
          <span className="scene-caption">{sceneCaptions[index]}</span>
          <div className="presentation-header-right">
            <ol className="scene-dots">{PRESENTATION_SCENES.map((item, step) => <li key={item.title} aria-current={step === index ? "step" : undefined} />)}</ol>
            <span className="scene-chrome-skip-space" />
          </div>
        </div>
        <p className="presentation-slogan scene-chrome scene-chrome-slogan" aria-hidden="true" inert><span>From insight to action.</span></p>
        <div className="presentation-scene-notice" aria-hidden={!sceneNoticeVisible || outgoing || clone || undefined}>
          <span>{prototypeNotice}</span>
          <div className="scene-chrome scene-chrome-navigation" aria-hidden="true" inert>
            {index > 0 && <span className="scene-chrome-arrow scene-chrome-back" data-disabled={screen.mode !== "scenes" || undefined}><ArrowLeft size={18} aria-hidden="true" /></span>}
            {index < 4 && <span className="scene-chrome-arrow scene-chrome-next" data-disabled={screen.mode !== "scenes" || undefined}><ArrowRight size={22} aria-hidden="true" /></span>}
          </div>
        </div>
      </section>;
  };
  // Enquanto a nova cena atravessa a mascara, o chrome global mantem a paleta anterior.
  // As copias visuais dentro de cada cena ja recebem sua propria paleta.
  const chromePaletteIndex = screen.previous ?? screen.scene;
  const renderWordmark = (compact = false) => <div className="splash-wordmark" data-frame={compact ? 1 : screen.frame} aria-hidden="true"><span>go<span className="splash-dot">.</span></span><span className="splash-flow">flow</span></div>;
  const renderContents = (clone = false) => screen.mode === "closed" ? null : shortOpening ? <div className="presentation-splash presentation-returning" aria-label="go.flow">{renderWordmark(true)}</div> : <>
      <header className="presentation-header" data-chrome-anchor="header">{(screen.mode === "splash" && !revealing) || screen.splashExit ? <span className="splash-signature">gogroup</span> : <span className="scene-caption">{sceneCaptions[screen.scene]}</span>}<div className="presentation-header-right">{(screen.mode !== "splash" || revealing) && <ol className="scene-dots" aria-label="Progresso da apresentação">{PRESENTATION_SCENES.map((item, index) => <li key={item.title} aria-current={index === screen.scene ? "step" : undefined}><span className="sr-only">{index + 1}: {item.title}</span></li>)}</ol>}<button ref={skipButton} className="presentation-skip" onClick={skip}><span className="presentation-skip-label">{screen.mode === "handoff" ? "Voltar à aplicação" : "Pular apresentação"}</span></button></div></header>
      <p className="presentation-slogan" data-chrome-anchor="slogan" key={`${clone ? "handoff" : "dialog"}:slogan`}><span>From insight to action.</span></p>
      <div className="presentation-curves" aria-hidden="true"><svg viewBox="0 0 400 400" fill="none"><path d="M-30 340H90C240 340 120 80 300 80H430" /><path d="M-30 390H120C280 390 160 130 330 130H430" /><circle cx="300" cy="80" r="12" /></svg></div>
      <svg className="signature-connector" viewBox="0 0 400 400" fill="none" aria-hidden="true"><path d="M-30 340H90C240 340 120 80 300 80H430" /><circle cx="300" cy="80" r="7" /></svg>
      {screen.previous !== null && <div className="cinematic-surface" data-from={screen.previous} data-transition={screen.transition} key={`${clone ? "handoff" : "dialog"}:surface:${screen.transition}`} aria-hidden="true" />}
      {screen.mode === "splash" && screen.frame === 2 && <div className="presentation-iris" aria-hidden="true"><div className="iris-depth" /><svg className="iris-curves" viewBox="0 0 1000 1000" fill="none"><path d="M-80 700H240C650 700 340 200 900 200H1100" /><path d="M-80 760H260C720 760 370 260 940 260H1100" /></svg></div>}
      {screen.mode === "splash" || screen.returning || screen.splashExit ? <div className="presentation-splash" style={revealing ? screen.splashBox : undefined} inert={revealing || undefined} aria-label="go.flow — From insight to action.">
        {renderWordmark()}
        <p className="splash-description">inteligência operacional<br />que conecta dados,<br />decisões e ação.</p>
        <button className="presentation-next" onClick={enter}>Conheça o go.flow <ArrowRight size={18} aria-hidden="true" /></button>
      </div> : null}
      {(revealing || !(screen.mode === "splash" || screen.returning || screen.splashExit)) && <div className="cinematic-stage" data-transition={screen.transition} data-opening-sequence={screen.transition === "initial" || undefined}>
        {renderScene(screen.scene, false, clone)}
        {screen.previous !== null && renderScene(screen.previous, true, clone)}
      </div>}
      <svg className="cinematic-guide" data-transition={screen.transition} key={`${clone ? "handoff" : "dialog"}:guide:${screen.transition}`} viewBox="0 0 1000 600" fill="none" aria-hidden="true"><path d="M-40 520H120C460 520 260 100 650 100H1040" /></svg>
      <footer ref={noticeFooter} className="presentation-footer"><span ref={noticeAnchor} data-notice-anchor aria-hidden={sceneNoticeVisible || undefined}>{prototypeNotice}</span>{(screen.mode !== "splash" || revealing) && <nav data-chrome-anchor="navigation" aria-label="Controles da apresentação">
        {screen.scene > 0 && <button aria-label="Voltar" onClick={() => move(-1)} disabled={screen.mode !== "scenes"}><ArrowLeft size={18} aria-hidden="true" /><span className="sr-only">Voltar</span></button>}
        <span role="status" aria-live="polite">{screen.scene + 1} de 5</span>
        {screen.scene < 4 && <button className="scene-next" aria-label={screen.scene === 0 ? "Começar" : "Avançar"} onClick={() => move(1)} disabled={screen.mode !== "scenes"}><span className="sr-only">{screen.scene === 0 ? "Começar" : "Avançar"}</span><ArrowRight size={22} aria-hidden="true" /></button>}
      </nav>}</footer>
  </>;
  return <ReplayContext.Provider value={replay}>
    <div className="presentation-underlay" data-handoff={ready && !reduce ? "true" : undefined}>{children}</div>
    <div className="presentation-primer" aria-hidden="true"><Brand /></div>
    <dialog ref={dialog} id="goflow-presentation" className="presentation-dialog signature-presentation" data-mode={screen.mode} data-scene={screen.scene} style={{ ...presentationColors(chromePaletteIndex), "--logo-go-duration": `${LOGO_GO_MS}ms`, "--logo-flow-duration": `${LOGO_FLOW_MS}ms`, "--logo-flow-delay": `${LOGO_FLOW_DELAY_MS}ms`, "--welcome-duration": `${WELCOME_ENTER_MS}ms`, "--welcome-overlap": `${WELCOME_OVERLAP_MS}ms`, "--opening-duration": `${IRIS_EXPANSION_MS}ms`, "--welcome-delay": `${IRIS_EXPANSION_MS - WELCOME_OVERLAP_MS}ms` } as CSSProperties} data-palette={revealing || screen.mode === "scenes" || (screen.mode === "handoff" && !screen.splashExit && !shortOpening) ? PRESENTATION_PALETTE[chromePaletteIndex] : undefined} data-scene-transition={screen.transition} data-frame={screen.frame} data-returning={shortOpening || undefined} data-opening={shortOpening || screen.splashExit || undefined} data-awaiting={screen.mode === "handoff" && screen.covered && !ready || undefined}
      aria-label="Apresentação do go.flow" aria-modal="true" onCancel={(event) => { event.preventDefault(); skip(); }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      }}>{renderContents()}{screen.mode === "handoff" && <div className="workspace-iris" data-fast={screen.fast || undefined} aria-hidden="true" />}{screen.mode === "handoff" && screen.covered && !ready && <div className="handoff-wait"><p role="status">Abrindo o ambiente…</p><button onClick={skip}>Voltar à aplicação</button></div>}</dialog>
    {ready && !reduce && <div ref={handoff} className="presentation-handoff" aria-hidden="true" inert />}
  </ReplayContext.Provider>;
}

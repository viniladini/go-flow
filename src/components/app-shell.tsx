"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Boxes, CalendarDays, CircleHelp, FileUp, LayoutDashboard, ListChecks, Menu, ShoppingBag, Sparkles, TrendingUp, X } from "lucide-react";
import { StockSearchContext } from "./stock-search-context";
import { Search } from "lucide-react";
import { PresentationReplay } from "./presentation";
import { Brand } from "./brand";
import { AppearanceControl } from "./appearance-control";
import { useImportSession, useOperationalSource } from "./import-session-provider";
import { formatDate } from "@/lib/dashboard/format";
import { MOTION, MOTION_EASING, routeFrames, routeMotion } from "@/lib/motion";
const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/estoque", label: "Saúde do estoque", icon: Boxes },
  { href: "/compras", label: "Compras inteligentes", icon: ShoppingBag },
  { href: "/oportunidades", label: "Oportunidades", icon: TrendingUp },
  { href: "/agente", label: "go.agent", icon: Sparkles },
  { href: "/acoes", label: "Central de ações", icon: ListChecks },
  { href: "/importar", label: "Flow Import", icon: FileUp },
];
type RouteTransition = { skipTransition: () => void; finished: Promise<void> };
function focusPage(content: HTMLElement | null) {
  const destination = content?.querySelector<HTMLElement>("h1") ?? content;
  if (destination) { destination.tabIndex = -1; destination.focus({ preventScroll: true }); }
}
function SourceIndicator() {
  const { snapshot } = useImportSession();
  return <Link href="/importar" className="demo-mode-pill" aria-label={snapshot.operation ? "Fonte importada local ativa. Conferir Flow Import" : "Origem demonstrativa ativa. Abrir Flow Import"}>
    {snapshot.operation ? "Importação local · fonte ativa" : "Demo sintética"}
  </Link>;
}
function SidebarContent({ mobile, pathname, pendingPath, onNavigate }: { mobile?: boolean; pathname: string; pendingPath?: string | null; onNavigate: () => void }) {
  const activeIndex = navigation.findIndex((item) => item.href === (pendingPath ?? pathname));
  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = nav.current;
    if (!node) return;
    const measure = () => {
      const selected = node.querySelector<HTMLElement>('[data-selected="true"]');
      if (!selected?.offsetHeight) return;
      node.style.setProperty("--nav-y", `${selected.offsetTop}px`);
      node.style.setProperty("--nav-height", `${selected.offsetHeight}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [activeIndex]);
  return <><div className="sidebar-brand"><Link href="/" aria-label="go.flow — Visão geral" onClick={onNavigate}><Brand /></Link>{mobile && <button className="drawer-close" onClick={onNavigate} aria-label="Fechar menu"><X size={22} /></button>}<p>From insight to action.</p></div><div className="sidebar-nav-region"><p className="nav-caption">Workspace</p><nav ref={nav} className="shell-navigation" style={{ "--nav-index": Math.max(0, activeIndex) } as CSSProperties} aria-label={mobile ? "Navegação mobile" : "Navegação principal"}><span className="nav-active-indicator" data-visible={activeIndex >= 0} aria-hidden="true" />{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${pathname === href ? "active" : ""}`} data-selected={(pendingPath ?? pathname) === href || undefined} data-pending={pendingPath === href || undefined} aria-current={pathname === href ? "page" : undefined} onClick={onNavigate}><Icon size={19} aria-hidden="true" /><span>{label}</span>{href === "/agente" && <span className="ai-tag">IA</span>}</Link>)}</nav></div><div className="sidebar-bottom"><PresentationReplay onReplay={onNavigate} /><div className="prototype-note"><CircleHelp size={18} aria-hidden="true" /><div><strong>Ideias em movimento.</strong><p>Protótipo AI-First<br />Uma nova forma de operar.</p></div></div><div className="workspace-signature"><div><strong>gogroup</strong><span>Protótipo independente</span></div></div></div><svg className="sidebar-curve" viewBox="0 0 120 80" fill="none" aria-hidden="true"><path d="M15 95C15 30 70 40 135 5" /></svg></>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(), router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const navigating = pendingPath !== null && pendingPath !== pathname;
  useEffect(() => {
    if (!pendingPath) return;
    const timer = window.setTimeout(() => setPendingPath(null), pendingPath === pathname ? 0 : 8000);
    return () => window.clearTimeout(timer);
  }, [pendingPath, pathname]);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus({ preventScroll: true }); } };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  const { snapshot } = useImportSession(), operational = useOperationalSource();
  const parameters = snapshot.operation?.parameters ?? operational?.state.result?.parameters;
  const operationLabel = parameters?.operation ?? "Operação indisponível";
  const referenceDate = parameters?.referenceDate ?? "";
  const drawer = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null), previousPath = useRef(pathname);
  const routeTransition = useRef<RouteTransition | null>(null);
  const routeCommit = useRef<{ path: string; resolve: () => void } | null>(null);
  const transitionTicket = useRef(0);
  const contentAnimations = useRef<Animation[]>([]), drawerAnimation = useRef<Animation | null>(null);
  const drawerClosing = useRef(false);
  const drawerOpener = useRef<HTMLElement | null>(null), focusDestination = useRef<string | null>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (!media?.matches) return;
      contentAnimations.current.forEach((animation) => animation.cancel());
      routeTransition.current?.skipTransition(); drawerAnimation.current?.cancel();
      if (drawerClosing.current) {
        drawer.current?.close(); drawerClosing.current = false;
        drawerOpener.current?.focus({ preventScroll: true });
        if (focusDestination.current === previousPath.current) { focusPage(content.current); focusDestination.current = null; }
      }
    };
    media?.addEventListener("change", stop);
    return () => media?.removeEventListener("change", stop);
  }, []);
  useEffect(() => () => {
    transitionTicket.current++; routeTransition.current?.skipTransition(); routeCommit.current?.resolve();
    contentAnimations.current.forEach((animation) => animation.cancel()); drawerAnimation.current?.cancel();
    delete document.documentElement.dataset.routeMotion;
  }, []);
  useLayoutEffect(() => {
    const changed = previousPath.current !== pathname;
    const kind = routeMotion(previousPath.current, pathname);
    previousPath.current = pathname;
    if (routeCommit.current?.path === pathname) { routeCommit.current.resolve(); routeCommit.current = null; }
    if (changed && focusDestination.current === pathname && !drawer.current?.open) {
      focusPage(content.current);
      focusDestination.current = null;
    }
    if (routeTransition.current) return;
    if (!changed || !content.current?.animate) return;
    let media: MediaQueryList;
    try { media = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return; }
    if (media.matches) return;
    contentAnimations.current.forEach((animation) => animation.cancel());
    const panels = kind === "analysis" ? [...content.current.querySelectorAll<HTMLElement>(".page-heading, .metrics-grid, .panel")].slice(0, 5) : [];
    const targets = panels.length ? panels : [content.current];
    const animations = targets.map((node, index) => node.animate(routeFrames(kind), {
      duration: MOTION.spatial, delay: index * 35, easing: MOTION_EASING.spatial,
    }));
    contentAnimations.current = animations;
    const stop = () => { if (media.matches) animations.forEach((animation) => animation.cancel()); };
    media.addEventListener("change", stop);
    return () => { animations.forEach((animation) => animation.cancel()); media.removeEventListener("change", stop); };
  }, [pathname]);
  const closeDrawer = () => {
    const panel = drawer.current;
    if (!panel?.open) return;
    const current = getComputedStyle(panel);
    const from = { opacity: current.opacity, transform: current.transform };
    drawerAnimation.current?.cancel();
    drawerClosing.current = true;
    const close = () => {
      panel.close(); drawerClosing.current = false; drawerOpener.current?.focus({ preventScroll: true });
      if (focusDestination.current === previousPath.current) { focusPage(content.current); focusDestination.current = null; }
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !panel.animate) { close(); return; }
    const animation = panel.animate([from, { opacity: 0, transform: "translateX(-18px)" }], { duration: MOTION.panelExit, easing: MOTION_EASING.panel });
    drawerAnimation.current = animation;
    if (!animation.finished) close();
    else void animation.finished.then(() => { if (drawerAnimation.current === animation) { close(); drawerAnimation.current = null; } }, () => {});
  };
  const openDrawer = (opener: HTMLElement) => {
    const panel = drawer.current;
    if (!panel) return;
    drawerClosing.current = false; drawerOpener.current = opener; drawerAnimation.current?.cancel();
    panel.showModal();
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && panel.animate) {
      drawerAnimation.current = panel.animate([{ opacity: 0, transform: "translateX(-24px)" }, { opacity: 1, transform: "none" }], { duration: MOTION.standard, easing: MOTION_EASING.panel });
    }
  };
  const beginNavigation = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === pathname) {
      if (pendingPath && !destination.hash) {
        event.preventDefault(); transitionTicket.current++; routeTransition.current?.skipTransition(); routeCommit.current?.resolve();
        routeTransition.current = null; routeCommit.current = null; focusDestination.current = null;
        delete document.documentElement.dataset.routeMotion; setPendingPath(null);
        router.push(destination.pathname + destination.search);
      }
      return;
    }
    setPendingPath(destination.pathname);
    focusDestination.current = destination.pathname;
    contentAnimations.current.forEach((animation) => animation.cancel());
    const start = (document as Document & { startViewTransition?: (update: () => Promise<void>) => RouteTransition }).startViewTransition;
    if (start && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      event.preventDefault();
      routeTransition.current?.skipTransition(); routeCommit.current?.resolve();
      const ticket = ++transitionTicket.current;
      document.documentElement.dataset.routeMotion = routeMotion(pathname, destination.pathname);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const transition = start.call(document, () => ticket !== transitionTicket.current ? Promise.resolve() : new Promise<void>((resolve) => {
          routeCommit.current = { path: destination.pathname, resolve };
          deadline = setTimeout(resolve, 4000);
          router.push(destination.pathname + destination.search + destination.hash);
        }));
        routeTransition.current = transition;
        const finish = () => { clearTimeout(deadline); if (routeTransition.current === transition) { routeTransition.current = null; delete document.documentElement.dataset.routeMotion; } };
        void transition.finished.then(finish, finish);
      } catch { routeTransition.current = null; delete document.documentElement.dataset.routeMotion; router.push(destination.pathname + destination.search + destination.hash); }
      return;
    }
    // Without native snapshots, Next navigates immediately; only the committed
    // destination gets WAAPI. There is no competing exit on the same element.
  };
  return <StockSearchContext.Provider value={{ query, setQuery }}><div className="workspace-shell" data-navigating={navigating || undefined} onClickCapture={beginNavigation}><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><aside className="sidebar"><SidebarContent pathname={pathname} pendingPath={navigating ? pendingPath : null} onNavigate={closeDrawer} /></aside><dialog ref={drawer} className="mobile-drawer" onCancel={(event) => { event.preventDefault(); closeDrawer(); }} aria-label="Menu de navegação"><SidebarContent mobile pathname={pathname} pendingPath={navigating ? pendingPath : null} onNavigate={closeDrawer} /></dialog><div className="app-main"><header className="topbar">{navigating && <span className="route-progress" role="status"><span className="sr-only">Abrindo página...</span></span>}<form className="shell-search" role="search" onSubmit={(event) => { event.preventDefault(); router.push("/estoque#filtros-estoque"); }}><Search size={17} aria-hidden="true" /><input ref={searchInput} type="search" aria-label="Buscar SKU, produto ou marca" placeholder="Buscar SKU, produto ou marca..." value={query} onChange={(event) => setQuery(event.target.value)} aria-keyshortcuts="Control+K Meta+K" /><kbd aria-hidden="true">Ctrl K</kbd><button type="submit" className="sr-only">Buscar no estoque</button></form><div className="operation"><button className="menu-button" aria-label="Abrir menu de navegação" aria-haspopup="dialog" onClick={(event) => openDrawer(event.currentTarget)}><Menu size={22} /></button><span className="operation-dot" aria-hidden="true" /><span>Operação: <strong>{operationLabel}</strong></span><SourceIndicator /></div><div className="topbar-controls"><span className="reference-date"><CalendarDays size={16} aria-hidden="true" /><span>{snapshot.operation ? "Data-base local:" : "Cenário sintético:"} <time dateTime={referenceDate}>{formatDate(referenceDate || null)}</time></span></span><Link className="header-filter-link" href="/estoque#filtros-estoque">Filtrar marcas <ArrowUpRight size={15} aria-hidden="true" /></Link><AppearanceControl /></div></header><main ref={content} id="conteudo" className="page-content" aria-busy={navigating || undefined} tabIndex={-1}>{children}</main><footer className="app-footer"><span>Projeto independente desenvolvido para o Desafio AI-First GoGroup.</span><span className="footer-signature">go.flow <span>·</span> From insight to action.</span></footer></div></div></StockSearchContext.Provider>;
}

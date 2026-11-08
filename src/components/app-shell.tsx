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
const navigation = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/estoque", label: "Saúde do estoque", icon: Boxes },
  { href: "/compras", label: "Compras inteligentes", icon: ShoppingBag },
  { href: "/oportunidades", label: "Oportunidades", icon: TrendingUp },
  { href: "/agente", label: "go.agent", icon: Sparkles },
  { href: "/acoes", label: "Central de ações", icon: ListChecks },
  { href: "/importar", label: "Flow Import", icon: FileUp },
];
function SourceIndicator() {
  const { snapshot } = useImportSession();
  return <Link href="/importar" className="demo-mode-pill" aria-label={snapshot.operation ? "Fonte importada local ativa. Conferir Flow Import" : "Origem demonstrativa ativa. Abrir Flow Import"}>
    {snapshot.operation ? "Importação local · fonte ativa" : "Demo sintética"}
  </Link>;
}
function SidebarContent({ mobile, pathname, onNavigate }: { mobile?: boolean; pathname: string; onNavigate: () => void }) {
  const activeIndex = navigation.findIndex((item) => item.href === pathname);
  return <><div className="sidebar-brand"><Link href="/" aria-label="go.flow — Visão geral" onClick={onNavigate}><Brand /></Link>{mobile && <button className="drawer-close" onClick={onNavigate} aria-label="Fechar menu"><X size={22} /></button>}<p>From insight to action.</p></div><div className="sidebar-nav-region"><p className="nav-caption">Workspace</p><nav className="shell-navigation" style={{ "--nav-index": Math.max(0, activeIndex) } as CSSProperties} aria-label={mobile ? "Navegação mobile" : "Navegação principal"}>{activeIndex >= 0 && <span className="nav-active-indicator" aria-hidden="true" />}{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${pathname === href ? "active" : ""}`} aria-current={pathname === href ? "page" : undefined} onClick={onNavigate}><Icon size={19} aria-hidden="true" /><span>{label}</span>{href === "/agente" && <span className="ai-tag">IA</span>}</Link>)}</nav></div><div className="sidebar-bottom"><PresentationReplay onReplay={onNavigate} /><div className="prototype-note"><CircleHelp size={18} aria-hidden="true" /><div><strong>Ideias em movimento.</strong><p>Protótipo AI-First<br />Uma nova forma de operar.</p></div></div><div className="workspace-signature"><div><strong>gogroup</strong><span>Protótipo independente</span></div></div></div><svg className="sidebar-curve" viewBox="0 0 120 80" fill="none" aria-hidden="true"><path d="M15 95C15 30 70 40 135 5" /></svg></>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(), router = useRouter();
  const [query, setQuery] = useState("");
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
  useLayoutEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (!changed || !content.current?.animate) return;
    let media: MediaQueryList;
    try { media = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { return; }
    if (media.matches) return;
    const animation = content.current.animate([
      { opacity: .94, transform: "translateY(4px)" }, { opacity: 1, transform: "none" },
    ], { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" });
    const stop = () => { if (media.matches) animation.cancel(); };
    media.addEventListener("change", stop);
    return () => { animation.cancel(); media.removeEventListener("change", stop); };
  }, [pathname]);
  const closeDrawer = () => drawer.current?.close();
  return <StockSearchContext.Provider value={{ query, setQuery }}><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><aside className="sidebar"><SidebarContent pathname={pathname} onNavigate={closeDrawer} /></aside><dialog ref={drawer} className="mobile-drawer" aria-label="Menu de navegação"><SidebarContent mobile pathname={pathname} onNavigate={closeDrawer} /></dialog><div className="app-main"><header className="topbar"><form className="shell-search" role="search" onSubmit={(event) => { event.preventDefault(); router.push("/estoque#filtros-estoque"); }}><Search size={17} aria-hidden="true" /><input ref={searchInput} type="search" aria-label="Buscar SKU, produto ou marca" placeholder="Buscar SKU, produto ou marca..." value={query} onChange={(event) => setQuery(event.target.value)} aria-keyshortcuts="Control+K Meta+K" /><kbd aria-hidden="true">Ctrl K</kbd><button type="submit" className="sr-only">Buscar no estoque</button></form><div className="operation"><button className="menu-button" aria-label="Abrir menu de navegação" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><Menu size={22} /></button><span className="operation-dot" aria-hidden="true" /><span>Operação: <strong>{operationLabel}</strong></span><SourceIndicator /></div><div className="topbar-controls"><span className="reference-date"><CalendarDays size={16} aria-hidden="true" /><span>Data-base: <time dateTime={referenceDate}>{formatDate(referenceDate || null)}</time></span></span><Link className="header-filter-link" href="/estoque#filtros-estoque">Filtrar marcas <ArrowUpRight size={15} aria-hidden="true" /></Link><AppearanceControl /></div></header><main ref={content} id="conteudo" className="page-content" tabIndex={-1}>{children}</main><footer className="app-footer"><span>Projeto independente desenvolvido para o Desafio AI-First GoGroup.</span><span className="footer-signature">go.flow <span>·</span> From insight to action.</span></footer></div></StockSearchContext.Provider>;
}

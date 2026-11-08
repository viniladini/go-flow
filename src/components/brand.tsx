export function FlowSymbol({ className = "" }: { className?: string }) {
  return <svg className={className} width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M5 25h6c8 0 6-14 14-14h6M5 16h5c8 0 6 14 14 14h7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><circle cx="6" cy="25" r="3" fill="currentColor" /><circle cx="30" cy="11" r="3" fill="currentColor" /></svg>;
}
export function Brand() { return <span className="brand"><FlowSymbol /><span><span className="brand-prefix">go</span><span className="brand-period">.</span>flow</span></span>; }

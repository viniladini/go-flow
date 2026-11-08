import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
export function StatusBadge() { return <span className="status-badge">Em desenvolvimento</span>; }
export function Panel({ title, description, aside, children, className = "" }: { title: string; description: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div>{aside}</header>{children}</section>;
}
export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p><StatusBadge /></div>;
}

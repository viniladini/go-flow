import { Database, ScanLine, GitPullRequest, Check, ChartColumn, Sparkles } from "lucide-react";

/** Explains the product; these steps are neither navigation nor execution statuses. */
export function ProductFlow({ journey = false }: { journey?: boolean }) {
  const steps = journey ? [{ icon: ChartColumn, label: "analisa a operação" }, { icon: Sparkles, label: "identifica oportunidades" }, { icon: Check, label: "prepara ação" }] : [{ icon: Database, label: "dados conectados" }, { icon: ScanLine, label: "análise inteligente" }, { icon: GitPullRequest, label: "decisão com critério" }, { icon: Check, label: "ação na operação" }];
  return <section className="product-flow" data-journey={journey || undefined} aria-label="O fluxo do go.flow">
    <h2>o fluxo do <span>go.flow</span></h2>
    <div className="product-flow-steps"><svg className="product-flow-curve" viewBox="0 0 800 100" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M0 50C80 50 80 5 160 50S280 95 360 50S480 5 560 50S680 95 800 50" /></svg>
      <ol>{steps.map(({ icon: Icon, label }) => <li key={label}><span><Icon size={22} aria-hidden="true" /></span><strong>{label}</strong></li>)}</ol>
    </div>
  </section>;
}

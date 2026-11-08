import { AnimatedDetails } from "./animated-details";
import { groupBuyingAlerts } from "@/lib/buying-alerts";
import type { BuyingAlert } from "@/lib/smart-buying/types";
export function BuyingAlertGroups({ alerts, total = alerts.length }: { alerts: readonly BuyingAlert[]; total?: number }) {
  return <section className="buying-alert-groups" aria-label="Ressalvas agrupadas"><header><h3>Ressalvas e riscos <span>{total}</span></h3><p>Agrupadas por tema. Todas as ocorrências disponíveis permanecem acessíveis.</p></header>
    {groupBuyingAlerts(alerts).map((group) => <AnimatedDetails key={group.id} className="alert-category" data-critical={group.critical || undefined}>
      <summary><span className="alert-category-dot" aria-hidden="true" /><strong>{group.label}</strong><span>{group.count} {group.count === 1 ? "ocorrência" : "ocorrências"}</span></summary>
      <div className="alert-category-body">{group.messages.map((row, i) => <div className="alert-message" key={i}><p>{row.message}</p>
        <details><summary>Conferir {row.occurrences.length} {row.occurrences.length === 1 ? "ocorrência" : "ocorrências"} por SKU</summary><ul>{row.occurrences.map((alert, j) => <li key={j}><strong>{alert.sku ?? "Cenário completo"}</strong><span>{alert.sku ? "Conferir antes de revisar a compra" : "Premissa aplicada ao plano"}</span></li>)}</ul></details>
      </div>)}</div>
    </AnimatedDetails>)}
    {total > alerts.length && <p className="import-error">Este comprovante anterior contém apenas {alerts.length} de {total} alertas. Execute uma nova análise para obter as ressalvas completas.</p>}
    {!alerts.length && <p>Nenhuma ressalva registrada nesta execução.</p>}
  </section>;
}

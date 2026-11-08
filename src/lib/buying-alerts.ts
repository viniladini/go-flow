import type { BuyingAlert } from "./smart-buying/types";
const categories = [
  { id: "arrival", label: "Ruptura anterior à chegada", critical: true, pattern: /arrival|shortfall|ruptur|chegada|stockout/i },
  { id: "pending", label: "Pedidos pendentes", critical: true, pattern: /pending|existing_orders|pendente|pendência|compromisso/i },
  { id: "data", label: "Qualidade e suficiência dos dados", critical: true, pattern: /insufficient|quality|duplicate|dados|amostra|duplicata/i },
  { id: "scenario", label: "Premissas da simulação", critical: false, pattern: /scenario|seasonality|condicional|hipótese|campanha/i },
  { id: "limits", label: "Limitações de cálculo", critical: false, pattern: /./ },
];
export function groupBuyingAlerts(alerts: readonly BuyingAlert[]) {
  return categories.flatMap((category) => {
    const selected = alerts.filter((alert) => categories.find((c) => c.pattern.test(alert.code + " " + alert.message))?.id === category.id);
    if (!selected.length) return [];
    const messages = new Map<string, { message: string; occurrences: BuyingAlert[] }>();
    for (const alert of selected) {
      const key = alert.code + "\n" + alert.message;
      const row = messages.get(key) ?? { message: alert.message, occurrences: [] };
      row.occurrences.push(alert); messages.set(key, row);
    }
    return [{ id: category.id, label: category.label, critical: category.critical, count: selected.length, messages: [...messages.values()] }];
  });
}

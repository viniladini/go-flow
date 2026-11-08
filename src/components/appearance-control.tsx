"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { getAppearance, getServerAppearance, setAppearance, subscribeAppearance } from "@/lib/theme/store";

export function AppearanceControl() {
  const id = useId();
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const preference = useSyncExternalStore(subscribeAppearance, getAppearance, getServerAppearance);
  const options = [{ value: "light", label: "Claro", icon: Sun }, { value: "dark", label: "Escuro", icon: Moon }] as const;
  return <fieldset className="appearance-control">
    <legend className="sr-only">Aparência</legend>
    <div className="appearance-segments" role="group" aria-label="Aparência" aria-describedby={id + "-help"} data-preference={preference} data-tooltip-dismissed={tooltipDismissed || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setTooltipDismissed(true); return; }
        const index = options.findIndex((option) => option.value === (event.target as HTMLElement).dataset.themeChoice);
        const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) ? (index + 1) % 2 : null;
        if (next === null) return;
        event.preventDefault();
        event.currentTarget.querySelector<HTMLButtonElement>(`button[data-theme-choice="${options[next].value}"]`)?.focus();
      }}>
      <span className="appearance-indicator" aria-hidden="true" />
      {options.map(({ value, label, icon: Icon }) => {
        const help = `${label}${preference === value ? " fixo" : ""}. ${preference === value ? "Clique novamente para seguir o sistema." : "Clique para fixar este tema; clique novamente para seguir o sistema."}`;
        return <button key={value} type="button" className="appearance-option" data-theme-choice={value} aria-pressed={preference === value} aria-label={help} onFocus={() => setTooltipDismissed(false)} onPointerEnter={() => setTooltipDismissed(false)} onClick={() => { setTooltipDismissed(true); setAppearance(preference === value ? "system" : value); }}>
          <Icon size={18} aria-hidden="true" data-appearance-icon={value} />
          <span className="appearance-tooltip" role="tooltip">{help}</span>
        </button>;
      })}
    </div>
    <span className="sr-only" id={id + "-help"}>Sol fixa Claro; Lua fixa Escuro. Ative novamente o botão selecionado para retornar a Sistema, que acompanha o dispositivo. Sua escolha é salva neste navegador.</span>
    <span className="sr-only" role="status">{preference === "system" ? "Sistema: aparência automática do dispositivo." : preference === "light" ? "Claro fixo." : "Escuro fixo."}</span>
  </fieldset>;
}

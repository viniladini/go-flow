"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileUp, LockKeyhole, RefreshCw, Trash2 } from "lucide-react";
import { useImportSession, useImportWizard } from "./import-session-provider";
import { FILE_LABELS, FILE_TYPES } from "@/lib/flow-import/recognition";
import { templateCsv } from "@/lib/flow-import/templates";
import { identificationProblem } from "@/lib/flow-import/wizard";
import type { FileName } from "@/lib/analytics/types";
import type { ImportReport, ParameterForm } from "@/lib/flow-import/types";

const parameterFields: { key: keyof ParameterForm; label: string; type?: string; hint?: string }[] = [
  { key: "operation", label: "Nome da operação" }, { key: "referenceDate", label: "Data de referência", type: "date" },
  { key: "horizonStart", label: "Início do horizonte", type: "date" }, { key: "horizonEnd", label: "Fim do horizonte", type: "date" },
  { key: "budget", label: "Orçamento de novas compras (R$)", hint: "Sem separador de milhar" },
  { key: "servicePercent", label: "Meta de serviço (%)" }, { key: "annualCapitalPercent", label: "Custo de capital anual (%)" },
  { key: "monthlyStoragePercent", label: "Armazenagem mensal (%)" }, { key: "maxDiscountPercent", label: "Desconto máximo (%)" },
];
const phases = ["Selecionar", "Identificar", "Validar", "Processar"];
const phaseLabels = { read: "Arquivos lidos", validate: "Estruturas verificadas", normalize: "Normalização", ready: "Concluído" };
function downloadTemplate(type: FileName) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", templateCsv(type)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "modelo-" + type; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Confirmation = { kind: "clear" | "replace"; files?: File[] };
export function FlowImport() {
  const { snapshot } = useImportSession(), { wizard, state } = useImportWizard();
  const { files, form, assignments, step, busy, progress, report, acknowledged, error } = state;
  const imported = snapshot.operation, visibleStep = imported ? 3 : step;
  const completed = !!imported;
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Page mounts only subscribe: navigating never disposes the provider-owned Worker.
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [visibleStep, completed]);
  const select = (selection: File[]) => {
    if (!selection.length) return;
    if (files.length || imported || busy) setConfirmation({ kind: "replace", files: selection });
    else wizard.select(selection);
  };
  const confirmChange = () => {
    if (confirmation?.files) wizard.select(confirmation.files);
    else wizard.clear();
    setConfirmation(null);
  };
  const identificationError = identificationProblem(files, assignments);
  return <div className="flow-import import-wizard">
    <div className="page-heading"><p className="eyebrow">DADOS OPERACIONAIS · LOCAL</p><h1>Flow Import</h1><p>Da origem à confiança. Uma etapa de cada vez.</p></div>
    <aside className="notice import-privacy"><LockKeyhole size={21} aria-hidden="true" /><div><strong>Somente na memória desta aba</strong><p>A navegação interna preserva a sessão. Recarregar ou fechar a aba pode apagá-la. Sem upload, persistência ou IA externa; as quatro abas operacionais usam a fonte ativa.</p></div></aside>
    <ol className="import-steps" aria-label="Etapas da importação">{phases.map((phase, i) => <li key={phase} aria-current={visibleStep === i ? "step" : undefined} data-done={visibleStep > i || !!imported}><span>{i + 1}/4</span>{phase}</li>)}</ol>
    <section key={visibleStep} className="import-card wizard-stage" aria-labelledby="wizard-stage-title" data-step={visibleStep + 1}>
      <header className="import-section-heading"><h2 id="wizard-stage-title" ref={heading} tabIndex={-1}>{imported ? "Importação concluída" : `${String(visibleStep + 1).padStart(2, "0")} — ${phases[visibleStep]}`}</h2>
        {(files.length > 0 || imported || busy) && <button className="import-button secondary" onClick={() => setConfirmation({ kind: "clear" })}><Trash2 size={16} aria-hidden="true" />Limpar sessão</button>}
      </header>
      <div className="wizard-stage-body">
        {error && <p role="alert" className="import-error">{error}</p>}
        {busy && <div role="status" aria-live="polite" className="import-progress"><p>{busy === "process" ? "Concluindo a sessão em memória…" : progress ? `${phaseLabels[progress.phase]}: ${progress.completed} de ${progress.total}` : "Iniciando processamento local…"}</p>{progress && progress.phase !== "normalize" ? <progress value={progress.completed} max={progress.total} aria-label={phaseLabels[progress.phase]} /> : <progress aria-label="Processando localmente" />}</div>}
        {visibleStep === 0 && <>
          <div className="import-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); select(Array.from(e.dataTransfer.files)); }}>
            <FileUp size={30} aria-hidden="true" /><label htmlFor="import-files">Arraste os cinco CSVs ou selecione no seu dispositivo</label>
            <input id="import-files" type="file" accept=".csv,text/csv" multiple disabled={!!busy} onChange={(e) => { select(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            <p>UTF-8 · 35 MiB por arquivo · 100 MiB no total · 500 mil registros por arquivo.</p>
            <p>Substituir remove dados, parâmetros e associações anteriores após sua confirmação.</p>
          </div>
          {!!files.length && <ul className="wizard-selection">{files.map((file) => <li key={file.id}><strong>{file.name}</strong> — {file.problem ?? `${file.records.toLocaleString("pt-BR")} registros lidos`}</li>)}</ul>}
          <div className="import-templates"><h3>Cinco tipos esperados · modelos fictícios</h3><ul>{FILE_TYPES.map((type) => <li key={type}><button onClick={() => downloadTemplate(type)} className="import-template"><Download size={15} aria-hidden="true" />{FILE_LABELS[type]}<span className="sr-only"> — baixar modelo CSV fictício</span></button></li>)}</ul></div>
        </>}
        {visibleStep === 1 && <>
          <p className="import-help">Confira as correspondências. O conteúdo define o tipo, independentemente do nome. A amostra não substitui a validação completa.</p>
          <ul className="import-expected" aria-label="Tipos esperados">{FILE_TYPES.map((type) => { const count = Object.values(assignments).filter((t) => t === type).length; return <li key={type} data-valid={count === 1}>{FILE_LABELS[type]}: {count === 1 ? "presente" : count ? "duplicado" : "ausente"}</li>; })}</ul>
          <div className="import-file-list">{files.map((file) => <div key={file.id}><div><strong>{file.name}</strong><p>{file.records.toLocaleString("pt-BR")} registros · {file.problem ?? (file.sampleTypesValid ? "Amostra compatível" : "Tipos da amostra exigem revisão")}</p>{file.candidates.length > 1 && <p>Classificação ambígua: escolha explicitamente o tipo.</p>}</div><label>Tipo do arquivo<select disabled={!!busy} value={assignments[file.id] ?? ""} onChange={(e) => wizard.setAssignment(file.id, e.target.value as FileName || null)}><option value="">Identificar manualmente</option>{FILE_TYPES.map((type) => <option key={type} value={type}>{FILE_LABELS[type]}</option>)}</select></label></div>)}</div>
          {identificationError && <p role="alert" className="import-error">{identificationError}</p>}
        </>}
        {visibleStep === 2 && <>
          <p className="import-help">Informe os parâmetros da operação. Nenhum valor do case ou da demonstração é aplicado automaticamente.</p>
          <form id="import-validation" onSubmit={(e) => { e.preventDefault(); wizard.validate(); }}>
            <fieldset disabled={!!busy} className="import-parameter-grid"><legend className="sr-only">Parâmetros operacionais obrigatórios</legend>{parameterFields.map(({ key, label, type, hint }) => <label key={key} htmlFor={`parameter-${key}`}>{label}<input id={`parameter-${key}`} type={type ?? "text"} inputMode={type || key === "operation" ? undefined : "decimal"} required maxLength={key === "operation" ? 120 : undefined} value={form[key]} onChange={(e) => wizard.setParameter(key, e.target.value)} />{hint && <small>{hint}</small>}</label>)}
              <label htmlFor="parameter-window">Janela observada (dias)<select id="parameter-window" required value={form.demandWindowDays} onChange={(e) => wizard.setParameter("demandWindowDays", e.target.value)}><option value="">Escolha</option>{[30, 60, 90].map((n) => <option key={n} value={n}>{n} dias, incluindo a referência</option>)}</select></label>
            </fieldset>
            <p className="import-help">CSV: datas AAAA-MM-DD e dinheiro com ponto decimal. Formulário: ponto ou vírgula decimal, sem milhar. Markdown não é interpretado.</p>
          </form>
          {report && <div className="import-report" aria-live="polite"><h3>{report.canProcess ? "Validação concluída — revise os alertas" : "Corrija os erros para continuar"}</h3><p>{report.errors.toLocaleString("pt-BR")} erros impeditivos · {report.warnings.toLocaleString("pt-BR")} alertas.</p>
            <ul className="import-issues">{report.issues.map((issue, i) => <li key={i} data-severity={issue.severity}><strong>{issue.severity === "error" ? "Erro" : "Alerta"}</strong> · {issue.message}<small>{issue.fileId ? files.find((f) => f.id === issue.fileId)?.name : "Conjunto / parâmetros"}{issue.field && ` · campo ${issue.field}`}{issue.records?.length ? ` · registro CSV ${issue.records.join(", ")}` : ""} · {issue.code}</small></li>)}</ul>
            {report.hiddenIssues > 0 && <p>Mais {report.hiddenIssues.toLocaleString("pt-BR")} ocorrências não exibidas; contagem e bloqueio consideram todas.</p>}
            {report.canProcess && report.warnings > 0 && <label className="import-ack"><input type="checkbox" checked={acknowledged} onChange={(e) => wizard.acknowledge(e.target.checked)} disabled={!!busy} />Revisei os alertas e reconheço as limitações e o tratamento exploratório de duplicatas.</label>}
          </div>}
        </>}
        {visibleStep === 3 && imported && <div className="import-success"><CheckCircle2 size={25} aria-hidden="true" /><div><h3>Sessão importada pronta</h3><p>{imported.parameters.operation} · referência {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(imported.parameters.referenceDate + "T00:00:00Z"))} · origem importada local.</p><p>{imported.dataset.skus.length.toLocaleString("pt-BR")} SKUs · {imported.metadata.warnings.toLocaleString("pt-BR")} alertas reconhecidos. Dados e parâmetros preservados ao navegar nesta aba.</p><p>Indicadores e propostas são calculados localmente na fonte ativa. Confira limitações e critérios em Compras inteligentes.</p><Summary files={imported.metadata.files} /></div></div>}
      </div>
      <footer className="wizard-actions">
        {imported ? <><button className="import-button secondary" onClick={() => setConfirmation({ kind: "replace" })}><RefreshCw size={16} aria-hidden="true" />Substituir importação</button><Link href="/" className="import-button">Acessar Visão geral <ArrowRight size={16} aria-hidden="true" /></Link></> : <>
          {step > 0 && <button className="import-button secondary" disabled={!!busy} onClick={() => wizard.back()}><ArrowLeft size={16} aria-hidden="true" />Voltar</button>}
          {step < 2 && <button className="import-button" disabled={!!busy || (step === 0 && files.length !== 5) || (step === 1 && !!identificationError)} onClick={() => wizard.next()}>{step === 0 ? "Continuar com os arquivos lidos" : "Confirmar correspondências e continuar"}<ArrowRight size={16} aria-hidden="true" /></button>}
          {step === 2 && (report?.canProcess ? <button className="import-button" disabled={!!busy || !acknowledged} onClick={() => wizard.process()}>Reconhecer e processar <CheckCircle2 size={16} aria-hidden="true" /></button> : <button className="import-button" type="submit" form="import-validation" disabled={!!busy}><RefreshCw size={16} aria-hidden="true" />Validar importação</button>)}
        </>}
      </footer>
    </section>
    {confirmation && <ConfirmSessionChange action={confirmation.kind} onConfirm={confirmChange} onCancel={() => setConfirmation(null)} />}
  </div>;
}
function ConfirmSessionChange({ action, onConfirm, onCancel }: { action: Confirmation["kind"]; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="import-confirmation" aria-labelledby="import-confirm-title" aria-describedby="import-confirm-description" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
    <h2 id="import-confirm-title">{action === "clear" ? "Limpar a sessão?" : "Substituir a importação?"}</h2><p id="import-confirm-description">Os dados, parâmetros e progresso atuais serão removidos da memória. Os arquivos originais não serão alterados. Será necessário selecioná-los novamente.</p>
    <div className="wizard-actions"><button autoFocus className="import-button secondary" onClick={onCancel}>Cancelar</button><button className="import-button" onClick={onConfirm}>{action === "clear" ? "Confirmar limpeza" : "Confirmar substituição"}</button></div>
  </dialog>;
}
function Summary({ files }: { files: ImportReport["files"] }) {
  return <div className="import-summary" role="region" aria-label="Resumo de conferência" tabIndex={0}><table><caption>Registros recebidos e aceitos após normalização</caption><thead><tr><th scope="col">Tipo / origem</th><th scope="col">Recebidos</th><th scope="col">Aceitos</th><th scope="col">Período informado</th></tr></thead><tbody>{files.map((f) => <tr key={f.id}><th scope="row">{FILE_LABELS[f.type]}<small>{f.name}</small></th><td>{f.inputRecords.toLocaleString("pt-BR")}</td><td>{f.acceptedRecords.toLocaleString("pt-BR")}</td><td>{f.start ?? "Sem data"}{f.end && ` a ${f.end}`}</td></tr>)}</tbody></table></div>;
}

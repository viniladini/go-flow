
# go.flow — Project Instructions v4

> **Scope:** canonical working instructions for the Codex agent in this repository. This file describes the currently implemented project and its non-negotiable boundaries. Read the minimum relevant documentation for each task; do not reinterpret a documented target as an already-shipped feature.
>
> **Document ownership:** `AGENTS.md` governs engineering workflow and safety; `DESIGN_SYSTEM.md` governs visual language and theme behavior; `docs/PRODUCT_SPEC.md` governs product capabilities and data contracts. The code and passing tests establish what is actually implemented. Resolve discrepancies explicitly rather than inventing a migration.

## Product

- Product name: **go.flow** (always lowercase).
- AI agent name: **go.agent** (always lowercase). Never rename it to `flow.agent` or any other name.
- Tagline: **From insight to action.**
- Context: an independent AI-First challenge prototype for **Gogroup**; do not present it as an official, endorsed or production-deployed corporate solution.
- Purpose: operational intelligence for inventory health, procurement planning, cash utilization, opportunities, and AI-assisted decision-making.
- User-facing navigation, explanations, statuses and error messages use Brazilian Portuguese. Project identifiers, code symbols and technical documentation may use English.
- The product contains a publicly usable **independently synthetic demo** and a separate **private local-import** workflow. Keep their behavior and claims distinct.
- The current deliverable is a reviewable, no-login demonstration; do not imply orders are placed or external company systems are connected.

## Technology

- Next.js App Router, React, TypeScript, Tailwind CSS (existing project conventions, including Tailwind v4 where already configured).
- Existing deterministic analytics and Smart Buying modules. Reuse these engines; do not clone business formulas in page components or LLM prompts.
- Two processing boundaries:
  - **Demo:** deterministic, independently synthetic data may be processed by application server routes and by the Groq-backed agent.
  - **Imported operation:** browser-only canonical data, Web Worker processing and in-memory session provider; do not transfer original records, operational metrics or user-entered operational parameters to the server or an AI provider.
- Groq SDK integration **already exists** for `go.agent`, according to the latest Codex implementation report. Do not treat it as a future-only feature. Verify current code before modifying its API or model configuration.
- The model is configured via `GROQ_MODEL`; `GROQ_API_KEY` is a server-only secret. Never hard-code a key or assume that a particular model is always available.
- Automated tests cover critical business rules and app behavior. Use existing test framework, scripts and project structure.
- Current working routes reported: `/`, `/estoque`, `/compras`, `/oportunidades`, `/importar`, `/agente`, `/acoes`. Check router before adding any new route.

## Data

- Original challenge files and reference material reside locally in `data/` or its equivalent private directory. They are **confidential**, despite being synthetic.
- Read `data/dicionario_de_dados.md` and `data/parametros.md` **only when a task explicitly requires private business-data interpretation**. Do not read, summarize, copy or quote those files for cosmetic, demo, deployment, documentation or general refactor tasks.
- **Do not reproduce challenge-specific budgets, dates, rates, scenarios, supplier values or operating parameters in public docs, screenshots, fixtures, code comments, demos or client bundles.** Private parameters belong to the user's local context, not the distributable product.
- The public demo was reported to contain **500 independently generated SKUs with 120 days of coherent synthetic history**. This is a reported implementation fact, not a promise that every SKU or series is exhaustive. Do not derive its seed, distributions or records from private files.
- Use an explicit, validated, versioned canonical import contract. Identify files by their actual content/headers rather than relying only on filenames. Report validation errors and unsupported values clearly.
- Source-of-truth selection is **demo OR imported session**, never a mixture. A route change must preserve the imported session within the active browser runtime; a full refresh may clear it by design, and UI must say so.
- All operational inputs (budget, horizon, pack size, MOQ, lead time and pending orders) are **dataset-appropriate and explicit**. Do not use confidential challenge parameters or demo settings as silent defaults for imported operations.
- `localStorage` is allowed for presentation preferences only, not private datasets, imported metrics, supplier records, proposals derived from private input or credentials.
- The UI must identify source, reference period and whether values are observed, projected, simulated or illustrative.

## Business Principles

- Never invent observed business results or claim a simulation is historical evidence.
- Separate **observations**, **forecasts**, **scenarios**, **assumptions** and **verified agent actions** in data models and in interface copy.
- Preserve temporal integrity: no future information in historical decisions; date boundaries, arrivals and event windows must use the active dataset's configuration.
- Validate duplicate sales events, missing records, malformed dates, negative stock and contradictory units. Distinguish data quality warnings from confirmed stockouts.
- Convert units consistently, including box packs and item multipliers; respect minimum order quantities and required order multiples.
- Treat pending purchase orders as expected arrivals, **not physical on-hand stock**; account for uncertainty, delay and non-arrival where the engine supports it.
- Distinguish physical shortage from low-confidence demand forecasts; missing demand is not automatic proof of zero demand.
- Do not routinely replenish discontinued SKUs. Liquidation or exceptional actions must be explicitly justified.
- All costs, quantities, capital, budgets, priorities and constraints are computed deterministically by existing engines, with appropriate monetary precision and validation.
- A budget cap is a constraint, **not a goal to spend 100%**. Never praise utilization alone as evidence of optimization. Explain the marginal value and tradeoffs of proposed actions when data supports them.
- Do not invent savings, service-level attainment, stockout avoidance or financial benefits. Make uncertainty, heuristics and conditional outcomes visible.
- Preserve separation of **calculation → recommendation → human review**. Financial engine output is not a purchase order.

## AI Agent

### Identity and execution contract

- Display name: **go.agent**; voice should be concise, helpful, contextual and grounded in verified operations.
- Functional requirement: at least one **real and verifiable application action**, not merely a chatbot answer.
- Current reported tool: `plan_demo_purchases`, reusing Smart Buying calculations to create structured purchase proposal drafts. Preserve actual tool invocation and its trace; do not substitute an LLM-written proposal.
- Typical workflow: user request → validated intent/tool arguments → tool execution → deterministic results → reviewable draft in **Central de Ações** → approve/reject **demonstrative review status**.
- Model text must not claim a proposal was created unless the application actually registered it and can open its details.
- The LLM can interpret intent and narrate computed outcomes; it **must not determine authoritative prices, quantities, constraints or stock balances**.
- Never place actual supplier orders, issue emails to suppliers, post real transactions, or imply that approval has a financial/operational external side effect.
- Approve/reject remains under human control. Validate all state-changing operations at the actual execution boundary and apply idempotency or duplicate safeguards.

### Session and public deployment limitations

- Existing reported limitations: agent UI history lives in tab memory; proposal review currently has a temporary server-side lifetime. **Do not claim durable persistence, multi-instance consistency or production readiness** without adding and testing an appropriate architecture.
- **Public no-login security requirement:** isolate each visitor's drafts and review permissions; reject guessing/using another visitor's proposal ID. A process-global map or a bare UUID is not sufficient evidence of user isolation. Account for serverless instance behavior before deployment.
- Validate API inputs; bound tool arguments and output size; handle missing key, model errors, timeout, rate limits and retries without false success.
- Imported/private mode must not transmit its prompts, uploaded rows, derived metrics or operational parameters to Groq or server API routes. If external AI is unavailable for this mode, explain the scope clearly; local deterministic analysis may continue.

### Secrets and environment configuration

- Keep secrets in `.env.local` locally and in protected server-side deployment environment variables. Never expose them through `NEXT_PUBLIC_*` or client logs.

## Privacy and Safety

- Never publish original CSVs, the challenge PDF/statement, dictionaries, parameters, supplier lists, sample excerpts or any records derived from confidential inputs.
- Block private files from `public/`, Git-tracked trees, generated routes, API responses, build output, logs, documentation, screenshots, static fixtures and source maps.
- Never copy data from `data/` into public demo generators, tests or screenshots. Synthetic means **independently constructed**, not anonymized/perturbed originals.
- Confirm `.env.local`, `.env*` private variants, data directories and credentials are ignored. A `.gitignore` entry does **not** remove files already committed; inspect tracked paths and Git history before first public push.
- Do not print raw private content when auditing. Report only file paths or non-sensitive summaries needed to remediate risks.
- Do not pass original rows, confidential operational values or derived private summaries to AI providers, telemetry, analytics, server functions or other third parties.
- Avoid third-party tracking or unnecessary external services. Make any intentional external transfer of **demo-only** data explicit in code and UI.
- A public Groq endpoint needs safeguards against unauthenticated abuse, including validation, rate limiting or other bounded resource controls appropriate to the deployment.
- The public challenge version may be online temporarily for evaluation. Remove its public deployment after the process as instructed; a future independent portfolio version requires a separately reviewed, rights-compliant codebase and identity.
- **Do not commit, push, publish or deploy without explicit user instruction.** Do not silently rewrite Git history or delete private user files.

## Visual and UX Principles

- `DESIGN_SYSTEM.md` is the primary design authority. Preserve its existing technical theme contract before introducing v4 expressive elements.
- Creative principle: **expressive by nature. precise by design.** Editorial brand language, navy/blue/lime and signature connected curves; financial surfaces stay calm and readable.
- Existing light/dark/system theme behavior, SSR hydration, semantic tokens, accessible contrast, keyboard navigation and reduced motion are non-negotiable.
- Show actual source labels: **demo sintética** versus **importação local**. Preserve imported-session state across route navigation.
- Long-term creative targets: `go.` → `go.flow` → `olá.` splash, five-scene onboarding, Flow Handoff, and the original Flow Orb mascot for go.agent. **Targets are not automatically implemented; inspect before claiming they work.**
- Visual work must not change analytics, business logic, security boundaries or Groq tool contracts. Avoid broad rewrites of existing screens just to change styling.
- Prioritize shared shell, navigation, source context, cards, agent and actions; keep editorial animation outside dense tables and decision controls.

## Development Workflow

### Implementation rules

1. **Before editing:** read this file, then **only** relevant sections of `docs/PRODUCT_SPEC.md` or `DESIGN_SYSTEM.md`; inspect the few files directly implicated by the request. Avoid repository-wide audits unless the task is explicitly a release/security audit.
2. **Scope:** implement only requested deltas, preferably in a small coherent file set. Do not rebuild or rename working modules, change databases, or add dependencies without a concrete need.
3. **Token economy:** avoid repeatedly dumping whole files, large generated datasets, full test logs or unchanged specs into the Codex context. Query focused excerpts and report succinctly.
4. **Testing:** run focused tests during iteration; run full `npm run test:run`, `npm run lint` and `npm run build` at integration/release milestones, or when explicitly required. Do not rerun expensive suites after a documentation-only change.
5. **Safety:** do not print, log, summarize, transmit or commit private material. Stop and report a potential leak instead of proceeding with publishing.
6. **Verification:** report what was actually run and observed versus what still needs human/browser validation. Never claim a successful deployment or end-to-end behavior from unit tests alone.
7. **Output:** respond in Brazilian Portuguese, listing essential changed files, relevant verification results, remaining limitations and the next practical user check. Default to a compact report, not a repetitive audit narrative.
8. **Release:** no automatic commit, push or deployment. Confirm no-login public route, real agent action, isolation, env setup and runtime behavior before the user publishes.

## Current Implementation Snapshot (reported, not independently verified)

### Latest reported milestones

- Flow Import and session-provider navigation issue corrected in the 13.1 adjustment.
- Prompt 14 integrated demo and imported source across the four operational pages; reported 500 independent demo SKUs and 120 days of synthetic histories.
- Prompt 15 integrated the Groq-backed agent and Central de Ações; reported tool execution and a reviewable synthetic purchase proposal.
- Latest Codex report: 405 tests passed, lint/build passed. These are **historical reports, not permanent acceptance gates**; new tests may legitimately change the count.

### Open release risks

- **Still to verify:** real-browser E2E, cross-visitor proposal isolation, serverless consistency, safe public Git history, correct deployed environment variables and production smoke test.
- Current priority with a same-day challenge deadline: visual polish within scope → security/release audit → first public deployment → optional refinements only if time remains.

## Change-control Rules

- Preserve identifiers and existing contracts (`go.flow`, `go.agent`, `plan_demo_purchases`, existing paths and canonical import schema) unless user explicitly approves changes.
- Public documentation may reference the challenge context and general capability, but **never reproduce the confidential statement or private business numbers**.
- If a document contradicts live code or tests, report the mismatch and propose a targeted correction; do not silently force either into agreement.
- If user requests a feature beyond the current task, implement only when explicitly prioritized; no speculative architecture or 'nice to have' work.

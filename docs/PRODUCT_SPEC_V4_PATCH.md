go.flow — Product Spec v4: Integration Patch
Purpose: companion changes for the existing docs/PRODUCT_SPEC.md. This is not a replacement for the current product spec, because its full current contents were not supplied. Merge these sections into the existing file only where they add or correct behavior. Preserve canonical schemas, testable financial rules and API contracts already implemented.

Important: all implemented-status statements below come from Codex reports shared by the project owner, not from an independent audit of the live repository. Verify before stating a feature is production-ready.

1. Product scope and source modes
The application is go.flow, an independent AI-First operational-intelligence prototype. The agent is always go.agent. The product helps review inventory health, risks, opportunities and purchasing proposals. It does not issue actual supplier purchases.

Two separate source modes are supported:
Mode	Purpose	Data boundary	AI behavior
Public demo	Evaluate a working no-login product	Independently seeded synthetic data; safe for public demo	Groq-powered agent may invoke server-side tools with synthetic data only
Local import	Analyze user-selected operational datasets	User's browser memory and Web Worker; no external transfer	Deterministic local engines only; no Groq transfer of rows, metrics, prompts or operational parameters


A single active source powers /, /estoque, /compras, /oportunidades. Never merge demo and local data when computing numbers or rendering proposals. Show the currently active source visibly.
2. Reported implementation through Prompt 15
- Flow Import: content-based CSV recognition and validation; canonical session data in memory; one-stage-at-a-time wizard; persistent session provider across routes; browser Worker. A browser refresh may reset the session.
- Demo: deterministic independently generated 500 SKUs and 120 days of internally coherent synthetic history, according to the Prompt 14 report. Do not use the original challenge file as its seed or template.
- Operational pages: source-aware dashboards, stock risks, intelligent purchases and opportunities. Reuse deterministic engines rather than duplicating computations.
- Smart Buying: dataset-appropriate configuration; budget, horizon, pack units, MOQ and required multiples, lead time, pending orders and other supported constraints. Avoid confidential/default challenge settings for imported data.
- go.agent: server-side Groq integration, tool calling via plan_demo_purchases, proposal generation and a review page (/agente and /acoes).
- Central de Ações: visible, reviewable demonstrative drafts, not issued purchase orders. Temporary storage and review session; no durable persistence guarantee.
- Latest shared verification: 405 tests passed, lint/build passed after Prompt 15. Real browser E2E, multi-user isolation and public deployment still need verification.
3. Deterministic decision contract
- Model output is not an authoritative financial calculation.
- All prices, quantities, monetary totals, planning constraints and proposal lines come from existing validated deterministic tools.
- Model may select/coordinate allowed tools and explain their actual results.
- Only use observed metrics when observed data exists. Forecasts/scenarios require source, horizon, assumptions and uncertainty.
- Stock on hand, expected inbound PO, reorder suggestion and projected coverage are distinct.
- Demand uncertainty is a separate concept from confirmed physical shortage.
- Excluded/discontinued products do not receive routine replenishment without explicit justification.
- Spending nearly the entire budget must not automatically be praised as an optimal strategy. Show prioritization rationale and constraints if supported.
- Approval/rejection changes the internal review state only. No supplier contact, ERP write or payment action occurs.
4. Agent action and security contract
The core demonstrable flow is:
1. A user requests an analysis on independent demo data.
2. Server validates request, allowed source and tool arguments.
3. Groq selects/calls a permitted tool (such as plan_demo_purchases).
4. The application runs existing deterministic business logic.
5. A structured draft is registered with unique ID and reviewable details.
6. Central de Ações permits genuine demonstrative approval/rejection status changes for the rightful session only.
7. UI displays actual result, calculated numbers, tool provenance and limitations; no fake success.
Do not claim production isolation from a plain UUID, process-local memory or a 30-minute TTL alone. Before public release, verify per-visitor authorization for draft fetch/review and handling across Vercel serverless instances. Confirm bounded API usage (input validation, rate limiting, token/output limits, timeout, 429 behavior). If not safe, restrict or redesign the flow before publication.
5. Import confidentiality and operational integrity
- Private challenge files, its statement, schema dictionary, parameters and results derived from them are never packaged into public source, static assets or deployments.
- Private mode keeps original rows, derived operational metrics and user-entered parameters inside the browser execution boundary.
- Explicitly block Groq routes when the selected source is imported; a frontend badge alone is not sufficient.
- The wizard is reversible without resetting the entire session on normal navigation; clearing/replacing private data requires explicit confirmation.
- Browser reload may clear imported data; show transparent messaging rather than claiming persistence.
- Unavailable data must be displayed as unknown/unsupported, not fabricated as zero.
6. Visual/product experience contract
DESIGN_SYSTEM.md v4 owns visual implementation details. Product behaviors required to make the visual experience honest and useful:
- No-login source choice: Explorar ambiente demonstrativo or Analisar operação local.
- Splash go. → go.flow → olá. and five-scene onboarding are visual targets, not a prerequisite for correct engine behavior. They are skippable, replayable and must preserve current operational state.
- Onboarding headlines, in order: olá.; ousados. inquietos. criativos.; o próximo movimento começa aqui.; conheça o go.agent.; como deseja começar?.
- Flow Orb may become the floating agent entry; full /agente route remains available.
- Source badges and explicit reviewed/proposed/executed states are essential, not decoration.
- go.pulse/Flow Replay/Flow Lab and richer charts are not automatically available: render as real features only if actually implemented.
- All flow states work with keyboard, touch and reduced motion. Do not hide errors behind animation.
7. Priority order before public evaluation
1. Confirm demo dashboards and existing calculations behave coherently.
2. Confirm Groq tool call creates a genuinely reviewable draft and safe per-visitor review state.
3. Verify private/import data cannot leave the browser or enter public artifacts.
4. Audit Git tree/history, API secrets, rate limits and serverless session implementation.
5. Publish GitHub repository + Vercel/no-login application after explicit owner approval.
6. Apply optional splash, onboarding, motion and Flow Orb refinements where time and stability permit.
7. Test deployed link and the real reviewer path from first visit through agent action/review.
8. Integration instructions
- Merge content into docs/PRODUCT_SPEC.md without removing existing schemas, type definitions, formulas, technical decisions, tests and caveats.
- Correct any outdated claim such as “Groq integration will be added later” to the current reported implementation, but verify code before claiming production readiness.
- Remove any public-facing hardcoded confidential business reference values, but preserve private local rules inside the private context where necessary for the user’s analysis.
- If sections conflict with current code, report the conflict and suggest a focused patch; do not silently rewrite business logic.
- Do not implement code changes simply to comply with this documentation merge; handle functional changes in separate scoped prompts.
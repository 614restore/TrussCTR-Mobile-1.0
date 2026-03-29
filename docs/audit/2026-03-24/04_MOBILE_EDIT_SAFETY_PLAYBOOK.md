# Mobile Edit Safety Playbook

Goal: support precise edits without collateral regressions.

## 1) Guardrails

1. Route all status logic through `src/lib/pipelineStages.ts` (no ad-hoc mappings in views).
2. Keep schedule milestone serialization logic centralized in `src/lib/contactSchedule.ts`.
3. Keep document URL/storage normalization in `src/lib/documentAccess.ts` and `src/lib/pdfService.ts`.
4. Keep Supabase schema assumptions synchronized with `src/types/supabase.ts`.
5. Any native iOS plugin edits require parallel JS flow checks and a simulator sanity pass.

## 2) Isolation Zones

- Auth/session: `src/context/AuthContext.tsx`
- Pipeline/status: `src/lib/pipelineStages.ts`, `src/pages/Pipeline.tsx`, `src/pages/ContactDetail.tsx`, `src/lib/store.ts`
- Scheduling: `src/pages/Calendar.tsx`, `src/lib/contactSchedule.ts`, `src/lib/scheduleEvents.ts`
- Documents/signing/viewer: `src/pages/Documents.tsx`, `src/pages/DocumentManager.tsx`, `src/pages/DocumentSigner.tsx`, `src/pages/EstimateSigner.tsx`, `src/pages/DocumentViewer.tsx`
- Native iOS: `ios/App/App/*`

## 3) Mandatory Validation per Fix PR

```bash
npm run lint
npm run build
```

Recommended additional checks:

```bash
npx cap sync ios
xcodebuild -list -project ios/App/App.xcodeproj
```

## 4) Wave Branches

- `codex/mobile-wave1-status`
- `codex/mobile-wave2-scheduling`
- `codex/mobile-wave3-docs-signing`
- `codex/mobile-wave4-native-ux`

## 5) Definition of Done

- Root-cause scoped changes only
- Green lint/build
- Gherkin scenarios updated for modified behavior
- Manual repro script attached for the changed flow

# Mobile System Audit + Implementation Gameplan

Generated: 2026-03-24
Scope: Capacitor mobile app + iOS shell

## 1) Baseline + Architecture

Runtime model:
- React + Vite front-end packaged via Capacitor
- Native iOS wrapper at `ios/App/App.xcodeproj`
- Supabase backend integration for auth/data/storage

Verified iOS targets:
- Target: `App`
- Scheme: `App`
- Configurations: `Debug`, `Release`

## 2) Baseline Quality Evidence

Commands run:
- `npm run lint` -> PASS
- `npm run build` -> PASS
- `xcodebuild -list -project ios/App/App.xcodeproj` -> PASS

## 3) Capability Inventory (Code-Verified)

- Auth/session + password reset: `src/context/AuthContext.tsx`, `src/pages/Login.tsx`, `src/pages/ResetPassword.tsx`
- Pipeline + contact lifecycle: `src/pages/Pipeline.tsx`, `src/pages/ContactDetail.tsx`, `src/lib/pipelineStages.ts`
- Scheduling + milestones: `src/pages/Calendar.tsx`, `src/lib/contactSchedule.ts`, `src/lib/scheduleEvents.ts`
- Documents + signing + viewing:
  - `src/pages/DocumentManager.tsx`
  - `src/pages/DocumentSigner.tsx`
  - `src/pages/EstimateSigner.tsx`
  - `src/pages/DocumentViewer.tsx`
- Mentions + notifications: `src/lib/noteMentions.ts`, `src/pages/ContactDetail.tsx`, `src/pages/Notifications.tsx`
- Reports + PDF export: `src/lib/pdfService.ts`, `src/pages/ReportBuilder.tsx`
- Native iOS bridge/plugins:
  - `ios/App/App/AppDelegate.swift`
  - `ios/App/App/Plugins/MultiShotCameraPlugin.swift`

## 4) Priority Findings

### P0

1. Status normalization collapses `paid -> completed`.
- File: `src/lib/pipelineStages.ts`
- Impact: paid-specific milestones/next-step branches can be skipped or misrepresented.

### P1

2. Mixed canonical/alias status checks across large flows.
- Files:
  - `src/pages/ContactDetail.tsx`
  - `src/pages/Pipeline.tsx`
  - `src/lib/store.ts`
- Impact: inconsistent transitions and UI labels for appointment/inspection/signed/paid states.

3. Document visibility/signature traceability depends on document naming and type combinations.
- Files:
  - `src/pages/DocumentManager.tsx`
  - `src/pages/Documents.tsx`
  - `src/pages/ContactDetail.tsx`
  - `src/pages/DocumentSigner.tsx`
  - `src/pages/EstimateSigner.tsx`
- Impact: signed output may exist but be difficult to discover consistently across customer/global views.

### P2

4. High-complexity screens (ContactDetail, signing, report builder) need stronger regression net before invasive edits.
- File focus:
  - `src/pages/ContactDetail.tsx`
  - `src/pages/ReportBuilder.tsx`

## 5) Fix Waves (Mobile)

### Wave M1 (P0): Status Canonicalization

- Establish single source for status aliases + progression semantics.
- Refactor all status checks to consume shared resolver only.
- Preserve `paid` semantics as distinct stage outcome where business logic requires.

Targets:
- `src/lib/pipelineStages.ts`
- `src/pages/Pipeline.tsx`
- `src/pages/ContactDetail.tsx`
- `src/lib/store.ts`

### Wave M2 (P1): Schedule/Next-Step Reliability

- Normalize schedule milestone advancement and next-step CTA logic.
- Ensure save error paths are user-visible (not silent/console-only).

Targets:
- `src/pages/Calendar.tsx`
- `src/pages/ContactDetail.tsx`
- `src/lib/contactSchedule.ts`
- `src/lib/scheduleEvents.ts`

### Wave M3 (P1): Documents + Signing Visibility

- Unify visibility rules for signed docs in customer and global contexts.
- Harden signed artifact linkage via metadata rather than filename heuristics.

Targets:
- `src/pages/DocumentManager.tsx`
- `src/pages/Documents.tsx`
- `src/pages/ContactDetail.tsx`
- `src/pages/DocumentSigner.tsx`
- `src/pages/EstimateSigner.tsx`

### Wave M4 (P1/P2): Mobile UX + Native Stability

- Validate navigation persistence, tab scrolling behavior, camera/upload continuity.
- Verify Capacitor plugin behavior on real device and simulator.

Targets:
- `src/components/Layout.tsx`
- `src/pages/Pipeline.tsx`
- `src/pages/ContactDetail.tsx`
- `src/pages/PhotoChecklist.tsx`
- `ios/App/App/Plugins/MultiShotCameraPlugin.swift`

## 6) Exit Criteria

- No open P0/P1 defects
- `npm run lint` + `npm run build` green
- iOS scheme list/build metadata stable
- Gherkin coverage updated for each fixed root cause
- Status consistency validated across dashboard, pipeline, contact detail, and schedule milestones

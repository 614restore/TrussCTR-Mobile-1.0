# Mobile Feature Capability Matrix

Generated: 2026-03-24

| Area | Capability | State | Primary Targets |
|---|---|---|---|
| Auth | Session bootstrap + refresh recovery | Implemented | `src/context/AuthContext.tsx` |
| Auth | Login + password reset routes | Implemented | `src/pages/Login.tsx`, `src/pages/ResetPassword.tsx` |
| Pipeline | Kanban/list/map with stage counts/search | Implemented, Audit-needed | `src/pages/Pipeline.tsx` |
| Contact | Deep contact profile, tabs, timeline, financial, docs | Implemented, Audit-needed | `src/pages/ContactDetail.tsx` |
| Schedule | Calendar + next-step prompts | Implemented, Audit-needed | `src/pages/Calendar.tsx` |
| Documents | Contact/global document browsing and viewer | Implemented | `src/pages/DocumentManager.tsx`, `src/pages/Documents.tsx`, `src/pages/DocumentViewer.tsx` |
| Signing | Contact document signer + estimate signer | Implemented, Audit-needed | `src/pages/DocumentSigner.tsx`, `src/pages/EstimateSigner.tsx` |
| Mentions | In-note mentions and notifications | Implemented | `src/lib/noteMentions.ts`, `src/pages/Notifications.tsx` |
| Reports | Report builder and PDF generation/upload | Implemented | `src/pages/ReportBuilder.tsx`, `src/lib/pdfService.ts` |
| Team | Team list and role-aware views | Implemented | `src/pages/Team.tsx` |
| Company | Logo/profile/company data rendering | Implemented | `src/pages/CompanyProfile.tsx`, `src/pages/More.tsx` |
| Native iOS | Capacitor shell + camera/plugin bridge | Implemented | `ios/App/App/AppDelegate.swift`, `ios/App/App/Plugins/MultiShotCameraPlugin.swift` |
| CI | Build + lint + cap sync workflow | Implemented | `.github/workflows/build.yml` |

## Core Risk Summary

- Highest-risk domain is status/state consistency across pipeline/contact/schedule.
- Second-risk domain is signed-document discoverability across customer/global views.

# Final Regression Runbook (Mobile)

Updated: 2026-03-24
Repo: `/Users/jeffreynewell/Documents/TrussCTR-Mobile-1.0`

## Automated Gate (Completed)

- `npm run lint`: PASS
- `npm run build`: PASS

## Manual Acceptance Script (iOS Simulator + Physical Device)

Run every item on both simulator and device.

1. Native shell + session
- Launch app cold start.
- Login, background app, reopen.
- Force close app and relaunch.
- Confirm session behavior and route restoration.

2. Pipeline/status consistency
- Move a customer through:
  - `lead -> appt_set -> inspected/inspection_completed -> estimate_sent -> signed -> paid/completed`
- Confirm:
  - pipeline stage
  - dashboard stage counts
  - contact current status/progress
  - project status/next-step card

3. Scheduling reliability
- Open all “Schedule Next Step” entry points.
- Create and save appointment with keyboard open on compact viewport.
- Force one bad input case (missing date/time) and confirm visible validation.
- Confirm save errors surface in UI when failure is simulated.

4. Documents/signing visibility
- Upload legal docs from contact context.
- Verify signed/legal visibility in:
  - contact documents
  - global documents
- Confirm open/view actions work and URLs resolve.

5. Mobile interaction stability
- Horizontal drag stress on contact tabs and pipeline board.
- Vertical scroll should retain priority (no horizontal drift/sway).
- Verify bottom navigation remains stable after search/filter and screen transitions.

6. Media/avatar/logo flow
- Upload/crop avatar/logo repeatedly.
- Confirm save + render consistency.
- Confirm no cropper blank states and no stale old image after save.

## Pass/Fail Capture Table

| ID | Area | Status | Notes | Evidence |
|----|------|--------|-------|----------|
| MOB-AUTH-01 | Session persistence | PENDING |  |  |
| MOB-PIPE-01 | Pipeline transitions | PENDING |  |  |
| MOB-PIPE-02 | Alias/canonical status behavior | PENDING |  |  |
| MOB-CAL-01 | Scheduling save/validation | PENDING |  |  |
| MOB-DOC-01 | Contact/global doc parity | PENDING |  |  |
| MOB-UI-01 | Gesture/scroll stability | PENDING |  |  |
| MOB-UI-02 | Bottom nav persistence | PENDING |  |  |
| MOB-MEDIA-01 | Avatar/logo crop + save | PENDING |  |  |

## Failure Triage Rules

- P0: Data loss or blocked core flow.
- P1: Core flow unreliable/intermittent.
- P2: UX regressions.

Do not release with open P0.

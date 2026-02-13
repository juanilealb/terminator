# UI/UX Review Decisions

Reviewed on 2026-02-13.

Note: `UI-UX-REVIEW.md` currently contains 19 findings (not 18), so all 19 are listed below.

| # | Priority | Finding | Verdict | Reason |
|---|---|---|---|---|
| 1 | HIGH | macOS font stack in design tokens | IMPLEMENT | Windows font fallback was objectively poor and user-visible on every screen. |
| 2 | HIGH | Hardcoded macOS mono fonts in terminal/editor | IMPLEMENT | Duplicated hardcoded stacks bypassed tokens and broke Windows consistency. |
| 3 | HIGH | No focus-visible styles | IMPLEMENT | Keyboard focus visibility is baseline accessibility and high practical ROI. |
| 4 | HIGH | `window.confirm()` for destructive actions | IMPLEMENT | Native browser confirms were visually jarring and inconsistent with existing in-app dialog UX. |
| 5 | MEDIUM | Drag region with no window controls | SKIP | `BrowserWindow` already uses `frame: true`, so native Windows controls are present. |
| 6 | MEDIUM | `Cmd+S` comment in `FileEditor` | IMPLEMENT | Cheap cleanup that removes platform confusion in maintenance. |
| 7 | MEDIUM | No right-click context menus | SKIP | Large feature set for low immediate ROI in this dev-tool phase. |
| 8 | MEDIUM | Scrollbar styling not Windows-aware | IMPLEMENT | We kept thin global scrollbars and restored tab-bar scrollbar visibility for usability. |
| 9 | MEDIUM | `e.metaKey` checks in shortcuts | SKIP | Current behavior is correct; renaming-only churn is low value right now. |
| 10 | MEDIUM | Missing ARIA labels on icon-only buttons | IMPLEMENT | Small effort, direct accessibility win, no product risk. |
| 11 | MEDIUM | `pwsh.exe` placeholder could confuse users | IMPLEMENT | Generic shell examples are clearer for broader Windows setups. |
| 12 | MEDIUM | Dialogs not trapping focus | IMPLEMENT | Added modal semantics + focus trap/restore to prevent background tab escape. |
| 13 | LOW | Rounded corners feel macOS-like | SKIP | Design preference only; not correctness or usability-critical. |
| 14 | LOW | Toast slide direction | SKIP | Pure polish with negligible functional impact. |
| 15 | LOW | Empty-state CTA could be richer | SKIP | Existing flow is understandable and this is non-blocking polish. |
| 16 | LOW | Confirm dialog uses `⇧` symbol | SKIP | Acceptable on Windows and not worth churn now. |
| 17 | LOW | Tab bar overflow has no affordance | IMPLEMENT | Visible horizontal scrollbar is a pragmatic affordance with minimal complexity. |
| 18 | LOW | `window.open()` should use Electron shell | SKIP | Main process `setWindowOpenHandler` already routes links to external browser. |
| 19 | LOW | No forced-colors/high-contrast support | SKIP | Valuable but broader theming work; deferred for a dedicated accessibility pass. |

## Implemented Scope

- Windows-first font stacks in design tokens.
- Mono font token usage in editor and terminal.
- Stronger global `:focus-visible` ring.
- Replaced `window.confirm()` close flows with store-driven `ConfirmDialog`.
- Added ARIA labels to icon-only buttons called out in review.
- Updated shell placeholder text in settings.
- Added modal semantics (`role="dialog"`, `aria-modal`) plus focus trap/restore for dialogs and Quick Open.
- Restored visible horizontal tab-bar scrollbar for overflow affordance.

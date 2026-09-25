# Navigation audit – LendLine

As of 2026-09-25, commit `df15966`. Reviewed: how one moves through LendLine – sidebar, paths to the most frequent tasks, dialogs, redirects, links from e-mails and from the overview. UI names are given in English; at the time of the audit the interface was German only.

**Method:** Code review of all pages and routes (`App.tsx`, `Layout.tsx`, all `pages/`) and a walk-through in the browser (headless Edge) with the demo accounts, on a typical laptop screen (1366 × 768) and a phone (390 × 844). Counted: clicks to the goal and dialogs open at the same time.

## Starting point (measured)

| Task                                                  | Path today                                                                                         | Clicks to the form | Stacked dialogs |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ | --------------- |
| User books through the search                         | Search (results for tomorrow are already there) → "Calendar & request" → "Request for this period" | 2                  | **2**           |
| User books through the catalogue                      | Catalogue → "Pieces" → "Calendar" → choose a day                                                   | 3                  | **3**           |
| User opens a link while signed out                    | `/my-requests` → sign-in → lands on `/search`                                                      | –                  | –               |
| User wants to get to the app after an approval e-mail | The e-mail contains no link                                                                        | –                  | –               |
| Administration reviews a request from the overview    | Overview shows it → "Review all" → look for the request in the list → Approve                      | 2 + searching      | –               |
| Administration changes registration/e-mail text/logo  | three different menu entries (Settings, E-mails, Appearance)                                       | 1                  | –               |

Administration sidebar: **16 entries in 5 groups**. On 1366 × 768, 202 px are hidden; "Settings", "E-mails", "Maintenance" and "Usage" only become visible after scrolling.

## Findings

| #   | Finding                                                                    | Severity | Status      |
| --- | -------------------------------------------------------------------------- | -------- | ----------- |
| 1   | Booking through the catalogue stacks three dialogs                         | High     | implemented |
| 2   | Booking through the search stacks two dialogs although the period is known | Medium   | implemented |
| 3   | Administration sidebar too long, entries only visible after scrolling      | Medium   | implemented |
| 4   | Settings spread over three menu entries, unclear boundaries                | Medium   | implemented |
| 5   | The page originally opened is lost after signing in                        | Medium   | implemented |
| 6   | E-mails contain no link back into the app                                  | Medium   | implemented |
| 7   | No way to "My requests" after sending a request                            | Low      | implemented |
| 8   | Overview entries only lead to the list, not to the request                 | Low      | implemented |
| 9   | The administration sees the borrowing group before its own work            | Low      | implemented |
| 10  | Unknown addresses lead admins to the search too                            | Low      | implemented |
| 11  | Registration is not mentioned on the users page                            | Low      | implemented |

## After the changes (measured)

The same walk-through in the browser after the changes, same screen sizes:

| Task                                    | Before                                     | After                                                                        |
| --------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| User books through the search           | 2 clicks, 2 stacked dialogs                | **1 click** ("Request"), 1 dialog; calendar in the same window               |
| User books through the catalogue        | 3 clicks, 3 stacked dialogs                | 2 clicks, **1 dialog**; with only one piece straight to the calendar         |
| After sending                           | Calendar stays open, notice without a link | Dialog closes, the page shows a confirmation with "Go to my requests"        |
| Open `/my-requests` signed out, sign in | lands on `/search`                         | lands on `/my-requests`                                                      |
| Unknown address (administration)        | `/search`                                  | `/admin`                                                                     |
| E-mail → app                            | no link                                    | "Open my requests" in approval, rejection, return                            |
| Review a request from the overview      | open the list, look for the entry          | a click on the entry jumps to the highlighted row                            |
| Administration sidebar (1366 × 768)     | 16 entries, 202 px hidden                  | **12 entries, nothing hidden**; "Administration" first, "Help" in the footer |
| Settings                                | 4 menu entries                             | 1 menu entry with 4 tabs; old addresses and shortcuts keep working           |

`npm run check` is green in backend, frontend and docs. The test request from the walk-through was withdrawn again.

Checked without finding: "My account" (name at the bottom of the sidebar, labelled "My account"), keyboard shortcuts (`g` + letter, `/`, `n`, `?`), mobile menu (opens with focus, closes with Escape), maintenance banner with a link, counters on "Requests" and "Loans", overview tiles as links.

## 1. Booking through the catalogue stacks three dialogs — **High**

**Files:** `frontend/src/pages/DevicesPage.tsx`, `frontend/src/components/DeviceImages.tsx` (`PieceListDialog` → `PieceCalendarDialog` → request modal)

**Description:** "Pieces" opens a list of the pieces, "Calendar" in it a second dialog, a day in it a third one with the form. In the browser, "Logitech Presenter", "Piece ZB-4001" and "Request a loan" then lie on top of each other. Closing goes back step by step, the background is darkened three times, and on the phone only the top dialog is visible. Even for devices with exactly one piece one has to go through the piece list. The button is called "Pieces" in the catalogue and "Calendar & request" in the search – for the same action.

**Improvement:** One dialog with steps instead of a stack: piece list → calendar → form in the same window, with "Back". With only one available piece, straight to the calendar. A uniform "Calendar & request" button.

## 2. Booking through the search stacks two dialogs — **Medium**

**Files:** `frontend/src/pages/SearchPage.tsx`, `frontend/src/components/DeviceImages.tsx`

**Description:** Whoever has already chosen a period in the search must still first open the calendar and click "Request for this period" there; the form opens as a second dialog above the calendar.

**Improvement:** "Request" opens the form directly with the period of the search. The calendar is reached in the same dialog via "Choose another period in the calendar".

## 3. Administration sidebar too long — **Medium**

**Files:** `frontend/src/components/Layout.tsx`

**Description:** 16 entries and 5 group headings. On a 768 px high screen the last four entries are hidden. "Usage" stands alone in its own "Help" group.

**Improvement:** Combine the settings (finding 4), move "Usage" as an icon next to "Theme" into the sidebar footer. Result: 12 entries in 4 groups. Slightly more compact entries on low screens.

## 4. Settings spread over three menu entries — **Medium**

**Files:** `Layout.tsx`, `AdminBrandingPage.tsx`, `AdminSettingsPage.tsx`, `AdminEmailsPage.tsx`, `AdminMaintenancePage.tsx`

**Description:** "Appearance", "Settings", "E-mails" and "Maintenance" are four entries, although all of them configure the installation. Where something lives is not predictable (registration under "Settings", logo in e-mails under "Appearance", sender under "E-mails").

**Improvement:** One entry "Settings" with the tabs "Appearance", "Rules & form", "E-mails", "Maintenance". The previous addresses stay valid (bookmarks, shortcuts, maintenance banner) and open the matching tab.

## 5. The original page is lost after signing in — **Medium**

**Files:** `frontend/src/App.tsx` (`Protected`), `frontend/src/pages/LoginPage.tsx`

**Description:** Whoever opens `/my-requests` while signed out (bookmark, expired session, link from a message) lands on `/search` or `/admin` after signing in.

**Improvement:** The requested address is passed to the sign-in; afterwards it goes exactly there (internal paths only, no foreign addresses).

## 6. E-mails without a link back — **Medium**

**Files:** `backend/src/emails/format.ts`, `backend/src/emails/templates.ts`

**Description:** Approval, rejection and return name no address of the app. Whoever wants to check the status or make a new request has to find LendLine themselves.

**Improvement:** A link "Open my requests" (from `FRONTEND_ORIGIN`) in every notification; together with finding 5 it also leads to the right page after a sign-in.

## 7. No way to "My requests" after sending — **Low**

**Files:** `DeviceImages.tsx`, `SearchPage.tsx`, `DevicesPage.tsx`

**Description:** After "Send request" the calendar stays open; the notice "You can see the status under 'My requests'" is not a link.

**Improvement:** The dialog closes, the page shows the confirmation with a link "Go to my requests".

## 8. The overview only leads to the list — **Low**

**Files:** `AdminHomePage.tsx`, `AdminRequestsPage.tsx`, `AdminBorrowedPage.tsx`

**Description:** The overview shows the oldest open requests and due returns, but a click only leads to the whole list; there one has to look for the entry again.

**Improvement:** Every entry links to its row; the list jumps to it and highlights it.

## 9. The administration sees borrowing first — **Low**

**Files:** `Layout.tsx`

**Description:** Admins land on the overview, but the sidebar first shows "Find piece / Catalogue / My requests". The actual work (requests, loans) comes below.

**Improvement:** For admins the "Administration" group comes first, "Borrowing" below it.

## 10. Unknown addresses lead admins to the search — **Low**

**Files:** `App.tsx`

**Description:** Every unknown address redirects to `/search`, for the administration too.

**Improvement:** Redirect to the start page of the role (`/admin` or `/search`).

## 11. Registration not mentioned on the users page — **Low**

**Files:** `AdminUsersPage.tsx`

**Description:** Whoever looks for self-registration on "Users" does not find it; it lives under the settings.

**Improvement:** A note with the current status and a link to the setting on the users page.

# Phase 5 — Actual production screenshots

All images below were captured from the local production build with disposable PostgreSQL, synthetic identities and the loopback email sink. No real owner, token, password or private writing is shown. Mobile screenshots use CSS-pixel/DPR-1 capture for comparison with Phase 4; behavior and accessibility additionally run under Pixel device emulation.

## Login

Desktop, 1053 × 662:

![Actual desktop login](../artifacts/phase-5/login-desktop.png)

390 × 844:

![Actual 390-pixel login](../artifacts/phase-5/login-mobile-390.png)

320 × 740:

![Actual 320-pixel login](../artifacts/phase-5/login-mobile-320.png)

## Diary and all four themes

Sakura Pink, desktop:

![Actual Sakura Pink desktop diary](../artifacts/phase-5/diary-desktop-sakura-pink.png)

Dreamy Sky, desktop:

![Actual Dreamy Sky diary](../artifacts/phase-5/diary-desktop-dreamy-sky.png)

Lavender Dreams, desktop:

![Actual Lavender Dreams diary](../artifacts/phase-5/diary-desktop-lavender-dreams.png)

Vintage Journal, desktop:

![Actual Vintage Journal diary](../artifacts/phase-5/diary-desktop-vintage-journal.png)

390 px Sakura Pink:

![Actual 390-pixel diary](../artifacts/phase-5/diary-mobile-390-sakura-pink.png)

320 px Sakura Pink:

![Actual 320-pixel diary](../artifacts/phase-5/diary-mobile-320-sakura-pink.png)

## Password recovery

![Actual password recovery](../artifacts/phase-5/recovery.png)

The form supports reset requests for the existing verified owner and verification-link requests for the existing bound account. Real email delivery is not configured or claimed.

## Reauthentication while writing

Before revocation, with clearly synthetic unsaved writing:

![Actual writing before reauthentication](../artifacts/phase-5/editing-before-reauthentication.png)

After the synthetic session is revoked, the original workspace is retained, hidden, inert and read-only behind this gate:

![Actual locked reauthentication gate](../artifacts/phase-5/reauthentication.png)

After same-owner login, the writing is restored in the same mounted workspace:

![Actual writing after reauthentication](../artifacts/phase-5/editing-after-reauthentication.png)

Separate browser assertions verify the original textarea node, backward selection, cursor, date and scroll restoration; a different verified identity cannot unlock the workspace. These screenshots demonstrate continuity, not durable storage. The status remains **Preview · not saved**.

## Comparison with the approved Phase 4 design

The authentication views are the necessary new Phase 5 surfaces. The diary retains its approved CSS, paper hierarchy, four-corner illustrations, date typography, navigation, rule spacing and themes. The necessary Sign out link is the intentional footer addition. No visual redesign was made during this security review.

Exact paper/editor geometry, rule spacing, overflow and header/paper pixel differences for the final regenerated views are recorded in [visual-comparison.json](../artifacts/phase-5/visual-comparison.json). Comparison excludes the footer containing Sign out. Differences confined to tiny antialiasing values on illustration edges are reported numerically rather than described as exact pixel matches.

Automated accessibility scans cover authentication/recovery forms, logout, calendar and all diary themes; mobile overflow, keyboard focus, selection and reflow assertions are included in the full Playwright suite. Results are in the updated security handoff and verification artifact.

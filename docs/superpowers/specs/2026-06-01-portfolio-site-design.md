# abdealikhurrum.github.io — portfolio site (design)

_Date: 2026-06-01_

## Goal
Replace the current single Keyman-keyboard page with a small portfolio site that
routes to five projects, plus site-wide Privacy and Contact pages. Keep it simple:
plain static HTML, one shared stylesheet, no build step, no JavaScript required.
Served by GitHub Pages from the `master` branch (user site, repo root).

## The five projects
1. **ashaar.js** — Arabic/Urdu/Persian poetry formatting library (repo `ashaar-js`).
2. **ashaar.js for Word** — Word task-pane add-in (repo `ashaar.js-Office`).
3. **LigaCheh Keyboard** — multi-platform Lisān ud-Daʿwat keyboard (in `font-fatemi/keyboards`).
4. **FatemiMaqala** — font family (in `font-fatemi`).
5. **AlFatemi** — font family (in `font-fatemi`).

## Sitemap (flat files at repo root)
```
index.html            landing: hero + 5 project cards
ashaar-js.html
ashaar-word.html
keyboard.html         LigaCheh hub: platform tiles
  keyboard-ios.html        LigaCheh (iOS)
  keyboard-android.html    LSDKeyboard (Android)
  keyboard-windows.html    MSKLC layout
  keyboard-macos.html      Ukelele layout
  keyboard-macos-im.html   macOS Input Method
fatemimaqala.html
alfatemi.html
privacy.html          site-wide
contact.html          site-wide
styles.css            single shared stylesheet
assets/               fonts, screenshots, logos
```
Existing Keyman web files (`lsd.kmp`, `lsd-1.0.*`) and the Pastiera (Unihertz
Titan 2) layout link are preserved and surfaced from the keyboard hub as
additional platforms (a "More platforms" section: Keyman, Pastiera).

## Look & feel
- Light theme, one accent color, system font for body text.
- **FatemiMaqala** (bundled `.ttf`, `@font-face`) used for the wordmark and headings/Arabic accents.
- Landing: short hero + a row/grid of 5 project cards (title, one-line tagline, link).
- Keyboard hub: grid of platform tiles (iOS, Android, Windows, macOS, macOS IM, + Keyman/Pastiera).
- Every page: small header (home link + wordmark), H1 title, one-line tagline, short blurb,
  relevant visuals/links, footer with `Privacy · Contact`.
- Responsive (mobile-first), no JavaScript.

## Per-page content (brief)
- **ashaar-js / ashaar-word**: what it is, a feature list, link to GitHub (+ npm / AppSource where applicable).
- **keyboard-* pages**: what the platform offers, install steps, download/store link (or "Coming soon").
- **fatemimaqala / alfatemi**: a type specimen (a line set in the font) + direct `.ttf` download + a note on the FatemiMaqala configuration profile (links to the LigaCheh profile workflow).
- **privacy.html**: one statement — these projects collect, transmit, store-off-device, and share **nothing**; no analytics, no ads, no accounts. Covers all five projects (reuses the LigaCheh privacy wording, generalized).
- **contact.html**: email `akhurrum@exordiumnetworks.com` + GitHub profile/links. No form.

## Assumptions (correct if wrong)
- Contact email: `akhurrum@exordiumnetworks.com`.
- iOS and Android keyboard stores are "Coming soon" (not yet published).
- ashaar.js → GitHub (npm link only if the package is published).
- Word add-in → GitHub now, AppSource "Coming soon".
- Fonts → direct `.ttf` download from the repo.
- Default `abdealikhurrum.github.io` domain (no custom domain).

## Out of scope
- No build tooling, framework, or JavaScript app behavior.
- No contact form, analytics, cookies, or trackers (consistent with the privacy stance).
- No changes to the five source repos themselves (this is just the site).

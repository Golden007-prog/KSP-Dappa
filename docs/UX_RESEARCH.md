# UX research — accessibility, low-end UX, and plain-language statistics for DAPPA

*Round-2 research note, written 27 August 2026 against HEAD of this repository
and the sources listed at the end. Nothing here has been run against the
deployed app; "MEASURED" rows come from reading files and computing on the
built `client/dist`, "VERIFIED" facts were read on the linked page, and
"INFERRED" is judgment that a reviewer should be able to disagree with.*

Confidence key used throughout:

| Tag | Meaning |
|---|---|
| **VERIFIED** | Read on the linked page (or in the linked repo file) today. Quoted text is verbatim. |
| **MEASURED** | Computed from files in this repository (`client/src`, `client/dist`) with the command named. |
| **INFERRED** | My reading of the evidence; not itself on any page. |
| **INACCESSIBLE** | The page was fetched and failed (403/404/DNS/size); the claim is left open rather than guessed. |

---

## 1. Where DAPPA stands today (MEASURED, 27 Aug 2026)

Read before the checklist so the status column has a baseline.

**Built bundle (`client/dist/assets`, gzip measured with `gzip -c | wc -c`):**

| Chunk | Raw bytes | gzip bytes |
|---|---:|---:|
| `index-*.js` (React, router, both locales, shell) | 1,143,064 | 293,207 |
| `echarts-*.js` | 1,060,113 | 351,532 |
| `cytoscape-*.js` | 568,269 | 176,011 |
| `leaflet-*.js` | 154,699 | 44,935 |
| `Dashboard-*.js` | 148,555 | 40,834 |
| `GeoIntel-*.js` | 165,659 | 43,759 |
| `index-*.css` | 79,166 | 14,178 |
| **all `.js` chunks** | — | **1,233,548** (≈1.18 MiB) |
| Inter fonts, 56 files (woff + woff2) | 892,928 | — |
| Inter Latin woff2 only (4 weights) | 96,744 | — |

`Dashboard-*.js` imports `./echarts-*.js` statically (`grep -o 'from"./echarts' dist/assets/Dashboard-*.js`), so the first dashboard paint needs index + Dashboard + echarts + CSS ≈ **700 KB gzip of JS/CSS** before fonts (INFERRED from the import graph; not measured with a network trace). Locale sources are 329,767 B (`src/locales/en`) and 600,417 B (`src/locales/kn`) and both ship in the index chunk — the inactive language is roughly a third to a half of that chunk's raw size (INFERRED).

**Accessibility plumbing that already exists (VERIFIED in source):**

- Global `:focus-visible { outline: 2px solid rgb(var(--t-primary) / 0.85); outline-offset: 2px }` — `client/src/index.css:71`.
- Skip link `.skip-link` targeting `#main-content` — `client/src/components/Layout.jsx:848`, `index.css:146`.
- `aria-live="polite"` on the toast viewport, table pager, command palette, copilot; `role="status"` for copilot thinking state — `ToastProvider.jsx:112`, `DataTable.jsx:239`, `Copilot.jsx:562`.
- `prefers-reduced-motion: reduce` collapses all animation, plus a manual `html[data-motion='reduce']` toggle pre-painted from `localStorage` — `index.css:289`, `index.html`.
- `document.documentElement.lang = lang` on language switch, and `html[lang='kn'] body { line-height: 1.65 }` for Kannada matras — `lib/i18n.jsx:91`, `index.css:343`.
- Print: `@media print` forces white/ink, `@page { size: A4; margin: 12mm }`, un-clamps `#main-scroll`, and `PrintHeader.jsx` prints crest, view, filters, IST stamp and the synthetic-data notice — `index.css:317-329`, `routes/cases/explorer-print.css`.
- Offline: `OfflineBanner.jsx` watches `navigator.onLine` and probes `manifest.webmanifest` with `cache: 'no-store'`. There is **no service worker** anywhere under `client/` (`find client/public client/src -iname '*sw*.js' -o -iname '*service*worker*'` → nothing). The manifest exists with four shortcuts and an SVG-only icon.
- Fonts: Tailwind stack `Inter, Nirmala UI, Noto Sans Kannada, Kannada Sangam MN, Tunga, ui-sans-serif, system-ui, sans-serif` — `tailwind.config.js`; Inter is self-hosted via `@fontsource/inter`, no CDN.
- Charts: **no** `aria:` option and **no** `decal` anywhere in `client/src` (`grep -rn "aria:" src`, `grep -rn decal src` → empty). `ChartPanel.jsx` labels its expand/download/retry buttons but has no table-view alternative for a chart.
- Map: Leaflet city/station markers are created with `keyboard: false` — `routes/geointel/MapCanvas.jsx:688,715`.
- Status pills: `Badge.jsx` conveys tone with colour + text only (an optional `PulseDot`, no icon).
- Auto-motion: `IntelTicker.jsx` advances every 7 s, pauses on hover/focus, has manual ‹ › buttons; `pulse-glow` runs `2s … infinite` (`tailwind.config.js`).
- Tooltips: `.tt::after` is CSS-only, `pointer-events: none`, shown on `:hover`/`:focus-visible`/`:focus-within`; there is no Escape handler — `index.css:178-215`.
- 603 `<button>` tags in `client/src`, 17 carry `aria-label`; none use the tiny `h-5/h-6/w-5/w-6/p-0.5/p-1` sizing classes (the buttons are padding-sized, e.g. `.btn` is `px-3 py-1.5 text-sm` ≈ 32 px tall — INFERRED from the classes, not rendered).

**Contrast of the design tokens (MEASURED with the WCAG 2.x formula in `scratchpad/contrast.py` over the RGB triplets in `index.css:9-54`):**

| Pair | Dark theme | Light theme | Bar |
|---|---:|---:|---|
| ink on base / panel | 15.53 / 14.42 | 15.73 / 17.16 | 4.5:1 ✔ |
| muted on base / panel | 6.14 / 5.70 | 4.95 / 5.40 | 4.5:1 ✔ |
| primary on base | 6.88 | 4.74 | 4.5:1 ✔ |
| amber on base / panel | 9.24 / 8.58 | 4.51 / 4.92 | 4.5:1 ✔ (light amber on base is at the wire) |
| **signal (red) on panel** | **4.44** | 6.57 | 4.5:1 — dark theme **fails for body-size text** |
| teal on base | 10.06 | 5.02 | ✔ |
| primary-on on primary (button text) | 6.88 | 5.17 | ✔ |
| **grid (borders) on base / panel** | **1.31 / 1.22** | **1.18 / 1.29** | 3:1 non-text — **fails** when a border is the only boundary of a control |
| focus ring (primary @ .85) on base / panel | 5.27 / 4.95 | 3.70 / 3.98 | 3:1 ✔ |
| **eyebrow `text-muted/80` (10 px caps) on panel** | **4.14** | **3.54** | 4.5:1 — **fails** (10 px is not large text) |
| red badge text on `bg-signal/10` over panel | **4.07** | 5.58 | 4.5:1 — dark **fails** at 11 px |
| amber / teal badge text on their /10 tints | 7.25 / 7.68 | 4.32 / 4.75 | light amber badge **fails** by 0.18 |

These numbers are the strongest concrete finding of this note: the palette is close, but three text roles (eyebrow captions, red pills in dark, amber pills in light) and every border-only control boundary are under the WCAG bar.

---

## 2. WCAG 2.2 AA — the criteria that matter for a data dashboard

WCAG 2.2 is the current W3C Recommendation; the TR page carries a 12 December 2024 edition date and lists nine criteria new since 2.1 (2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8, 3.3.9) and marks 4.1.1 Parsing "obsolete and removed" ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), VERIFIED). Every quotation below is from the W3C "Understanding" page linked in the row.

### 2.1 Perceivable

**1.4.3 Contrast (Minimum) — AA.** "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1", large-scale text 3:1; large is "18 point text or 14 point bold" (≈24 px / ≈18.5 px bold). "This success criterion applies to text in the page, including placeholder text and text that is shown when a pointer is hovering over an object or when an object has keyboard focus." Inactive controls are exempt ([Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), VERIFIED). *DAPPA:* see the contrast table — eyebrow captions and two pill tones fail.

**1.4.11 Non-text Contrast — AA.** "The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s): User Interface Components [and] Graphical Objects." For line charts "the lines should have 3:1 contrast against their background"; pie slices must be distinguishable at their boundaries; if a border is the only indicator of an input it must meet 3:1; "color gradients that represent a measurement, such as heat maps" are an essential exception ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), VERIFIED). *DAPPA:* `--t-grid` borders are 1.2–1.3:1 against their surfaces, and `.input-dark` is identified only by that border → likely fail; the heat layer and choropleth ramps are covered by the heat-map exception, but the *boundaries* between choropleth classes and the legend swatches are not.

**1.4.1 Use of Color — A.** "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element." The Understanding doc's own example pairs colours with numbers, and it notes that where a user "must accurately perceive a specific color (like distinguishing green for valid from red for invalid), an additional visual indicator will be required regardless of the contrast ratio" ([Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), VERIFIED). Sufficient technique G111 "Using color and pattern" gives the bar-chart-with-patterns and transport-map-with-icon-shapes examples ([G111](https://www.w3.org/WAI/WCAG22/Techniques/general/G111), VERIFIED). *DAPPA:* status pills and chart series are colour + text; the pulsing red "red-zone" badges are colour + motion; series in multi-line charts are colour-only. See §11.

**1.4.10 Reflow — AA.** "Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions for: Vertical scrolling content at a width equivalent to 320 CSS pixels; Horizontal scrolling content at a height equivalent to 256 CSS pixels." Excepted: "images required for understanding (such as maps and diagrams), video, games, presentations, data tables (not individual cells), and interfaces where it is necessary to keep toolbars in view while manipulating content" ([Understanding 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), VERIFIED). *DAPPA:* map, network canvas and data tables are legitimately 2-D; everything else (KPI tiles, filter bar, copilot, alert cards) must reflow at 320 px — UNVERIFIED without a 320 px run.

**1.4.4 Resize Text — AA** ("up to 200 percent without loss of content or functionality") and **1.4.12 Text Spacing — AA** (line-height 1.5×, paragraph spacing 2×, letter 0.12×, word 0.16× with no loss) ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), VERIFIED). *DAPPA:* Kannada already gets 1.65 line-height; the risk is fixed-height chips and `whitespace-nowrap` pills (`Badge.jsx`) clipping at 200 %.

**1.4.13 Content on Hover or Focus — AA.** Additional content shown on hover/focus must be **Dismissible** ("without moving pointer hover or keyboard focus, unless the additional content … does not obscure or replace other content"), **Hoverable** ("the pointer can be moved over the additional content without the additional content disappearing") and **Persistent** ([Understanding 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), VERIFIED). *DAPPA:* `.tt` tooltips have no Escape dismissal and are `pointer-events: none` positioned outside the trigger, so moving onto them hides them → likely fail on both Dismissible and Hoverable (INFERRED from `index.css:178-215`; confirm in a browser).

**1.1.1 Non-text Content — A.** For charts the Understanding doc wants a short label plus a long alternative: "The longer description identifies the type of chart, provides a high-level summary of the data, trends and implications comparable to those available from the chart. Where possible and practical, the actual data is provided in a table." ([Understanding 1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html), VERIFIED). *DAPPA:* no chart has a data-table alternative; ECharts can generate the description itself (§11).

**1.3.1 Info and Relationships — A.** "Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text." ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), VERIFIED). axe rules `td-headers-attr` and `th-has-data-cells` map to it ([axe rule descriptions](https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/rule-descriptions.md), VERIFIED).

### 2.2 Operable

**2.1.1 Keyboard — A.** "All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes, except where the underlying function requires input that depends on the path of the user's movement and not just the endpoints." The doc says drag-and-drop "should also support 'cut' and 'paste' or form controls as alternatives" and does not exempt maps ([Understanding 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), VERIFIED). Leaflet's map option `keyboard` ("Makes the map focusable and allows users to navigate the map with keyboard arrows and +/- keys", default `true`, `keyboardPanDelta` default 80) and marker option `keyboard` ("Whether the marker can be tabbed to with a keyboard and clicked by pressing enter", default `true`) exist ([Leaflet reference](https://leafletjs.com/reference.html), VERIFIED). *DAPPA:* `MapCanvas.jsx` sets `keyboard: false` on city/station markers, and the Cytoscape canvas has no keyboard model at all; the network route's `GroupMatrix`/`LocationPanels`/`VictimPanels` tables are the natural keyboard-reachable equivalent and should be declared as such.

**2.1.1 companion — Leaflet's own guidance:** "When using markers, it is vital to ensure each has a unique and descriptive `alt` or `title`"; "The map container and markers are keyboard operable by default"; test "using only a keyboard, as well as using a screen reader" ([Leaflet accessibility](https://leafletjs.com/examples/accessibility/), VERIFIED). *DAPPA:* `LocateSearch.jsx` sets `alt: u.name` on its marker but the bulk station markers get the default `'Marker'`.

**2.2.2 Pause, Stop, Hide — A.** "For any moving, blinking or scrolling information that (1) starts automatically, (2) lasts more than five seconds, and (3) is presented in parallel with other content, there is a mechanism for the user to pause, stop, or hide it"; the same for auto-updating information, "or to control the frequency of the update" ([Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), VERIFIED). *DAPPA:* the ticker pauses on hover/focus and has ‹ › — a touch user has neither hover nor focus, so an explicit pause button is the safe reading (INFERRED). The infinite `pulse-glow` badges and `gi-halo` are stopped by the motion toggle in the top bar, which counts as "a mechanism" if it is discoverable (INFERRED).

**2.3.1 Three Flashes — A.** "Web pages do not contain anything that flashes more than three times in any one second period" ([Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), VERIFIED). *DAPPA:* `pulse-glow` is a 2 s cycle (0.5 Hz) — passes.

**2.3.3 Animation from Interactions — AAA.** "Motion animation triggered by interaction can be disabled, unless the animation is essential"; changes of colour/opacity alone are not motion animation; technique C39 is "the CSS prefers-reduced-motion query" ([Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), VERIFIED). *DAPPA:* already met by `index.css:289` plus the manual toggle — one of the few AAA items DAPPA can claim.

**2.4.1 Bypass Blocks — A.** "A mechanism is available to bypass blocks of content that are repeated on multiple web pages"; G1 skip link, ARIA11 landmarks ([Understanding 2.4.1](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html), VERIFIED). *DAPPA:* skip link exists.

**2.4.3 Focus Order — A.** "focusable components receive focus in an order that preserves meaning and operability" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), VERIFIED).

**2.4.7 Focus Visible — AA.** "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible." ([Understanding 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), VERIFIED). *DAPPA:* global 2 px ring; but `.input-dark` replaces it with `focus:ring-1 … ring-primary/60` — a 1 px ring at 60 % alpha needs a contrast check (INFERRED).

**2.4.11 Focus Not Obscured (Minimum) — AA, new.** "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." Sticky headers/footers and non-modal panels are the named risks; the doc recommends CSS `scroll-padding` ([Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), VERIFIED). **2.4.12 (Enhanced) — AAA:** "no part of the component is hidden" ([Understanding 2.4.12](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html), VERIFIED). *DAPPA:* sticky top bar, the offline banner, the toast viewport and the mobile bottom sheet all sit over content — add `scroll-padding-top/bottom` on `#main-scroll`.

**2.4.13 Focus Appearance — AAA, new.** Indicator area "at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component" and "a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states" ([Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), VERIFIED). *DAPPA:* the 2 px ring meets the size rule; the change-of-contrast (ring vs. what was there) is 3.7–5.3:1 per the measured table — plausibly meets AAA except where components override it.

**2.5.5 Target Size (Enhanced) — AAA.** "The size of the target for pointer inputs is at least 44 by 44 CSS pixels" with Equivalent, Inline, User-agent and Essential exceptions ([Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), VERIFIED).

**2.5.8 Target Size (Minimum) — AA, new.** "The size of the target for pointer inputs is at least 24 by 24 CSS pixels" except Spacing ("if a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not intersect another target"), Equivalent, Inline, User agent control, Essential — and the doc names "an interactive data visualization where targets are necessarily dense" as an Essential example ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), VERIFIED). Android's platform bar is higher: "each interactive UI element have a focusable area, or touch target size, of at least 48dpx48dp. Larger is even better." ([Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps), VERIFIED). *DAPPA:* `.btn` at ~32 px passes AA; the 11 px pills, table sort headers, calendar cells and legend swatches need the spacing test. Map points and network nodes fall under Essential *only if* a non-dense equivalent (table/list) exists — the same fix as 2.1.1.

**2.5.7 Dragging Movements — AA, new.** "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging, unless dragging is essential or the functionality is determined by the user agent"; user-agent scrolling is out of scope, but author-implemented panning needs "up/down/left/right buttons to move the view", and sliders should accept a tap on the track or a text input ([Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), VERIFIED). *DAPPA:* Leaflet/Cytoscape panning and any range slider (forecast horizon, hour bands) need tap/typed alternatives — UNVERIFIED which sliders exist.

### 2.3 Understandable

**3.1.1 Language of Page — A** (`html lang`, axe `html-has-lang`/`html-lang-valid`) and **3.1.2 Language of Parts — AA**: "The human language of each passage or phrase in the content can be programmatically determined except for proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the vernacular"; technique H58 is a `lang` attribute on the span ([Understanding 3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html), VERIFIED). *DAPPA:* `html lang` switches correctly; Latin tokens inside Kannada strings ("z-score ಗೇಜ್", "MAPE") are technical terms and exempt; full English sentences left untranslated in Kannada mode would not be — the `check_i18n.mjs` parity gate covers keys, not language.

**3.2.6 Consistent Help — A, new.** Help mechanisms (human contact details, contact mechanism, self-help option, automated contact) "occur in the same order relative to other page content" across the set of pages ([Understanding 3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html), VERIFIED). GIGW independently wants "a readily available Help section linked from all pages" (§3). *DAPPA:* the `?` shortcut and About page exist; a persistent Help entry in the same slot of the shell satisfies both.

**3.3.7 Redundant Entry — A, new** and **3.3.8 Accessible Authentication — AA, new** are listed by the TR page ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), VERIFIED); they bite only on forms (alert acknowledgement notes, admin token entry) and are low-risk for DAPPA (INFERRED).

### 2.4 Robust

**4.1.2 Name, Role, Value — A.** "For all user interface components (including but not limited to: form elements, links and components generated by scripts), the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set" — custom widgets need ARIA4/ARIA5/ARIA16 ([Understanding 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html), VERIFIED). *DAPPA:* 17 of 603 buttons carry `aria-label`; the rest must have visible text (most do). Icon-only ones are the audit target.

**4.1.3 Status Messages — AA.** "In content implemented using markup languages, status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus." Examples include "5 results returned" and "application busy"; techniques ARIA22 (`role=status`), ARIA19 (`role=alert`), ARIA23 (`role=log`) ([Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), VERIFIED). *DAPPA:* toasts, pager, copilot are wired; result counts after a filter change and the "N alerts" badge are the places to check.

### 2.5 Automated coverage (axe-core)

The axe rule set that Lighthouse's Accessibility category runs maps as follows (rule id → tags): `color-contrast` → wcag2aa/wcag143; `target-size` → wcag22aa/wcag258 **but disabled by default**; `html-has-lang`, `html-lang-valid` → wcag311; `valid-lang` → wcag312; `button-name`, `link-name`, `label` → wcag412; `image-alt` → wcag111; `scrollable-region-focusable` → wcag211; `meta-viewport` → wcag144; `td-headers-attr`, `th-has-data-cells` → wcag131; `region`, `landmark-one-main`, `page-has-heading-one`, `aria-allowed-role`, `scope-attr-valid` are best-practice only ([axe rule descriptions](https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/rule-descriptions.md), VERIFIED). Two consequences: run axe with `target-size` enabled explicitly, and treat contrast-on-canvas (ECharts, Leaflet tiles, Cytoscape) as a manual check — axe cannot see inside a canvas (INFERRED).

---

## 3. GIGW 3.0 — what the Indian government guideline actually requires

**What it is.** GIGW is formulated by NIC "jointly with the Standardisation Testing and Quality Certification (STQC) Directorate and Indian Computer Emergency Response Team (CERT-In)"; it covers "websites, web portals, web applications and mobile apps"; STQC issues the Certified Quality Website (CQW) certificate, and "Government organisations are expected to carefully assess their existing websites … against GIGW 3.0" and obtain certification ([GIGW Introduction](https://guidelines.india.gov.in/introduction/), VERIFIED). The STQC/NIC roadmap deck adds that GIGW was "Adopted by DARPG and made a part of CSMOP", that version 1 used the MUST/SHOULD/MAY (Mandatory/Advisory/Voluntary) scheme, that in version 2 (2019) "Responsive UI (Mobile compliance) was made mandatory" and accessibility was "upgraded to meet all the points of WCAG 2.0 Level AA", and that 3.0 is "a risk based guidelines" ([GIGW 3.0 New Features and Roadmap deck, pp. 2–4, 12](https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2023/04/2023041074.pdf), VERIFIED by extracting the PDF text). *The full GIGW 3.0 PDF exceeded the 10 MB fetch limit and the old `web.guidelines.gov.in` host no longer resolves — INACCESSIBLE; everything below comes from the live site pages and the deck.*

**Structure.** Four focus areas with guideline counts: Quality 25, Accessibility 50 "(as per RPWD Act)", Security 3, Life Cycle Management 10; each guideline has Statement, Benefit, Government department action, Developer action, Evaluator action ([deck pp. 6–7](https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2023/04/2023041074.pdf), VERIFIED; the conformity matrix page confirms 50 accessibility rows, [Annexure II](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/), VERIFIED).

**Accessibility level.** "The current version ensures conformity with Level AA of WCAG 2.1. In all 17 new success criteria have been added to the new version." ([New features of GIGW 3.0](https://guidelines.india.gov.in/new-features-of-gigw-3-0/), VERIFIED); the deck adds "Focused on improving touch gesture accessibility" (p. 8). So GIGW pins **WCAG 2.1 AA**; building to 2.2 AA (§2) is a strict superset and the right target.

**Bilingual.** Conformity-matrix Row 10 (Lifecycle): "Website is bilingual with a prominent language selection link and uses Unicode characters." ([Annexure II](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/), VERIFIED). The companion guideline "Bilingual Content is in sync with the English Content" requires that "Documents/pages in multiple languages must be updated simultaneously" and that developers "display the status of non-translated content" — the page body did not render for the fetcher; the wording is from the search index of [that page](https://guidelines.india.gov.in/website-aspect/bilingual-content-is-in-sync-with-the-english-content/) (partially VERIFIED). Quality Row 13: "Hindi/Regional language fonts have been tested on popular browsers for any inconsistency (loss of layout)." ([Annexure II](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/), VERIFIED). *DAPPA:* en/kn parity gate (`check_i18n.mjs`, en=5286 / kn=5369 keys per `ROUND2_BASELINE.md`) and Unicode Kannada satisfy the letter; the "language selection link" is in the top bar; what is missing is a *documented* font test on Windows/Android/iOS browsers (§8).

**Mobile.** Quality Row 15: "Website uses Cascading Style Sheets (CSS) to control layouts/styles and incorporates responsive design features to ensure that the interface displays well on different screen sizes." Accessibility guideline 17 repeats the 320 CSS px reflow rule ([Guidelines](https://guidelines.india.gov.in/guidelines/), VERIFIED).

**Help and search.** Quality Row 14: "Website has a readily available Help section linked from all pages of the website."; accessibility guideline 31 wants a "Search" box or link on every page ([Guidelines](https://guidelines.india.gov.in/guidelines/), VERIFIED). *DAPPA:* the command palette (`/`) is search; a Help link in the shell is the gap.

**Performance.** GIGW 3.0 has **no numeric page-load or page-size guideline** in the matrix; its speed guidance is an advisory article that recommends minimising HTTP requests, compressing images, "Setting caching headers in the server's response", CDNs, and names Google PageSpeed Insights, Lighthouse, GTmetrix and WebPageTest as the tools, defining FCP, LCP, TTFB and FID without thresholds ([Techniques and Tools for Website Speed Optimization](https://guidelines.india.gov.in/activity/techniques-and-tools-for-website-speed-optimization/), VERIFIED). Budgets therefore have to come from Lighthouse/CWV and the performance-inequality work (§5–6), not from GIGW.

**Plain language.** GIGW's content article: "Avoid using jargon and technical terms that your audience may not understand."; "Breaking up content into shorter sentences and paragraphs makes it easier for users to scan."; "Active voice is more direct and easier to understand than passive voice."; "Include a list of abbreviations or a glossary to assist users in understanding specialized terms." ([Crafting Clear and Concise Content](https://guidelines.india.gov.in/activity/crafting-clear-and-concise-content-writing-strategies-for-government-websites/), VERIFIED). Quality Row 25 requires content "free from spelling and grammatical errors" ([Guidelines](https://guidelines.india.gov.in/guidelines/), VERIFIED).

**Security (for completeness).** GIGW 3.0's three security rows: security audit clearance "by NIC, STQC or a CERT-In empaneled vendor before hosting in production", a hardened hosting environment (CIA), and published Security/Privacy/Contingency policies ([deck p. 17](https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2023/04/2023041074.pdf), VERIFIED). A datathon prototype cannot be CQW-certified; DAPPA can only claim "built to GIGW 3.0 quality/accessibility rows", not compliance (INFERRED).

---

## 4. Who the low-end user is (device and network baseline)

- **Rural coverage:** "More than 95 percent villages in India today have internet access with 3G or 4G mobile connectivity" — ~613,000 of ~644,000 villages, Ministry of Communications, data as of April 2024 ([News on AIR, 2 Aug 2024](https://www.newsonair.gov.in/more-than-95-percent-villages-in-india-have-internet-access-with-3g-or-4g-mobile-connectivity), VERIFIED). Ookla's 1H2025 rural analysis reports a usable 4G signal (>−110 dBm) in 88.9 % of villages and 5G detected in 77.8 % — the article page returned 403; figure is from the search index of [Communications Today](https://www.communicationstoday.co.in/mobile-connectivity-in-rural-india-ookla/) (INACCESSIBLE page, snippet only). Coverage is therefore not the constraint; *throughput under load and device CPU* are (INFERRED).
- **P75 network:** the 2024 global 75th-percentile mobile connection is "7.2Mbps down, 1.4Mbps up, and 94ms RTT" ([Performance Inequality Gap 2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/), VERIFIED); the 2026 update uses "9 Mbps downlink / 3 mbps uplink / 100 millisecond RTT" and its country table puts India's P75 download at 6.2 Mbps ([Performance Inequality Gap 2026](https://infrequently.org/2025/11/performance-inequality-gap-2026/), VERIFIED).
- **P75 device:** Samsung Galaxy A51 in the 2024 analysis ("eight slow cores (4x2.3 GHz Cortex-A73 and 4x1.7 GHz Cortex-A53) on a 10nm process"); Samsung Galaxy A24 4G in the 2026 one ([2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/), [2026](https://infrequently.org/2025/11/performance-inequality-gap-2026/), VERIFIED). IDC's 1H25 India release puts the sub-US$100 segment at 16 % share and US$100–200 at 42 % — page returned 403; figures from the search index of [IDC prAP53737525](https://my.idc.com/getdoc.jsp?containerId=prAP53737525) (INACCESSIBLE page, snippet only). A station-issued Android is more likely to be a 2–4-year-old A-series than a current one (INFERRED).
- **Lighthouse's "mobile":** default throttling is "150ms" latency, "1.6Mbps down", "750 Kbps up", no packet loss, "a constant 4x CPU multiplier", representing "roughly the bottom 25% of 4G connections and top 25% of 3G connections" ([Lighthouse throttling.md](https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/docs/throttling.md), VERIFIED). That is a fair proxy for "3G in a rural station" and is what every number in §6 is stated against.
- **Core Web Vitals "good":** LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, judged at "the 75th percentile of page loads, segmented across mobile and desktop"; INP replaced FID and "became a stable Core Web Vital metric in 2024" ([web.dev/vitals](https://web.dev/articles/vitals), VERIFIED).
- **Lighthouse score:** Lighthouse 10 weights FCP 10 %, SI 10 %, LCP 25 %, TBT 30 %, CLS 25 %; bands "0 to 49 (red): Poor; 50 to 89 (orange): Needs Improvement; 90 to 100 (green): Good" ([Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring), VERIFIED). TBT's 30 % weight is why the 4× CPU throttle punishes a 1 MB+ JS chunk harder than the network does (INFERRED).

---

## 5. Bundle and performance budget (deliverable)

**External reference budgets** (compressed transfer, JS-heavy site, P75 device+network):

| Target | 2024 total / JS | 2026 total / JS |
|---|---|---|
| Load in 5 s | 1.3 MiB / 650 KiB | 2.3 MiB / 1.15 MiB |
| Load in 3 s | 730 KiB / 365 KiB | 1.2 MiB / 0.62 MiB |

([2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/), [2026](https://infrequently.org/2025/11/performance-inequality-gap-2026/), VERIFIED.) Rural-Karnataka reality sits between the two years' assumptions, so the honest bar is the **2024 5-second budget (650 KiB JS, 1.3 MiB total)** with the **2026 3-second budget (620 KiB JS, 1.2 MiB total)** as the stretch — they nearly coincide (INFERRED).

**Where DAPPA is:** ≈685 KB gzip of JS on the first dashboard paint (index 293 + Dashboard 41 + echarts 352) plus 14 KB CSS plus ~97 KB of Latin Inter woff2 ≈ **800 KB** — about 25 % over the 5-second JS line and 1.9× the 3-second line (MEASURED chunks, INFERRED composition). The whole app is 1.18 MiB gzip of JS, but route chunking means `/network` (+176 KB cytoscape) and `/map` (+45 KB leaflet + 44 KB GeoIntel) are paid only on entry.

**Proposed budget (Lighthouse `budget.json`, transfer sizes in KB, run with `lighthouse <url> --budget-path=./budget.json`; results appear in the report's Performance → Budgets section)** — format per [web.dev Lighthouse budgets](https://web.dev/articles/use-lighthouse-for-performance-budgets) (VERIFIED):

```json
[
  {
    "path": "/*",
    "timings": [
      { "metric": "interactive", "budget": 5000 },
      { "metric": "largest-contentful-paint", "budget": 2500 },
      { "metric": "total-blocking-time", "budget": 600 },
      { "metric": "cumulative-layout-shift", "budget": 0.1 }
    ],
    "resourceSizes": [
      { "resourceType": "script", "budget": 650 },
      { "resourceType": "stylesheet", "budget": 30 },
      { "resourceType": "font", "budget": 120 },
      { "resourceType": "document", "budget": 20 },
      { "resourceType": "image", "budget": 150 },
      { "resourceType": "total", "budget": 1300 }
    ],
    "resourceCounts": [
      { "resourceType": "third-party", "budget": 0 },
      { "resourceType": "script", "budget": 8 },
      { "resourceType": "font", "budget": 4 }
    ]
  }
]
```

`third-party: 0` is not a performance number; it is the Catalyst-only rule made testable (INFERRED). The `timings` names (`interactive`, `largest-contentful-paint`, `total-blocking-time`, `cumulative-layout-shift`) follow the Lighthouse audit ids; verify against your installed Lighthouse before relying on the last three, since the web.dev example only shows `interactive` and `first-meaningful-paint` (partially VERIFIED).

**Levers, largest first (all INFERRED from the measured chunk graph; none run):**

1. **Split the locales.** en (330 KB source) and kn (600 KB source) both ride in the index chunk. Loading only the active language via `import()` per namespace is the single biggest cut available without touching a chart library.
2. **Defer ECharts until a chart is on screen.** `Dashboard-*.js` imports it statically; wrapping `ChartPanel` in `React.lazy` + an `IntersectionObserver` gate moves 352 KB out of the critical path so KPI tiles and the map paint first. Also import ECharts by component (`echarts/core` + only the chart types used) rather than the full bundle — the 1.06 MB raw size suggests the full build.
3. **Keep cytoscape and leaflet route-only** (already done by `manualChunks`; guard against a shared component importing them into index).
4. **Fonts:** the `@fontsource/inter` package emits 56 files; only the 4 Latin woff2 (97 KB) are needed for English UI and Kannada uses system fonts. Drop the cyrillic/greek/vietnamese subsets and the `.woff` fallbacks from the build (unicode-range already keeps browsers from fetching them, so this is disk/cache hygiene more than transfer — INFERRED).
5. **Data:** `GET /meta/lookups` is cached 1 h client-side and `/geo/districts` polygons are 23 KB; the API's 300-row pages and `perPage ≤ 200` are fine on 1.6 Mbps. The Cache segment on the server already makes repeat calls cheap; the client-side gap is *persistence across reloads* (§7).
6. **INP:** on a 4× CPU throttle, ECharts re-renders on every filter keystroke will blow 200 ms; debounce filter inputs and use `notMerge:false` incremental `setOption` (INFERRED; measure with the DevTools performance panel under CPU throttling).

**Measurement protocol (so the numbers in `docs/benchmarks/` are re-derivable):** Lighthouse CLI, mobile preset, default simulated throttling, three runs, report the median; then one DevTools-throttled run (the doc notes DevTools throttling "actually interrupts execution of CPU work at periodic intervals" while simulated throttling "uses a simulation of a page load" — [throttling.md](https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/docs/throttling.md), VERIFIED). `docs/04_SUBMISSION_KIT.md` cites "Lighthouse ≥ 85" benchmarks that `ROUND2_BASELINE.md` §5 says do not exist in `docs/benchmarks/` — this protocol is how to make that claim true or delete it.

---

## 6. PWA and offline plan (deliverable)

**Why it is the right shape for a station.** A police station on a flaky link needs the *last known* dashboard, alerts and the officer's open cases to open instantly and to say how old they are. Catalyst-only means no push relay or sync service outside Catalyst — a service worker in the browser calls nothing external and is therefore in bounds (CLAUDE.md: "browser-side libraries that call nothing are fine").

**Mechanics that constrain the design (all VERIFIED):**

- Service workers require a secure context, and "The default scope for a service worker registration is the directory where the service worker script is located"; a broader scope needs the `Service-Worker-Allowed` header ([MDN register()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)). DAPPA is served from `/app/` on Catalyst web-client hosting with `base: './'` (`vite.config.js`), so the worker must be emitted at `/app/sw.js` and will control `/app/*` — which is exactly the SPA (INFERRED). The API lives on the same origin under `/server/dappa_api/api/v1` (`lib/api.js:8`) — *outside* the worker's scope as a page, but `fetch` calls made *from* `/app/*` pages are intercepted regardless of the URL path, so runtime caching of API GETs works without touching the API (INFERRED from the scope rule: scope limits which *clients* are controlled, not which requests).
- Strategy vocabulary — Workbox names `CacheFirst`, `CacheOnly`, `NetworkFirst`, `NetworkOnly`, `StaleWhileRevalidate` ([workbox-strategies reference](https://developer.chrome.com/docs/workbox/reference/workbox-strategies/)); the overview recommends cache-first for hashed static assets, network-first for "HTML or API requests requiring up-to-date content when online but needing offline fallback", and stale-while-revalidate for "resources that benefit from quick access but don't require absolute currency" ([caching strategies overview](https://developer.chrome.com/docs/workbox/caching-strategies-overview)). `NetworkFirst`'s `networkTimeoutSeconds`: "If set, any network requests that fail to respond within the timeout will fallback to the cache." — the source calls out "lie-fi" and the default is 0 (no timeout) ([NetworkFirst.ts](https://raw.githubusercontent.com/GoogleChrome/workbox/v7/packages/workbox-strategies/src/NetworkFirst.ts)).
- The Offline Cookbook's pattern list and "ideal for" notes: "Cache, falling back to network — Ideal for: building offline-first"; "Network falling back to cache — Ideal for: a quick-fix for resources that update frequently"; "Cache then network — Ideal for: content that updates frequently. E.g. articles, social media timelines"; "Generic fallback — Ideal for: … an 'Unavailable while offline' page"; plus "On install — as a dependency" for critical assets and "On activate" for cache cleanup ([web.dev Offline Cookbook](https://web.dev/articles/offline-cookbook)).
- Tooling: `vite-plugin-pwa` generates the manifest, a Workbox service worker (`strategies: 'generateSW'` or `'injectManifest'`) and the registration script; `registerType: 'autoUpdate'` or `'prompt'`; runtime caching is declared as `workbox.runtimeCaching: [{ urlPattern, handler: 'NetworkFirst' | 'CacheFirst' | 'StaleWhileRevalidate', options: { cacheName, expiration: { maxEntries, maxAgeSeconds }, cacheableResponse: { statuses: [0, 200] } } }]` with `globPatterns`, `navigateFallback`, `maximumFileSizeToCacheInBytes` alongside ([vite-pwa guide](https://vite-pwa-org.netlify.app/guide/), [generateSW](https://vite-pwa-org.netlify.app/workbox/generate-sw.html)). It is a build-time devDependency that ships no runtime call to any host (INFERRED from what it generates).

**Route-by-route plan (INFERRED; the strategies and option names are the verified ones above):**

| Resource | Strategy | Options | Why |
|---|---:|---|---|
| App shell: `index.html`, hashed `assets/*.js|css`, Latin woff2, `favicon.svg`, `manifest.webmanifest` | precache (install as dependency) + `CacheFirst` | `globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}']`; raise `maximumFileSizeToCacheInBytes` above the 1.06 MB echarts chunk or the precache silently skips it; `navigateFallback: 'index.html'` for the hash router | Hashed names never go stale; the shell must open with zero network. |
| `GET /meta/lookups`, `/geo/districts` (polygons), `/meta/services` | `StaleWhileRevalidate` | `cacheName: 'dappa-ref'`, `expiration: { maxEntries: 20, maxAgeSeconds: 7 days }` | Reference data; instant paint, silent refresh. |
| `GET /summary/kpis`, `/trends/*`, `/geo/stations`, `/geo/hotspots`, `/alerts`, `/forecast`, `/risk/stations`, `/network/graph` | `NetworkFirst` | `networkTimeoutSeconds: 4` (matches `AI_TIMEOUT_MS` 4000 on the server), `cacheName: 'dappa-intel'`, `expiration: { maxEntries: 200, maxAgeSeconds: 24 h }`, `cacheableResponse: { statuses: [0, 200] }` | Officers want the latest; on lie-fi they get yesterday's precomputed intel within 4 s instead of a spinner. Precomputed nightly tables make a 24 h TTL honest. |
| `GET /cases?…`, `/cases/:id`, `/offenders/:personKey` | `NetworkFirst` | `networkTimeoutSeconds: 4`, `maxEntries: 100` | The officer's recently opened cases stay readable offline; unvisited ones are not promised. |
| `POST /copilot/query`, `/predict/*`, `/ai/*`, `/reports/*`, `/alerts/:id/ack` | `NetworkOnly` | — | No offline equivalent; do not fake AI or acknowledgements. Queue-and-replay for `ack` is possible with Workbox Background Sync but adds a claim you would have to demo — leave it out unless it is exercised (INFERRED). |
| Map tiles | `NetworkOnly` (nothing to cache: DAPPA draws the district GeoJSON itself and the choropleth needs no tile server) | — | Confirm there is no tile URL before claiming "map works offline"; `leaflet.heat` and the choropleth are data-driven, so they do (INFERRED from `districtGeoMap.js` + `data/geo`). |

**UI contract for offline (INFERRED, but every element maps to a criterion above):**

1. Every cached intel view shows a "Data as of <IST timestamp> · offline" pill sourced from the cached response's `Date` header or the API `meta` — it satisfies 4.1.3 as a `role="status"` region and the OSR "say when the estimate was made" spirit.
2. `OfflineBanner` already exists; extend it with "Showing saved copy from 14:05" rather than only "offline".
3. `registerType: 'prompt'` with a toast "New version available — reload" is safer for a demo than `autoUpdate` (a silent reload mid-demo is worse than a stale build).
4. `start_url` and `scope` in the manifest already use `./`; add a 192/512 PNG icon alongside the SVG — the manifest currently has only `favicon.svg` (`sizes: "any"`), and PNG `maskable` icons are what Android's install prompt expects (INFERRED; not verified against a spec page today).
5. React Query already holds `staleTime: 60 s` default and `Infinity` for lookups (`main.jsx:19`, `api.js:424,477`); the service-worker cache is what survives a reload, so the two layers are complementary rather than redundant.

**What not to claim.** "Works offline" is defensible only for the shell + reference data + last-fetched intel. Say exactly that in the About page and the demo script.

---

## 7. Fonts for Kannada

- Android's system font table declares `<family lang="und-Knda" variant="elegant">` with `NotoSansKannada-VF.ttf` (weights 400–700) and a compact variant, plus `NotoSerifKannada-VF.ttf` ([AOSP fonts.xml](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/data/fonts/fonts.xml), VERIFIED). Windows ships Nirmala UI "first released with Windows 8 as a UI font" covering "Bengali–Assamese, Devanagari, Kannada, Gujarati, …" ([Wikipedia: Nirmala UI](https://en.wikipedia.org/wiki/Nirmala_UI), VERIFIED). Apple's "Kannada Sangam MN" is asserted in `tailwind.config.js` and `About` copy but I did not find a primary Apple page today — INFERRED/unverified.
- DAPPA's stack therefore renders Kannada from system fonts on every station device without a network request, which is the right call for 3G (VERIFIED in `tailwind.config.js`; the reasoning is INFERRED). The residual risks: (a) OEM Android builds that strip Indic fonts — rare on Samsung/Xiaomi India SKUs but not impossible (INFERRED, no source); (b) Windows 7 station PCs, which predate Nirmala UI and fall back to Tunga (VERIFIED that Nirmala UI is Windows 8+; Tunga presence on Windows 7 not verified today).
- If a bundled fallback is wanted, `@fontsource/noto-sans-kannada` 5.3.0 is OFL-1.1 and self-hosted like Inter — the whole package is 1,022,213 bytes unpacked, so cherry-pick one or two weights' woff2 and load them only under `html[lang='kn']` with `font-display: swap` ([npm registry](https://registry.npmjs.org/@fontsource/noto-sans-kannada/latest), VERIFIED size/license; per-file woff2 sizes not verified).
- GIGW Row 13 asks for the browser font test to have been *done*; a one-page screenshot set (Windows 10/11 Edge, Android Chrome on a Galaxy A-series, iOS Safari) in `docs/screenshots/` is the checkable evidence (INFERRED reading of the row).
- Typography detail already handled: Kannada line-height 1.65, tabular Latin digits kept for numbers in both locales (`index.css:343-355`, `lib/format.js` — VERIFIED). Keep digits Latin: NCRB and KSP returns use Latin digits with Indian grouping (INFERRED from the `format.js` comment; not independently sourced).

---

## 8. Touch targets and one-handed use

- WCAG bars: 24 × 24 CSS px at AA with the spacing exception; 44 × 44 at AAA (§2). Android: "at least 48dpx48dp. Larger is even better." ([Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps), VERIFIED). Apple's HIG page did not render for the fetcher — its 44 pt figure is INACCESSIBLE today, so cite WCAG 2.5.5 for 44 instead.
- Grip research: "49% of people hold their smartphones with one hand, relying on thumbs to do the heavy lifting" and "75% of interactions are thumb-driven", from Steven Hoober's observation study as reported by [Smashing Magazine](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/) (VERIFIED on Smashing; Hoober's original A List Apart article returned 403 — INACCESSIBLE). The design rule that follows: "keep frequently used links in the easy-to-reach zone and to keep infrequently used links in the hard-to-reach zone" (same page, VERIFIED).
- Applied to DAPPA (INFERRED): the mobile bottom sheet and bottom nav are correct; the filter bar, language toggle and "Ack" on alert cards should be reachable from the bottom third; the map's layer toggles should not live only in the top-right Leaflet control stack. Target audit: `.btn` (~32 px) passes AA; check the 11 px pills when they are tappable (alert chips), the DataTable sort headers, the calendar day cells and the legend swatches with the 24 px-circle spacing test; treat map points and network nodes as "Essential" *only* because an equivalent list exists (2.5.8 exception text quoted in §2).
- One-handed also means one-thumb *typing*: the copilot and the case search should accept short forms and not require exact spellings — the `LocateSearch.jsx` Latin-spelling fallback for Kannada labels is the pattern to reuse (VERIFIED that the fallback exists; extension is INFERRED).

---

## 9. Print for black-and-white station printers

- Browsers default to `print-color-adjust: economy`, under which "a browser might opt to leave out all background images and adjust text colors to ensure contrast is optimized for reading on white paper"; `exact` says the content was "specifically and carefully crafted"; `-webkit-print-color-adjust` is the prefixed form ([MDN print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust), VERIFIED). Design for **economy** (no background reliance) and only set `exact` on elements whose fill *is* the data (choropleth, heat cells) — and even then assume the printer is mono (INFERRED).
- `@media print`, `@page` for size/margins, and hiding chrome with `display: none !important` are the MDN-documented tools; `beforeprint`/`afterprint` events let you swap a chart to a print-safe series before the dialog renders ([MDN Printing](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing), VERIFIED).
- What a mono printer destroys, and the fix (INFERRED, each grounded in G111/1.4.1): colour-only series → ECharts `aria.decal` patterns (§11) or direct labels at line ends; red/amber/teal pills → prefix glyph ▲ ! ✓ and the word; choropleth classes → hatch density or printed class value inside each district; the "pulsing red badge" → the word "RISING" in the print header summary. Every printed chart needs its data table beneath it — which is also the 1.1.1 long description, so one piece of work serves both.
- Already right in DAPPA: A4 12 mm margins, forced white/ink, un-clamped scroll containers, `break-inside: avoid` on cards, print header with filter summary, IST stamp and synthetic-data notice, and `explorer-print.css` remapping the token triplets to a light palette (VERIFIED in `index.css:317-329`, `explorer-print.css`, `PrintHeader.jsx`). Missing: a print stylesheet for `/trends`, `/network` and `/predict` (only `cases` has one — `find` shows `case-detail-print.css` and `explorer-print.css` only), and the mono test itself (Chrome DevTools → Rendering → "Emulate CSS media type: print" plus "Emulate vision deficiencies → Achromatopsia" — the panel lists "Achromatopsia (no color)" among its options, [DevTools rendering](https://developer.chrome.com/docs/devtools/rendering/apply-effects), VERIFIED).
- Windows contrast themes: under `forced-colors: active` the browser forces `color`, `background-color`, `border-color`, `outline-color`, SVG `fill`/`stroke` to system colours and sets `box-shadow`/`text-shadow` to `none`; `forced-color-adjust: none` opts an element out ([MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors), VERIFIED). Relevance: station PCs on Windows with a contrast theme will lose every `box-shadow`-only card edge and every canvas colour; add `@media (forced-colors: active)` borders on cards and rely on the data table alternative for charts (INFERRED).

---

## 10. Colour-blind-safe status colours paired with icons

- **Palette:** the Okabe–Ito set — orange `#E69F00`, sky blue `#56B4E9`, bluish green `#009E73`, yellow `#F0E442`, blue `#0072B2`, vermilion `#D55E00`, reddish purple `#CC79A7`, black `#000000` — "works for nearly any scenario with discrete colors", and "Use direct labeling instead of colors when you need to distinguish between more than about eight categorical items" ([Wilke, *Fundamentals of Data Visualization*, ch. 19](https://clauswilke.com/dataviz/color-pitfalls.html), VERIFIED). The originating Color Universal Design page states the principle — "Use not only different colors but also a combination of different shapes, positions, line types and coloring patterns" and avoid red–green pairs — but publishes the values only as an image ([jfly CUD](https://jfly.uni-koeln.de/color/), VERIFIED for the principle; hex values taken from Wilke).
- **Status semantics = colour + icon + word.** GOV.UK's warning-text component pairs `<span class="govuk-warning-text__icon" aria-hidden="true">!</span>` with `<span class="govuk-visually-hidden">Warning</span>` ([GOV.UK Design System](https://design-system.service.gov.uk/components/warning-text/), VERIFIED). USWDS alerts come in info/warning/success/error, each with an icon, with the rule "Users should be able to understand the purpose of the alert without relying solely on its color or the shape of its icon", `role="alert"` for urgent and `role="status"` for advisory ([USWDS Alert](https://designsystem.digital.gov/components/alert/), VERIFIED).
- **Mapping for DAPPA (INFERRED, built from the above):**

| Meaning | Colour token (dark / light) | Glyph | Word (en / kn, kn from the repo locale) |
|---|---|---|---|
| Rising / critical (z ≥ 3) | signal `#E5484D` / `#B42318` (note dark-theme 4.44:1 on panel — lift to ≥ `#F0555A` or use large text) | ▲ or "!" | RISING / ಏರಿಕೆ |
| Watch (2 ≤ z < 3) | amber `#F5A623` / `#A16207` | ● | WATCH / ನಿಗಾ |
| Stable | teal `#2DD4BF` / `#0F766E` | ✓ | STABLE / ಸ್ಥಿರ |
| Falling | primary blue | ▼ | FALLING / ಇಳಿಕೆ |
| No data | muted | — | NO DATA / ದತ್ತಾಂಶವಿಲ್ಲ |

  Red and teal are the classic deuteranopia confusion pair; the glyph and word carry the meaning, the colour is redundant — which is exactly what 1.4.1 asks. For *series* colours in multi-line charts use Okabe–Ito in the order blue, vermilion, bluish green, orange, reddish purple, sky blue (skip yellow on white and on the dark panel — INFERRED from the palette's known weakness on light backgrounds, not sourced today).
- **Charts:** ECharts' `aria.enabled` (default `false`) turns on generated `aria-label` descriptions (`aria.label.enabled` default `true`) and `aria.decal.show` (default `false`) overlays pattern fills "as an additional hint other than colors to help differentiate the data" ([echarts-doc aria.md](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/aria.md), VERIFIED); in ECharts 5 the component is imported as `import { AriaComponent } from 'echarts/components'; echarts.use(AriaComponent)` ([ECharts handbook](https://echarts.apache.org/handbook/en/best-practices/aria/), VERIFIED — note the handbook's example uses the older key `aria.show`; the option reference uses `aria.enabled`). Decals also survive a mono printer (§9). DAPPA uses none of this today (MEASURED: grep empty).
- **Testing:** Chrome DevTools → Rendering → Emulate vision deficiencies offers "Protanopia (no red)", "Deuteranopia (no green)", "Tritanopia (no blue)", "Achromatopsia (no color)", "Blurred vision", "Reduced contrast" ([DevTools rendering](https://developer.chrome.com/docs/devtools/rendering/apply-effects), VERIFIED). Screenshot each dashboard view under deuteranopia and achromatopsia into `docs/screenshots/` — that is the checkable artefact.

---

## 11. Plain-language style guide for DAPPA's statistics

### 11.1 Rules (each traced to a source)

1. **Say "estimate", "around", "between X and Y".** "using words like 'estimate' and 'around' are a simple way to help show users that the" figures are not exact ([OSR](https://osr.statisticsauthority.gov.uk/blog/how-to-communicate-uncertainty-in-statistics/), VERIFIED); "Use words like 'estimates' throughout the publication" ([Government Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/), VERIFIED).
2. **Ranges as shaded bands with a plain sentence, not error bars.** "To show uncertainty we use a shaded band around a central estimate"; "Use plain language, such as, 'we are 95% sure the value falls in this range'"; "Avoid technical terms like 'confidence interval' or 'statistical significance,' or, if they are needed, provide simple explanations"; ONS does not use error bars because "they are harder to interpret accurately" ([ONS service manual](https://service-manual.ons.gov.uk/data-visualisation/guidance/showing-uncertainty-in-charts), VERIFIED). DAPPA's forecast band is 80 %, so the sentence is "8 times in 10".
3. **Call noise noise.** "Use phrases like 'broadly stable' … when the latest estimate is not significant"; template: "This decrease is not statistically significant and it is likely that the natural variation in the figures explains the change." ([GAF](https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/), VERIFIED). For DAPPA: any |z| < 2 movement is written as "within the normal range", never as "up 12 %".
4. **Natural frequencies: "X out of 100".** Government health writing explains a percentile as "in the 15th percentile for weight (meaning 85 out of 100 children weigh more)" ([MedlinePlus](https://medlineplus.gov/ency/article/001910.htm), VERIFIED). Use the same frame for percentiles, AUC and calibration.
5. **Use the force's own units.** "(VI) Rate of Crime : Number of crime reported per lakh person in the target Population." and "(V) Incidence of Crime : Number of crime reported under Indian Penal Code(IPC) or Special & Local Laws(SLL)." ([MoSPI Statistical Year Book, ch. 37 Crime Statistics](https://mospi.gov.in/sites/default/files/Statistical_year_book_india_chapters/ch37.pdf), VERIFIED by text extraction). So: "per lakh", "incidence", dd-mm-yyyy, IST, lakh/crore grouping — DAPPA's `format.js` already groups en-IN in both locales (VERIFIED).
6. **Jargon goes in the tooltip and the glossary, never in the label.** GIGW: "Avoid using jargon and technical terms that your audience may not understand" and "Include a list of abbreviations or a glossary" ([GIGW content strategies](https://guidelines.india.gov.in/activity/crafting-clear-and-concise-content-writing-strategies-for-government-websites/), VERIFIED). The technical term stays available (an SI *will* ask "what is the z"), one hover or one tap away.
7. **Short, active, one idea.** "Breaking up content into shorter sentences and paragraphs makes it easier for users to scan"; "Active voice is more direct" (same GIGW page, VERIFIED). The US federal guide's four pillars — principles, writing, design, testing for understanding — are the frame; its detailed word-level pages were not fetched today ([digital.gov plain language](https://digital.gov/guides/plain-language), VERIFIED for the structure only; `plainlanguage.gov/guidelines` now redirects there).
8. **Lead with the action the officer can take**, then the number, then the method. "Night burglary belt, Peenya, 11 PM–3 AM — consider a beat" beats "ST-DBSCAN cluster #4 (ε = 400 m, minPts = 12)". (INFERRED synthesis of 1, 6 and 7.)
9. **Never say the model "predicts a crime".** DAPPA's own ethics copy already says forecasts and scores are advisory indicators and "the final decision is the officer's" (`locales/kn/copilot.js:412` and its en twin, VERIFIED). Use "expects higher volume", "flags for review".
10. **Bilingual parity of *register*, not just keys.** The same sentence shape in both languages; Latin digits in both; technical loanwords ("z-score", "MAPE") are exempt from `lang` marking as technical terms under 3.1.2 (§2), so leave them Latin rather than coining Kannada neologisms that no officer has seen (INFERRED).

### 11.2 Fifteen worked translations

Kannada verification status: **[kn-V]** = the term itself is attested on the linked Kannada page; **[repo]** = the term is what `client/src/locales/kn/*` already uses (team-authored, not externally verified); **[unv]** = my proposal, unverified — a Kannada-speaking officer must sign it off. Verified anchors reused below: ಸರಾಸರಿ (average — page exists, first sentence "ಸರಾಸರಿ ಎಂದರೆ ಒಂದು ಸಂಖ್ಯೆಗಳ ಗುಂಪಿನ ಅಥವಾ ಪ್ರಮಾಣದ ಪ್ರಾತಿನಿಧಿಕ ಸಂಖ್ಯೆ." — [kn.wikipedia ಸರಾಸರಿ](https://kn.wikipedia.org/wiki/ಸರಾಸರಿ)), ಶೇಕಡಾವಾರು (percentage), Z-ಅಂಕಗಳು (Z-scores), ಅಂದಾಜು (estimate), ಸಂಭವನೀಯತೆ (probability), ನಮೂನೆ (sample) — all in [kn.wikipedia ಸಂಖ್ಯಾಶಾಸ್ತ್ರ](https://kn.wikipedia.org/wiki/ಸಂಖ್ಯಾಶಾಸ್ತ್ರ) (VERIFIED by quoting the containing sentences); ಮುನ್ಸೂಚನೆ (forecast — 152 kn.wikipedia hits, e.g. "ಮುಂಗಾರಿನ ಮುನ್ಸೂಚನೆ" in the ಹವಾಮಾನ article, [search](https://kn.wikipedia.org/w/index.php?search=%E0%B2%AE%E0%B3%81%E0%B2%A8%E0%B3%8D%E0%B2%B8%E0%B3%82%E0%B2%9A%E0%B2%A8%E0%B3%86&ns0=1)); ಅಸಂಗತತೆ (anomaly — 18 hits, used for "eccentric anomaly" in the ದೀರ್ಘವೃತ್ತ article, [search](https://kn.wikipedia.org/w/index.php?search=%E0%B2%85%E0%B2%B8%E0%B2%82%E0%B2%97%E0%B2%A4%E0%B2%A4%E0%B3%86&ns0=1)); ಋತು (season — [Wiktionary](https://en.wiktionary.org/wiki/season)); ಗುಂಪು (group — in the ಸರಾಸರಿ first sentence). Wiktionary lists ಸಗಟು for "average" ([Wiktionary](https://en.wiktionary.org/wiki/average)) but the Kannada Wikipedia article title is ಸರಾಸರಿ; prefer the latter.

| # | Term (as DAPPA uses it) | What it is, in one line | Officer-facing English (label → sentence → example) | Kannada |
|---|---|---|---|---|
| 1 | **z-score** (alerts, anomaly flags) | Distance from the station's usual count, in units of its normal week-to-week swing. | Label: **How far above normal**. Sentence: "0 is normal; each whole number is one normal swing. Above 2 is worth a look; above 3 is rare by chance." Example: "Peenya, burglary: 41 this week against a usual 18 — about 3 swings above normal (z = 3.1)." | Label: ಸಾಮಾನ್ಯಕ್ಕಿಂತ ಎಷ್ಟು ಹೆಚ್ಚು [unv]. Tooltip keeps "z-score" [repo] / Z-ಅಂಕ [kn-V]. Existing repo gloss "z-score ಎಂದರೆ (ಕಂಡುಬಂದ − ನಿರೀಕ್ಷಿತ) / σ" is the *technical* line, not the label. |
| 2 | **MAPE** (forecast backtest) | Average size of past forecast misses, as a percentage of the actual. | Label: **Typical forecast miss**. Sentence: "On past months this forecast was off by about 12 % either way." Example: "Forecast 140, typical miss 12 % → expect roughly 125–155." | ಮುನ್ಸೂಚನೆಯ ಸರಾಸರಿ ದೋಷ (ಶೇಕಡಾ) — ಮುನ್ಸೂಚನೆ [kn-V], ಸರಾಸರಿ [kn-V], ಶೇಕಡಾ [kn-V], ದೋಷ [unv]. Keep "MAPE" in the tooltip [repo]. |
| 3 | **DBSCAN cluster** (hotspot layer) | A tight bunch of incidents close in place and time — at least N within R metres — not a district average. | Label: **Hotspot**. Sentence: "27 incidents within 400 m of each other, 11 PM–3 AM, last 8 weeks. This is a patch, not a whole area." Never show ε/minPts on the card. | ಹಾಟ್‌ಸ್ಪಾಟ್ [repo]; explanatory ಅಪರಾಧ ದಟ್ಟಣೆ ಪ್ರದೇಶ [unv]; "ಗುಂಪು" for cluster [kn-V]. |
| 4 | **Louvain community** (network) | People who are named together in cases more with each other than with anyone else. | Label: **Group**. Sentence: "9 people who keep turning up in the same cases across 4 districts. The computer only counts shared cases — it does not know they are a gang." | ಗುಂಪು [kn-V] / ಸಹ-ಆರೋಪಿ ಗುಂಪು [repo-derived]. |
| 5 | **Gi\* hotspot** (Getis–Ord, if shipped) | A place whose count is high *and* whose neighbours are high — a confirmed pattern, not a lone spike. | Label: **Confirmed hotspot**. Sentence: "High here and in the surrounding beats. A pattern like this would show up by chance fewer than 5 times in 100." | ಖಚಿತಪಡಿಸಿದ ಹಾಟ್‌ಸ್ಪಾಟ್ [unv]. (Check the pipeline actually computes Gi\* before the label appears — README names ST-DBSCAN only.) |
| 6 | **Coreness** (k-core) | How deep inside the network a person sits. | Label: **Inner circle level**. Sentence: "Level 4 means this person is linked to at least 4 others who are each linked to at least 4 others — a core member, not a hanger-on." | ಜಾಲದ ಒಳವಲಯ ಮಟ್ಟ [unv] (ಜಾಲ = network [repo]). |
| 7 | **Betweenness** | How often a person is the only link between two groups. | Label: **Go-between**. Sentence: "Sits on the shortest path between others more than anyone else here. Remove them and the two groups stop touching." | ಸಂಪರ್ಕ ಸೇತು (ಎರಡು ಗುಂಪುಗಳ ನಡುವಿನ ಕೊಂಡಿ) [unv]. |
| 8 | **Calibration** (outcome model) | Whether "70 %" really means 70 out of 100. | Label: **Does the score mean what it says?** Sentence: "When the model said 70 %, about 70 of every 100 such past cases did end in a chargesheet. So read the score as a plain percentage." | ಅಂಕ ನಿಜಕ್ಕೂ ಹೊಂದುತ್ತದೆಯೇ — 100 ರಲ್ಲಿ 70 [unv]; ಶೇಕಡಾ [kn-V]. |
| 9 | **AUC** (0.78 embedded model; 0.500 QuickML case-status) | How well the model sorts cases into "will be chargesheeted" vs. not. | Label: **Sorting power**. Sentence: "Take one chargesheeted case and one that was not: the model ranks the right one higher 78 times out of 100. 50 out of 100 is a coin toss." Example (honest): "Case-status model: 50 out of 100 — no better than a coin; shown as a negative result." | ಮಾದರಿಯ ವಿಂಗಡಣಾ ಶಕ್ತಿ — 100 ರಲ್ಲಿ 78 [unv]. |
| 10 | **Percentile** (station risk rank) | Rank out of 100. | Label: **Rank**. Sentence: "Higher than 90 of every 100 stations." (MedlinePlus frame.) | 100 ಠಾಣೆಗಳಲ್ಲಿ 90ಕ್ಕಿಂತ ಹೆಚ್ಚು [unv; ಠಾಣೆ = station per repo]; repo currently prints "p{p}" (`cases.js:844`) — replace on officer-facing screens. |
| 11 | **Confidence interval** (80 % forecast band) | The range the true number will likely fall in. | Label: **Likely range**. Sentence: "We expect around 140 cases next month — most likely between 120 and 160; the true number lands in that band 8 times in 10." (ONS frame, 80 % version.) | ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿ — 10 ರಲ್ಲಿ 8 ಬಾರಿ [unv]; repo term ವಿಶ್ವಾಸ ಮಿತಿ stays in the tooltip [repo]. |
| 12 | **Anomaly** (alerts, case flags) | A count too far from normal for chance to explain. | Label: **Unusual rise** (or "Unusual count"). Sentence: "Well outside this station's normal range. It says *where* to look, not *why*." | ಅಸಾಮಾನ್ಯ ಏರಿಕೆ [unv] as the label; ಅಸಂಗತತೆ [repo, kn-V] in the tooltip. |
| 13 | **Baseline** | What the station usually sees in this week of the year. | Label: **Usual level**. Sentence: "The average of the same weeks in earlier years, adjusted for season." Example: "Usual level 18/week · this week 41." | ಸಾಮಾನ್ಯ ಮಟ್ಟ [unv] (label); ಆಧಾರರೇಖೆ [repo] (tooltip); ಸರಾಸರಿ [kn-V]. |
| 14 | **Seasonality** (hour×weekday, festival windows) | The regular rhythm — by hour, weekday, festival. | Label: **Regular pattern**. Sentence: "Thefts rise every festival week and accidents every Saturday night. The forecast knows the rhythm, so a festival spike alone does not raise an alert." | ಋತುಮಾನ ಮಾದರಿ [repo; ಋತು kn-V]. |
| 15 | **Ego network** (Offender 360) | One person's direct circle and the links among them. | Label: **This person's circle**. Sentence: "Everyone directly linked to Ravi Kumar, and how they link to each other. One step out — not the whole network." | ಈ ವ್ಯಕ್ತಿಯ ಸಂಪರ್ಕ ವಲಯ [unv]. |

Bonus, because it appears on every screen: **Forecast** → label "Expected next month" / ಮುನ್ಸೂಚನೆ [kn-V]; **Rate** → "per lakh people" / ಲಕ್ಷ ಜನಸಂಖ್ಯೆಗೆ [unv; ಜನಸಂಖ್ಯೆ kn-V].

Where to put each layer: **label** on the card, **sentence** in the first line of the tooltip/expanded view, **example** in the About glossary, **technical term + formula** last. The glossary satisfies GIGW's "list of abbreviations or a glossary" and doubles as the 3.2.6 self-help mechanism.

---

## 12. Audit checklist

Status column is from the code reading in §1 (27 Aug 2026), not from a run: **pass?** = code evidence suggests a pass, **fail?** = code evidence suggests a fail, **check** = cannot tell without running.

### A. Accessibility (WCAG 2.2 AA + the two AAA items DAPPA can credibly claim)

| # | Criterion | Requirement (short) | Test | Status |
|---|---|---|---|---|
| A1 | [1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) AA | Text ≥ 4.5:1 (≥ 3:1 if ≥ 24 px / 18.5 px bold), incl. placeholders and hover text | axe `color-contrast`; `scratchpad/contrast.py` on tokens | **fail?** eyebrow 4.14/3.54, dark red pill 4.07, light amber pill 4.32 |
| A2 | [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) AA | UI boundaries, icons, chart lines, focus ring ≥ 3:1 vs adjacent | manual + contrast tool on `--t-grid` | **fail?** grid borders 1.2–1.3:1 as sole input boundary; ring passes |
| A3 | [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) A + [G111](https://www.w3.org/WAI/WCAG22/Techniques/general/G111) | Colour never the only cue (pills, series, choropleth classes, pulsing badges) | DevTools deuteranopia/achromatopsia screenshots | **fail?** pills colour+text only; series colour-only; no decals |
| A4 | [1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) A | Chart short label + long description or data table | screen reader on each ChartPanel | **fail?** no `aria` option, no table view |
| A5 | [1.3.1](https://www.w3.org/TR/WCAG22/) A | Table headers programmatic | axe `th-has-data-cells`, `td-headers-attr` | check (`DataTable.jsx` uses `<th>`) |
| A6 | [1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) AA | No 2-D scroll at 320 px except map/network/tables | DevTools 320 px, each route | check |
| A7 | [1.4.4](https://www.w3.org/TR/WCAG22/) AA + [1.4.12](https://www.w3.org/TR/WCAG22/) AA | 200 % zoom and text-spacing bookmarklet, nothing clipped | manual | check (`whitespace-nowrap` pills at risk) |
| A8 | [1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) AA | Tooltips dismissible (Esc), hoverable, persistent | keyboard + mouse | **fail?** `.tt` has no Esc, `pointer-events:none` |
| A9 | [2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) A | Everything keyboard-operable; map markers, network nodes, sliders | tab through each route | **fail?** `keyboard:false` markers; Cytoscape canvas — needs declared table equivalents |
| A10 | [2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) A | Ticker and infinite pulses have pause/stop/hide reachable by touch | touch device, no hover | check — add explicit pause; motion toggle covers pulses |
| A11 | [2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) A | ≤ 3 flashes/s | inspect keyframes | pass? (2 s cycle) |
| A12 | [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) AAA | Motion disable via `prefers-reduced-motion` | DevTools emulation | pass? (`index.css:289` + toggle) |
| A13 | [2.4.1](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html) A | Skip link + landmarks | first Tab on load; axe `region` | pass? |
| A14 | [2.4.3](https://www.w3.org/TR/WCAG22/) A | Focus order matches reading order; dialogs trap/restore | keyboard | check (About copy claims trap/restore) |
| A15 | [2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) AA | Visible focus on every control incl. `.input-dark` overrides | keyboard | check (global ring pass; `ring-1 …/60` overrides suspect) |
| A16 | [2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) AA | Focused element never fully under sticky bar/sheet/toast | tab to items behind the top bar | check — add `scroll-padding` |
| A17 | [2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) AAA | 2 px perimeter, 3:1 change | contrast.py ring rows | pass? for the global ring |
| A18 | [2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) AA | Map/network pan and any slider have tap or typed alternatives | pointer only, no drag | check |
| A19 | [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) AA | 24 px or 24 px-circle spacing; dense viz needs an equivalent | axe `target-size` (enable it) + manual | check (pills, sort headers, calendar, legend) |
| A20 | [2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) AAA / [Android 48 dp](https://developer.android.com/guide/topics/ui/accessibility/apps) | Primary mobile actions ≥ 44–48 px | measure bottom nav / Ack / filter | check |
| A21 | [3.1.1](https://www.w3.org/TR/WCAG22/) A / [3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html) AA | `html lang` switches; untranslated sentences marked or absent | axe `html-lang-valid`; Kannada-mode sweep | pass? for 3.1.1; check 3.1.2 |
| A22 | [3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html) A | Help entry in the same slot on every page | visual | check — add Help link |
| A23 | [4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) A | Icon-only buttons named; custom widgets have role/state | axe `button-name`, `link-name`, `label` | check (17/603 labelled; most have text) |
| A24 | [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) AA | Filter result counts, alert counts, "offline/saved copy" announced | screen reader | pass? toasts/pager/copilot; check counts |

### B. GIGW 3.0

| # | Row | Requirement | Test | Status |
|---|---|---|---|---|
| B1 | [Accessibility, 50 rows](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/) | WCAG 2.1 AA — covered by A1–A24 | as above | as above |
| B2 | [Lifecycle Row 10](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/) | Bilingual, prominent language link, Unicode | visual + `check_i18n.mjs` | pass? |
| B3 | [Bilingual sync](https://guidelines.india.gov.in/website-aspect/bilingual-content-is-in-sync-with-the-english-content/) | Both languages updated together; untranslated status shown | `check_i18n.mjs` in CI (baseline says no CI test job) | check — wire into CI |
| B4 | [Quality Row 13](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/) | Regional fonts tested on popular browsers, no layout loss | screenshots Win/Android/iOS in `docs/screenshots/` | **fail?** no evidence file |
| B5 | [Quality Row 15](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/) | CSS layout, responsive | 320/768/1280 screenshots | check |
| B6 | [Quality Row 14](https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/) | Help section linked from all pages | visual | check — add |
| B7 | [Accessibility 31](https://guidelines.india.gov.in/guidelines/) | Search on every page | command palette `/` | pass? |
| B8 | [Quality Row 25](https://guidelines.india.gov.in/guidelines/) | No spelling/grammar errors (both languages) | proofread pass, Kannada reviewer | check |
| B9 | [Speed article](https://guidelines.india.gov.in/activity/techniques-and-tools-for-website-speed-optimization/) | Caching headers, compression, Lighthouse run | §5 budget run | check |
| B10 | [Content article](https://guidelines.india.gov.in/activity/crafting-clear-and-concise-content-writing-strategies-for-government-websites/) | No unexplained jargon; glossary | §11 labels + glossary | **fail?** ("p90", "z", "MAPE" as labels today) |

### C. Performance on Lighthouse mobile (Slow 4G, 4× CPU)

| # | Metric | Target | Source | Status |
|---|---|---|---|---|
| C1 | Script transfer, first route | ≤ 650 KB (stretch 620) | [PIG 2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/), [2026](https://infrequently.org/2025/11/performance-inequality-gap-2026/) | **fail?** ≈685 KB est. |
| C2 | Total transfer, first route | ≤ 1.3 MB | same | check (≈800 KB est.) |
| C3 | LCP | ≤ 2.5 s p75 | [web.dev/vitals](https://web.dev/articles/vitals) | check |
| C4 | INP | ≤ 200 ms | same | check (filter → chart re-render) |
| C5 | CLS | ≤ 0.1 | same | check (chart/map containers need fixed heights) |
| C6 | Lighthouse Performance | ≥ 90 (green) | [scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) | check — Submission Kit's "≥ 85" has no artefact yet |
| C7 | Third-party requests | 0 | budget.json `resourceCounts` | pass? (no CDN by design) |
| C8 | Fonts | ≤ 4 files, ≤ 120 KB | budget.json | check (Latin woff2 ≈ 97 KB) |

### D. Offline / PWA

| # | Item | Source | Status |
|---|---|---|---|
| D1 | Service worker at `/app/sw.js`, precached shell, `navigateFallback` | [MDN scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register), [vite-pwa](https://vite-pwa-org.netlify.app/workbox/generate-sw.html) | **fail** — none exists |
| D2 | `NetworkFirst` + `networkTimeoutSeconds` on intel GETs; `StaleWhileRevalidate` on lookups; `NetworkOnly` on POST/AI | [Workbox](https://developer.chrome.com/docs/workbox/caching-strategies-overview), [NetworkFirst.ts](https://raw.githubusercontent.com/GoogleChrome/workbox/v7/packages/workbox-strategies/src/NetworkFirst.ts) | fail — none |
| D3 | "Saved copy from <time>" status region on cached views | [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | fail — banner says only offline |
| D4 | Manifest icons incl. PNG/maskable; `display: standalone` | manifest present; icons SVG-only | check |
| D5 | Update prompt, not silent reload | [vite-pwa registerType](https://vite-pwa-org.netlify.app/guide/) | n/a until D1 |
| D6 | Offline test: airplane mode after one visit → dashboard, alerts, last cases render with stamp | [Offline Cookbook](https://web.dev/articles/offline-cookbook) | fail |

### E. Print (mono)

| # | Item | Source | Status |
|---|---|---|---|
| E1 | Every route prints (not just `/cases`) | [MDN Printing](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing) | **fail?** print CSS only for cases |
| E2 | No colour-only meaning on paper: decals/labels/glyphs | [G111](https://www.w3.org/WAI/WCAG22/Techniques/general/G111), [print-color-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust) | fail? |
| E3 | Data table under each printed chart | [1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) | fail? |
| E4 | Achromatopsia + print emulation screenshots in `docs/screenshots/` | [DevTools](https://developer.chrome.com/docs/devtools/rendering/apply-effects) | fail — none |
| E5 | `forced-colors: active` borders on cards | [MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) | check |

### F. Plain language

| # | Item | Source | Status |
|---|---|---|---|
| F1 | No technical noun as a card label (z, p90, MAPE, AUC, CI) | [GIGW content](https://guidelines.india.gov.in/activity/crafting-clear-and-concise-content-writing-strategies-for-government-websites/) | **fail?** |
| F2 | Ranges as bands + "X times in 10" sentence | [ONS](https://service-manual.ons.gov.uk/data-visualisation/guidance/showing-uncertainty-in-charts) | check (band exists; sentence?) |
| F3 | "Within normal range" for |z| < 2 movements | [GAF](https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/) | check |
| F4 | Rates "per lakh" | [MoSPI ch. 37](https://mospi.gov.in/sites/default/files/Statistical_year_book_india_chapters/ch37.pdf) | check |
| F5 | Glossary page with the 15 entries, both languages, Kannada signed off by a speaker | GIGW content page | fail — not yet |

---

## 13. Gaps — what could not be verified today

- **GIGW 3.0 full text.** The official PDF exceeded the 10 MB fetch limit and `web.guidelines.gov.in` (GIGW 2.0) does not resolve. Guideline numbering and the exact wording of the bilingual-sync row are from the live matrix page and the search index of the guideline page, not from the PDF.
- **Apple HIG 44 pt** and **Hoober's original A List Apart article** did not render/returned 403; secondary sources are cited and marked.
- **Ookla rural-India figures** and **IDC India shipment shares**: pages returned 403; figures are from search-index snippets and flagged as such.
- **Kannada terms.** Only ಸರಾಸರಿ, ಶೇಕಡಾವಾರು, Z-ಅಂಕ, ಅಂದಾಜು, ಸಂಭವನೀಯತೆ, ನಮೂನೆ, ಮುನ್ಸೂಚನೆ, ಅಸಂಗತತೆ, ಋತು, ಗುಂಪು, ಜನಸಂಖ್ಯೆ are attested on a Kannada page. The Karnataka State Police site returned "Unauthorized", the Kannada Wikipedia pages for standard deviation, FIR, community and network do not exist, and Wiktionary has no Kannada for forecast/estimate/network/anomaly. Every [unv] Kannada label in §11.2 needs a Kannada-speaking officer's sign-off before it ships; the existing repo terms ([repo]) are team-authored and equally unverified externally.
- **No runtime numbers.** No Lighthouse, axe, screen-reader or 320 px run was performed (the brief forbids builds and the dev server). Every "pass?/fail?" is from reading source; the contrast ratios are computed from the token values and assume the utilities are used as read.
- **Whether DAPPA computes Gi\*** — the README names ST-DBSCAN; the term list in the brief includes Gi\*. Translation #5 is written for the method, not for a verified screen.
- **Catalyst hosting headers.** I did not check whether Catalyst web-client hosting lets you set `Service-Worker-Allowed` or cache headers; the plan avoids needing either (worker at the app root, hashed assets), which is INFERRED to be sufficient.

---

## Sources

W3C / WCAG 2.2
1. https://www.w3.org/TR/WCAG22/
2. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
3. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
4. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
5. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
6. https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
7. https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html
8. https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
9. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
10. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
11. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
12. https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html
13. https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
14. https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
15. https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html
16. https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
17. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
18. https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
19. https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
20. https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html
21. https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html
22. https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
23. https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
24. https://www.w3.org/WAI/WCAG22/Techniques/general/G111
25. https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/rule-descriptions.md

GIGW
26. https://guidelines.india.gov.in/introduction/
27. https://guidelines.india.gov.in/new-features-of-gigw-3-0/
28. https://guidelines.india.gov.in/guidelines/
29. https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/
30. https://guidelines.india.gov.in/website-aspect/bilingual-content-is-in-sync-with-the-english-content/ (body not rendered; search-index text)
31. https://guidelines.india.gov.in/activity/techniques-and-tools-for-website-speed-optimization/
32. https://guidelines.india.gov.in/activity/crafting-clear-and-concise-content-writing-strategies-for-government-websites/
33. https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2023/04/2023041074.pdf (GIGW 3.0 New Features and Roadmap deck; text extracted with pypdf)
34. https://cdnbbsr.s3waas.gov.in/s3c92a10324374fac681719d63979d00fe/uploads/2025/02/2025021775.pdf (full GIGW 3.0 — INACCESSIBLE, exceeded fetch size)

Performance and devices
35. https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/docs/throttling.md
36. https://web.dev/articles/vitals
37. https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
38. https://web.dev/articles/use-lighthouse-for-performance-budgets
39. https://infrequently.org/2024/01/performance-inequality-gap-2024/
40. https://infrequently.org/2025/11/performance-inequality-gap-2026/
41. https://www.newsonair.gov.in/more-than-95-percent-villages-in-india-have-internet-access-with-3g-or-4g-mobile-connectivity
42. https://www.communicationstoday.co.in/mobile-connectivity-in-rural-india-ookla/ (403; snippet only)
43. https://my.idc.com/getdoc.jsp?containerId=prAP53737525 (403; snippet only)

PWA / browser platform
44. https://developer.chrome.com/docs/workbox/caching-strategies-overview
45. https://developer.chrome.com/docs/workbox/reference/workbox-strategies/
46. https://raw.githubusercontent.com/GoogleChrome/workbox/v7/packages/workbox-strategies/src/NetworkFirst.ts
47. https://web.dev/articles/offline-cookbook
48. https://vite-pwa-org.netlify.app/guide/
49. https://vite-pwa-org.netlify.app/workbox/generate-sw.html
50. https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
51. https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust
52. https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing
53. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors
54. https://developer.chrome.com/docs/devtools/rendering/apply-effects

Fonts and touch
55. https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/master/data/fonts/fonts.xml
56. https://en.wikipedia.org/wiki/Nirmala_UI
57. https://registry.npmjs.org/@fontsource/noto-sans-kannada/latest
58. https://developer.android.com/guide/topics/ui/accessibility/apps
59. https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/
60. https://alistapart.com/article/how-we-hold-our-gadgets/ (403)
61. https://developer.apple.com/design/human-interface-guidelines/accessibility (body not rendered)

Charts and colour
62. https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/aria.md
63. https://echarts.apache.org/handbook/en/best-practices/aria/
64. https://leafletjs.com/reference.html
65. https://leafletjs.com/examples/accessibility/
66. https://clauswilke.com/dataviz/color-pitfalls.html
67. https://jfly.uni-koeln.de/color/
68. https://design-system.service.gov.uk/components/warning-text/
69. https://designsystem.digital.gov/components/alert/

Plain language and statistics
70. https://service-manual.ons.gov.uk/data-visualisation/guidance/showing-uncertainty-in-charts
71. https://osr.statisticsauthority.gov.uk/blog/how-to-communicate-uncertainty-in-statistics/
72. https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/
73. https://digital.gov/guides/plain-language (target of the plainlanguage.gov/guidelines redirect)
74. https://medlineplus.gov/ency/article/001910.htm
75. https://mospi.gov.in/sites/default/files/Statistical_year_book_india_chapters/ch37.pdf (text extracted with pypdf)

Kannada
76. https://kn.wikipedia.org/wiki/ಸಂಖ್ಯಾಶಾಸ್ತ್ರ
77. https://kn.wikipedia.org/wiki/ಸರಾಸರಿ
78. https://kn.wikipedia.org/w/index.php?search=%E0%B2%AE%E0%B3%81%E0%B2%A8%E0%B3%8D%E0%B2%B8%E0%B3%82%E0%B2%9A%E0%B2%A8%E0%B3%86&ns0=1
79. https://kn.wikipedia.org/w/index.php?search=%E0%B2%85%E0%B2%B8%E0%B2%82%E0%B2%97%E0%B2%A4%E0%B2%A4%E0%B3%86&ns0=1
80. https://en.wiktionary.org/wiki/season
81. https://en.wiktionary.org/wiki/probability
82. https://en.wiktionary.org/wiki/average
83. https://ksp.karnataka.gov.in/kn (Unauthorized / not rendered)

Repository files read (all under `E:\Datathon\ksp-dappa\`): `README.md`, `docs/ROUND2_BASELINE.md`, `CLAUDE.md`, `client/index.html`, `client/vite.config.js`, `client/tailwind.config.js`, `client/package.json`, `client/public/manifest.webmanifest`, `client/src/index.css`, `client/src/main.jsx`, `client/src/lib/api.js`, `client/src/lib/i18n.jsx`, `client/src/components/{Badge,OfflineBanner,PrintHeader,ChartPanel,DataTable,ToastProvider,Layout}.jsx`, `client/src/routes/dashboard/IntelTicker.jsx`, `client/src/routes/geointel/{MapCanvas,LocateSearch}.jsx`, `client/src/routes/cases/explorer-print.css`, `client/src/locales/{en,kn}/*.js`, and the built `client/dist/assets/` listing.

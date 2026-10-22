# Word Associations visualization changes

## 2026-10-17 — Four-panel comparison heatmap

- Repeated the corpus heatmap four times in a 2×2 layout, with a separate
  macro-category filter for each panel.
- Shared the outer axis labels: “Verbs” appears at the left and “Keywords”
  above the matrix. Duplicate verb labels in the right-hand panels and keyword
  headers in the lower panels are omitted.
- Kept keyword columns equally sized and aligned across panels so corresponding
  cells have consistent dimensions.
- Added narrow central gutters and subtle dotted gray horizontal and vertical
  axes to distinguish the four panels. The horizontal axis extends toward the
  “Verbs” label while leaving a small gap from its highlight.
- Made the main corpus heatmap width adjustable independently of the detail
  view so its cell size and surrounding card footprint can be tuned separately.
- Styled individual cells with thin light borders and rounded corners.
- Changed the diverging heatmap colors to yellow (`#FFF799`) for negative
  association and magenta (`#ff00ff`) for positive association, with a neutral
  midpoint and dark cell text for contrast.
- Updated highlighted terms: verbs use `#B8FF45` at 50% opacity and keywords
  use `#99FFDC` at 50% opacity; highlighted text uses `#292929`.
- Set the unhighlighted text in the page header to white for readability on
  the dark page background.
- Added coordinated hover and keyboard-focus comparison: the matching
  verb-keyword pair stays highlighted in every panel while other cells become
  desaturated, then the full color returns when the pointer or focus leaves.
- Added an “All” option to the course selector to return from an individual
  syllabus to the four-panel corpus view.
- Replaced the single category breadcrumb with six navigation links in order:
  “Compared categories” for the four-panel filtered comparison, “All
  categories” for one unfiltered matrix, then one single-matrix view for each
  macro-category. The selected view is reflected in the URL hash.
- Set all corpus views to a centered maximum width of 1150 px. Single-matrix
  views use taller cells similar to the supplied reference.
- Centered the single-matrix heatmap within the page and increased the row and
  column label font sizes for desktop. The “Compared categories” view is
  unchanged.
- Slightly increased the cell value font size in single-matrix views, without
  changing “Compared categories”.
- Updated “View one course”: selecting a syllabus assigned in the CSV opens a
  single matrix for its macro-category, filtered to that course. The selected
  course is reflected in the URL and survives browser back/forward navigation.
  Courses without a CSV assignment continue to open their individual view,
  with a notice that they need a macro-category assignment.
- Scoped “View one course” to the active view: it is hidden in “Compared
  categories”, lists every course in “All categories”, and lists only the
  courses assigned to the selected macro-category in category views.
- In a category view, choosing “All” in “View one course” returns to that
  category's aggregated matrix. In “All categories”, “All” still returns to
  the four-panel comparison.
- Added `data/macro-categories.csv` to map PDF filenames to macro-categories
  and filter each panel to its assigned documents:
  - Top left: Design Studio
  - Top right: Professional Practice
  - Bottom left: Technology & Representation
  - Bottom right: History & Theory
- Seeded the mapping with the seven supplied syllabi. The Professional Practice
  panel has no assigned documents yet and displays an empty-state message.
- Aggregate each panel's sentence, verb, keyword, and co-occurrence counts
  from its assigned syllabi; panel hover details are filtered to those syllabi
  as well. The sentence-analysis generator now records per-syllabus active
  sentence totals for filtered association scores. The existing `data.js`
  predates this field, so it uses each cohort's total sentence count until
  regenerated. The CSV is copied to `docs/data/` for the published version.
- Kept the description at its natural text size and width. The page may scroll,
  while the complete matrix can be viewed together; narrow screens stack the
  panels and retain a single-column layout without horizontal overflow.
- Preserved cell tooltips and click-through navigation to pairing and syllabus
  details. Synchronized the published assets in `docs/word_associations/`.

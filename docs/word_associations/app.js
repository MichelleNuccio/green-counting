/* Verbs × Keywords explorer, written for a general audience.
   All derived numbers are computed here from the raw sentence tallies in
   data.js; every label is inserted with textContent (never innerHTML). */
(function () {
  "use strict";
  const D = window.VK_DATA;
  const MIN_COOCCUR = 3;     // cells with fewer shared sentences are left unscored
  const MIN_SYL_COOCCUR = 2; // per-course readings need at least this many sentences
  const HIDDEN_KW_CATS = new Set(["local", "universal", "theory"]);
  // "count" lists the texts most of these courses cite; "distinct" ranks by how
  // much MORE often these courses cite a text than the average course does.
  const CITATION_RANKING = "count";

  // Friendlier display names for the verb categories
  const VERB_NAMES = {
    positioning: "positioning",
    collaborating: "collaborating",
    doing: "doing",
    knowledge: "knowing",
    environment_positive: "environmental healing",
    built_environment: "building",
    environment_negative: "environmental harming",
    questioning: "questioning",
  };
  const vName = (v) => VERB_NAMES[v] || v;

  // Alphabetical display order; "local" column dropped
  const VERB_CATS = [...D.verb_cats].sort((a, b) => vName(a).localeCompare(vName(b)));
  const KW_CATS = D.kw_cats.filter((k) => !HIDDEN_KW_CATS.has(k)).sort();
  const CORPUS_PANELS = [
    { row: 0, column: 0, macroCategory: "Design Studio" },
    { row: 0, column: 1, macroCategory: "Professional Practice" },
    { row: 1, column: 0, macroCategory: "Technology & Representation" },
    { row: 1, column: 1, macroCategory: "History & Theory" },
  ].map((panel) => ({
    ...panel,
    verbs: VERB_CATS,
    keywords: KW_CATS,
    syllabi: [],
    corpus: null,
  }));
  const MACRO_CATEGORY_NAMES = new Set(CORPUS_PANELS.map((panel) => panel.macroCategory));
  const CORPUS_MODES = [
    { id: "compared", label: "Compared categories" },
    { id: "all", label: "All categories" },
    ...CORPUS_PANELS.map((panel) => ({
      id: panel.macroCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label: panel.macroCategory,
      macroCategory: panel.macroCategory,
    })),
  ];
  const CORPUS_MODE_BY_ID = new Map(CORPUS_MODES.map((mode) => [mode.id, mode]));

  const state = {
    view: "corpus",
    corpusMode: "compared",
    corpusSyllabusIndex: null,
    metric: "pmi",
    cell: null,
    syl: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const viewCorpus = $("#view-corpus");
  const viewCell = $("#view-cell");
  const viewSyl = $("#view-syllabus");
  const tooltip = $("#tooltip");
  const breadcrumb = $("#breadcrumb");
  const picker = $("#syllabus-picker");
  const pickerLabel = $("#syllabus-picker-label");
  const sortedSyllabi = D.syllabi
    .map((syllabus, index) => ({ syllabus, index }))
    .sort((a, b) => a.syllabus.y - b.syllabus.y || a.syllabus.s.localeCompare(b.syllabus.s));

  const key = (v, k) => v + "|" + k;
  const log2 = (x) => Math.log(x) / Math.LN2;

  // "2.3×", "12×", "0.4×" — how many times more/less than a baseline
  function fmtRatio(r) {
    if (!isFinite(r) || r <= 0) return "—";
    if (r >= 10) return Math.round(r) + "×";
    return (Math.round(r * 10) / 10) + "×";
  }

  function parseCsvRow(line, lineNumber) {
    const fields = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === ",") {
        fields.push(field.trim());
        field = "";
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === '"') {
        throw new Error(`Unexpected quote on line ${lineNumber}.`);
      } else {
        field += char;
      }
    }
    if (quoted) throw new Error(`Unclosed quoted field on line ${lineNumber}.`);
    fields.push(field.trim());
    return fields;
  }

  function normalizePdfFilename(filename) {
    const basename = filename.trim().split(/[\\/]/).pop();
    return basename.replace(/\.pdf$/i, "");
  }

  function aggregateSyllabi(syllabi) {
    const corpus = {
      total_sentences: 0,
      active_sentences: 0,
      v: Object.create(null),
      k: Object.create(null),
      c: Object.create(null),
    };
    for (const syllabus of syllabi) {
      corpus.total_sentences += syllabus.n;
      // Older generated data lacks this per-syllabus total, so use all sentences.
      corpus.active_sentences += syllabus.active_sentences ?? syllabus.n;
      for (const [category, count] of Object.entries(syllabus.v))
        corpus.v[category] = (corpus.v[category] || 0) + count;
      for (const [category, count] of Object.entries(syllabus.k))
        corpus.k[category] = (corpus.k[category] || 0) + count;
      for (const [pair, count] of Object.entries(syllabus.c))
        corpus.c[pair] = (corpus.c[pair] || 0) + count;
    }
    return corpus;
  }

  function corpusModeForSyllabus(index) {
    const syllabus = D.syllabi[index];
    if (!syllabus) return null;
    const panel = CORPUS_PANELS.find((candidate) => candidate.syllabi.includes(syllabus));
    return panel && CORPUS_MODES.find((mode) => mode.macroCategory === panel.macroCategory);
  }

  async function loadMacroCategories() {
    const paths = ["../data/macro-categories.csv", "../../data/macro-categories.csv"];
    const failures = [];
    let csvText;
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          failures.push(`${path}: HTTP ${response.status}`);
          continue;
        }
        csvText = await response.text();
        break;
      } catch (error) {
        failures.push(`${path}: ${error.message}`);
      }
    }
    if (csvText === undefined)
      throw new Error(`Could not load macro-categories.csv. Tried ${failures.join("; ")}.`);

    const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
    const header = parseCsvRow(lines.shift() || "", 1);
    if (header.length !== 2 || header[0] !== "pdf_filename" || header[1] !== "macro_category")
      throw new Error("Expected CSV columns: pdf_filename,macro_category.");

    const syllabiByFilename = new Map(
      D.syllabi.map((syllabus) => [normalizePdfFilename(syllabus.t), syllabus]),
    );
    const categoriesByFilename = new Map();
    let assignmentCount = 0;
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].trim()) continue;
      const lineNumber = index + 2;
      const row = parseCsvRow(lines[index], lineNumber);
      if (row.length !== 2 || !row[0] || !row[1])
        throw new Error(`Expected a filename and category on line ${lineNumber}.`);
      const filename = normalizePdfFilename(row[0]);
      if (!MACRO_CATEGORY_NAMES.has(row[1]))
        throw new Error(`Unknown macro-category "${row[1]}" on line ${lineNumber}.`);
      if (!syllabiByFilename.has(filename))
        throw new Error(`PDF "${row[0]}" on line ${lineNumber} is not in the loaded syllabus data.`);
      if (categoriesByFilename.has(filename))
        throw new Error(`Duplicate PDF "${row[0]}" on line ${lineNumber}.`);
      categoriesByFilename.set(filename, row[1]);
      assignmentCount++;
    }
    if (!assignmentCount) throw new Error("macro-categories.csv contains no PDF assignments.");

    for (const panel of CORPUS_PANELS) {
      panel.syllabi = D.syllabi.filter((syllabus) =>
        categoriesByFilename.get(normalizePdfFilename(syllabus.t)) === panel.macroCategory);
      panel.corpus = aggregateSyllabi(panel.syllabi);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  function corpusCell(v, k, corpus = D.corpus) {
    const a = corpus.c[key(v, k)] || 0;
    const va = corpus.v[v] || 0;
    const ka = corpus.k[k] || 0;
    const n = corpus.total_sentences;
    // Use the active-sentence baseline when available; older per-syllabus
    // data falls back to all sentences in that filtered cohort.
    const nA = corpus.active_sentences || n;
    let ratio = null; // observed co-occurrence vs pure chance
    if (a > 0 && va > 0 && ka > 0) ratio = (a * nA) / (va * ka);
    return { a, va, ka, n, ratio };
  }

  function sylRate(s, v, k) {
    const a = s.c[key(v, k)] || 0;
    return { a, rate: s.n ? (a / s.n) * 100 : 0 };
  }

  // How this course's use of a pairing compares with the average syllabus (a
  // ratio). minA lets a caller relax the "at least N sentences" gate below
  // the shared default (MIN_SYL_COOCCUR) -- the bar-chart tooltip passes 1,
  // since it already only shows a bar at all once a >= 1, and the ratio
  // should always be there once the bar is.
  function sylVsAverage(s, v, k, minA = MIN_SYL_COOCCUR) {
    const a = s.c[key(v, k)] || 0;
    if (a < minA || !s.n) return null;
    const corpus = corpusCell(v, k);
    if (!corpus.a) return null;
    return (a / s.n) / (corpus.a / corpus.n);
  }

  // How often this pairing co-occurs within THIS course specifically vs pure
  // chance, computed the same way as corpusCell but scoped entirely to this
  // syllabus's own sentence counts (s.v / s.k / s.n stand in for the
  // corpus-wide verb total / keyword total / active-sentence count) --
  // unlike sylVsAverage above, this never references the corpus at all.
  function sylCell(s, v, k) {
    const a = s.c[key(v, k)] || 0;
    const va = s.v[v] || 0;
    const ka = s.k[k] || 0;
    if (a < MIN_SYL_COOCCUR || !s.n || !va || !ka) return { a, ratio: null };
    return { a, ratio: (a * s.n) / (va * ka) };
  }

  function topSyllabi(v, k, limit, syllabi = D.syllabi) {
    return syllabi
      .map((s, i) => ({ s, i, ...sylRate(s, v, k) }))
      .filter((r) => r.a >= MIN_SYL_COOCCUR)
      .sort((x, y) => y.rate - x.rate)
      .slice(0, limit);
  }

  // Corpus-wide citation counts, computed once: how many courses cite each text
  let CITE_BASE = null;
  function citeBase() {
    if (CITE_BASE) return CITE_BASE;
    const counts = new Map();
    let nCourses = 0;
    for (const s of D.syllabi) {
      if (!s.refs || !s.refs.length) continue;
      nCourses++;
      const seen = new Set();
      for (const [title] of s.refs) {
        if (seen.has(title)) continue;
        seen.add(title);
        counts.set(title, (counts.get(title) || 0) + 1);
      }
    }
    CITE_BASE = { counts, nCourses };
    return CITE_BASE;
  }

  // Texts the pairing's courses cite unusually often: ranked by how much more
  // common a text is among these courses than among all courses, so corpus-wide
  // bestsellers don't automatically dominate every pairing.
  function topCitations(v, k, limit, syllabi = D.syllabi) {
    const base = citeBase();
    const counts = new Map();
    let nPair = 0;
    for (const s of syllabi) {
      if ((s.c[key(v, k)] || 0) < MIN_SYL_COOCCUR) continue;
      if (!s.refs || !s.refs.length) continue;
      nPair++;
      const seen = new Set();
      for (const [title, author] of s.refs) {
        if (seen.has(title)) continue;
        seen.add(title);
        const e = counts.get(title) || { title, author, n: 0 };
        e.n++;
        counts.set(title, e);
      }
    }
    if (!nPair || !base.nCourses) return [];
    const out = [];
    for (const e of counts.values()) {
      if (e.n < 2) continue;
      const overall = base.counts.get(e.title) || e.n;
      e.nPair = nPair;
      e.ratio = (e.n / nPair) / (overall / base.nCourses);
      out.push(e);
    }
    if (CITATION_RANKING === "distinct")
      return out
        .filter((e) => e.ratio > 1)
        .sort((a, b) => b.ratio - a.ratio || b.n - a.n)
        .slice(0, limit);
    return out
      .sort((a, b) => b.n - a.n || b.ratio - a.ratio)
      .slice(0, limit);
  }

  // ── Color (theme-aware via color-mix on the palette custom properties) ───
  function divColor(t) { // t in [-1, 1]
    const pole = t >= 0 ? "--div-pos" : "--div-neg";
    const pct = Math.min(100, Math.round(Math.abs(t) * 100));
    return `color-mix(in oklab, var(${pole}) ${pct}%, var(--div-mid))`;
  }
  function seqColor(t, baseVar) { // t in [0, 1]; baseVar defaults to the accent color
    const pct = Math.round(6 + Math.min(1, t) * 92);
    // srgb, not oklab: oklab's interpolation can overshoot into an
    // unexpectedly darker/more saturated color right near the low end of a
    // light-to-saturated mix like this one, showing up as a dark patch at
    // the "rarely" end of the legend instead of a smooth light tint.
    return `color-mix(in srgb, var(${baseVar || "--accent"}) ${pct}%, var(--surface-1))`;
  }
  const inkFor = (strength) => (strength > 0.62 ? "#ffffff" : "var(--text-primary)");

  // ── Tooltip ──────────────────────────────────────────────────────────────
  function showTooltip(x, y, build) {
    tooltip.replaceChildren();
    build(tooltip);
    tooltip.hidden = false;
    const pad = 14;
    const r = tooltip.getBoundingClientRect();
    let left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    tooltip.style.left = Math.max(4, left) + "px";
    tooltip.style.top = Math.max(4, top) + "px";
  }
  function hideTooltip() { tooltip.hidden = true; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTooltip(); });
  document.addEventListener("scroll", hideTooltip, true);

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Highlighted spans: yellow-orange for verb language, yellow-green for keywords
  const hlVerb = (text) => el("span", "hl-verb", text);
  const hlKw = (text) => el("span", "hl-kw", text);

  // A heatmap cell's "verb × keyword" pairing, highlighted the same way as
  // the pairing view's own <h2> -- used as the tooltip title so the pairing
  // reads first, with its numbers underneath as detail. Same size as
  // .tt-value but deliberately not bold -- the highlight colors alone are
  // enough emphasis.
  function pairTitle(v, k) {
    const wrap = el("div", "tt-pair-title");
    wrap.appendChild(hlVerb(vName(v)));
    wrap.appendChild(document.createTextNode(" verbs × "));
    wrap.appendChild(hlKw(k));
    wrap.appendChild(document.createTextNode(" keywords"));
    return wrap;
  }

  function attachHover(node, build) {
    node.addEventListener("pointermove", (e) => showTooltip(e.clientX, e.clientY, build));
    node.addEventListener("pointerleave", hideTooltip);
    node.addEventListener("focus", () => {
      const r = node.getBoundingClientRect();
      showTooltip(r.right, r.top, build);
    });
    node.addEventListener("blur", hideTooltip);
  }

  function setCorpusComparison(grid, pair) {
    grid.classList.add("has-comparison");
    for (const cell of grid.querySelectorAll("td.cell"))
      cell.classList.toggle("is-comparison-match", cell.dataset.comparisonPair === pair);
  }

  function clearCorpusComparison(grid) {
    grid.classList.remove("has-comparison");
    for (const cell of grid.querySelectorAll("td.cell"))
      cell.classList.remove("is-comparison-match");
  }

  // ── Category words helpers ───────────────────────────────────────────────
  const topWords = (list, n) => (list || []).slice(0, n).map((w) => w[0]);
  const allWords = (list) => (list || []).map((w) => w[0]);

  function headerCell(tag, displayName, wordList, categoryLabel, hlClass) {
    const th = el(tag);
    th.setAttribute("tabindex", "0");
    const name = el("div", "cat-name");
    name.appendChild(el("span", hlClass, displayName));
    th.appendChild(name);
    const top4 = topWords(wordList, 4);
    if (top4.length) th.appendChild(el("div", "cat-words", top4.join(", ") + "…"));
    attachHover(th, (tt) => {
      const title = el("div", "tt-pair-title");
      title.appendChild(el("span", hlClass, displayName));
      title.appendChild(document.createTextNode(" " + categoryLabel));
      tt.appendChild(title);
      const words = allWords(wordList);
      tt.appendChild(el("div", "tt-label tt-words",
        words.length ? words.join(", ") : "No words recorded."));
    });
    return th;
  }

  // ── Breadcrumb + view switching ──────────────────────────────────────────
  // The header (.page-col) is kept the same width as whichever view is
  // CURRENTLY showing, so the two always line up. An earlier version instead
  // forced every view to a single shared width (taken from the corpus
  // heatmap) so switching views wouldn't visibly resize the page -- but the
  // verb x keyword pairing view (view-cell) is naturally wider than the
  // heatmap, so forcing it into that narrower width made its own content
  // overflow, which is what the .view overflow-x: auto was papering over
  // with a horizontal scrollbar. Letting each view size itself (plain CSS
  // width: fit-content, no JS-forced width) means nothing is ever narrower
  // than its own content, so that scrollbar never needs to appear; the
  // tradeoff is that the page can now change width when switching to/from
  // view-cell specifically, which reads better than a scrollbar would.
  const pageCol = $(".page-col");
  let widthObserver = null;

  function syncPageWidth() {
    const ref = state.view === "syllabus" ? viewSyl : state.view === "cell" ? viewCell : viewCorpus;
    // ResizeObserver, not a one-shot rAF measurement: this page can be
    // sitting in a background (display: none) iframe tab when it first
    // loads -- e.g. this isn't the outer shell's default-active tab -- and
    // a hidden element always measures 0 width. A single rAF check that
    // gives up on 0 left .page-col stuck at its plain CSS fit-content sizing
    // forever (misaligned, since it can size differently from the view),
    // because nothing ever prompted a re-measure once the tab actually
    // became visible. ResizeObserver instead keeps watching this view and
    // re-applies its width to .page-col on every actual size change --
    // whenever that happens to be, including a later browser window resize.
    if (widthObserver) widthObserver.disconnect();
    widthObserver = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w) pageCol.style.width = w + "px";
    });
    widthObserver.observe(ref);
  }

  function setView(view) {
    state.view = view;
    viewCorpus.hidden = view !== "corpus";
    viewCell.hidden = view !== "cell";
    viewSyl.hidden = view !== "syllabus";
    updateSyllabusPicker();
    const toggle = $("#metric-toggle");
    if (toggle) toggle.style.visibility = view === "corpus" ? "visible" : "hidden";
    hideTooltip();
    renderBreadcrumb();
    syncPageWidth();
  }

  function updateSyllabusPicker() {
    const mode = CORPUS_MODE_BY_ID.get(state.corpusMode);
    const panel = mode.macroCategory
      ? CORPUS_PANELS.find((candidate) => candidate.macroCategory === mode.macroCategory)
      : null;
    const syllabi = mode.id === "all"
      ? sortedSyllabi
      : panel
        ? sortedSyllabi.filter(({ syllabus }) => panel.syllabi.includes(syllabus))
        : [];
    const selectedIndex = state.corpusSyllabusIndex
      ?? (state.view === "syllabus" ? state.syl : null);
    pickerLabel.hidden = mode.id === "compared";
    picker.replaceChildren(new Option("— choose —", ""), new Option("All", "all"));
    for (const { syllabus, index } of syllabi) {
      const option = new Option(syllabus.s, String(index));
      option.selected = selectedIndex === index;
      picker.appendChild(option);
    }
    if (selectedIndex !== null && !syllabi.some(({ index }) => index === selectedIndex))
      picker.value = "";
  }

  // ── Navigation history (so the browser back/forward buttons step back
  // through corpus -> cell -> syllabus the same way clicking through the
  // heatmap does) ────────────────────────────────────────────────────────
  // Each of these renders the view AND (when push is true, i.e. the user
  // just clicked something) records it as a new history entry; popstate
  // replays the same functions with push=false so restoring never re-pushes.
  function goCorpus(push, mode = state.corpusMode, syllabusIndex = null) {
    state.corpusMode = CORPUS_MODE_BY_ID.has(mode) ? mode : "compared";
    state.corpusSyllabusIndex = syllabusIndex;
    state.cell = null; state.syl = null;
    renderCorpus();
    setView("corpus");
    if (push) pushHistory();
  }
  function goCell(v, k, push) {
    state.cell = [v, k];
    renderCellView(v, k);
    setView("cell");
    if (push) pushHistory();
  }
  function goSyllabus(i, push) {
    state.syl = i;
    renderSylView(i);
    setView("syllabus");
    if (push) pushHistory();
  }
  function hashFor() {
    if (state.view === "cell" && state.cell)
      return "#cell/" + encodeURIComponent(state.cell[0]) + "/" + encodeURIComponent(state.cell[1]);
    if (state.view === "syllabus" && state.syl !== null) return "#syllabus/" + state.syl;
    if (state.corpusSyllabusIndex !== null)
      return "#corpus/" + state.corpusMode + "/syllabus/" + state.corpusSyllabusIndex;
    return state.corpusMode === "compared" ? "#corpus" : "#corpus/" + state.corpusMode;
  }
  function pushHistory() {
    const hash = hashFor();
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
  function applyHash() {
    const parts = location.hash.slice(1).split("/");
    if (parts[0] === "corpus" && parts.length <= 2) {
      const mode = parts.length === 2 && CORPUS_MODE_BY_ID.has(parts[1])
        ? parts[1]
        : "compared";
      goCorpus(false, mode);
      return;
    }
    if (parts[0] === "corpus" && parts.length === 4 && parts[2] === "syllabus") {
      const mode = CORPUS_MODE_BY_ID.get(parts[1]);
      const index = Number(parts[3]);
      if (mode && Number.isInteger(index) && corpusModeForSyllabus(index)?.id === mode.id) {
        goCorpus(false, mode.id, index);
        return;
      }
    }
    if (parts[0] === "cell" && parts.length === 3) {
      const v = decodeURIComponent(parts[1]), k = decodeURIComponent(parts[2]);
      if (VERB_CATS.includes(v) && KW_CATS.includes(k)) { goCell(v, k, false); return; }
    } else if (parts[0] === "syllabus" && parts.length === 2) {
      const i = Number(parts[1]);
      if (Number.isInteger(i) && D.syllabi[i]) { goSyllabus(i, false); return; }
    }
    goCorpus(false);
  }

  function renderBreadcrumb() {
    breadcrumb.replaceChildren();
    for (const mode of CORPUS_MODES) {
      const link = el("a", "category-nav-link", mode.label);
      link.href = mode.id === "compared" ? "#corpus" : "#corpus/" + mode.id;
      link.setAttribute("aria-current", state.corpusMode === mode.id ? "page" : "false");
      link.classList.toggle("active", state.corpusMode === mode.id);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        goCorpus(true, mode.id);
      });
      breadcrumb.appendChild(link);
    }
    if (state.view === "cell" && state.cell) {
      breadcrumb.appendChild(el("span", "sep", "›"));
      breadcrumb.appendChild(el("span", null, vName(state.cell[0]) + " × " + state.cell[1]));
    } else if (state.view === "syllabus" && state.syl !== null) {
      if (state.cell) {
        breadcrumb.appendChild(el("span", "sep", "›"));
        const cellLink = el("a", null, vName(state.cell[0]) + " × " + state.cell[1]);
        cellLink.setAttribute("tabindex", "0");
        cellLink.addEventListener("click", () => { goCell(state.cell[0], state.cell[1], true); });
        cellLink.addEventListener("keydown", (e) => { if (e.key === "Enter") cellLink.click(); });
        breadcrumb.appendChild(cellLink);
      }
      breadcrumb.appendChild(el("span", "sep", "›"));
      breadcrumb.appendChild(el("span", null, "Course " + D.syllabi[state.syl].s));
    }
  }

  // ── Legend helper: gradient bar with labels aligned underneath it ────────
  function legend(gradientCss, leftLabel, midLabel, rightLabel) {
    const wrap = el("div", "legend");
    const bar = el("div", "bar");
    bar.style.background = gradientCss;
    wrap.appendChild(bar);
    const labels = el("div", "legend-labels");
    labels.appendChild(el("span", "l-left", leftLabel));
    if (midLabel !== null) labels.appendChild(el("span", "l-mid", midLabel));
    labels.appendChild(el("span", "l-right", rightLabel));
    wrap.appendChild(labels);
    return wrap;
  }

  // Wrap a heatmap table with visible X ("Keywords") and Y ("Verbs") axis labels
  function withAxes(table) {
    const outer = el("div", "axes-wrap");
    const xLabel = el("div", "axis-x");
    xLabel.appendChild(hlKw("Keywords"));
    outer.appendChild(xLabel);
    const row = el("div", "axes-row");
    const yLabel = el("div", "axis-y");
    yLabel.appendChild(hlVerb("Verbs"));
    row.appendChild(yLabel);
    row.appendChild(table);
    outer.appendChild(row);
    // Per-cell pointerleave (in attachHover) only covers moving between
    // cells; this catches leaving the grid entirely so the tooltip doesn't
    // stay stuck open.
    table.addEventListener("pointerleave", hideTooltip);
    return outer;
  }

  // ── Main grid (all courses combined) ─────────────────────────────────────
  function renderCorpus() {
    viewCorpus.replaceChildren();
    const isPmi = state.metric === "pmi";
    const isCompared = state.corpusMode === "compared";
    const selectedMode = CORPUS_MODE_BY_ID.get(state.corpusMode);
    const selectedSyllabus = state.corpusSyllabusIndex === null
      ? null
      : D.syllabi[state.corpusSyllabusIndex];
    const categoryPanel = selectedMode.macroCategory
      ? CORPUS_PANELS.find((panel) => panel.macroCategory === selectedMode.macroCategory)
      : null;
    const panels = isCompared
      ? CORPUS_PANELS
      : [{
        row: 0,
        column: 0,
        macroCategory: selectedMode.id === "all" ? "All categories" : selectedMode.macroCategory,
        verbs: VERB_CATS,
        keywords: KW_CATS,
        syllabi: selectedSyllabus
          ? [selectedSyllabus]
          : selectedMode.id === "all" ? D.syllabi : categoryPanel.syllabi,
        corpus: selectedMode.id === "all"
          ? D.corpus
          : selectedSyllabus
            ? aggregateSyllabi([selectedSyllabus])
            : categoryPanel.corpus,
      }];

    let vmaxLog = 0, vmaxCount = 0;
    for (const panel of panels) {
      for (const v of panel.verbs) for (const k of panel.keywords) {
        const c = corpusCell(v, k, panel.corpus);
        if (c.a >= MIN_COOCCUR && c.ratio !== null)
          vmaxLog = Math.max(vmaxLog, Math.abs(log2(c.ratio)));
        vmaxCount = Math.max(vmaxCount, c.a);
      }
    }
    vmaxLog = vmaxLog || 1;
    vmaxCount = vmaxCount || 1;

    const headRow = el("div", "view-head");
    const titleBlock = el("div");
    const corpusH2 = el("h2");
    corpusH2.appendChild(document.createTextNode(
      (isPmi ? "Distinctiveness of Association: " : "Number of Sentences: ")));
    corpusH2.appendChild(el("strong", null, panels.length === 1
      ? panels[0].macroCategory
      : "by macro-category"));
    titleBlock.appendChild(corpusH2);
    titleBlock.appendChild(el("p", "view-sub", isPmi
      ? "Each cell compares how often the two word categories share a sentence " +
        (isCompared ? "within that panel's assigned syllabi" : "within the selected dataset") + " with how " +
        "often they would by pure chance. Magenta means positive association (2× = twice as often as chance); yellow means " +
        "negative association (0.5× = half as often as chance); neutral means independence (1×). Hover to see " +
        (isCompared ? "the courses from that panel's category" : "the courses in this dataset") +
        " that use a pairing most and the texts they cite; click to see more information about that pairing."
      : "The plain count of sentences where the two groups appear together. Read this " +
        "alongside the distinctiveness view: a striking pairing backed by only a handful " +
        "of sentences is a thinner finding."));
    if (selectedSyllabus)
      titleBlock.appendChild(el("p", "view-sub corpus-filter-note",
        `Showing only ${selectedSyllabus.s} from ${selectedMode.macroCategory}.`));
    headRow.appendChild(titleBlock);
    headRow.appendChild(isPmi
      ? legend(`linear-gradient(to right, var(--div-neg), var(--div-mid) 50%, var(--div-pos))`,
               "negative association", "no association", "positive association")
      : legend(`linear-gradient(to right, var(--surface-1), var(--accent))`,
               "0 sentences", null, vmaxCount + " sentences"));
    viewCorpus.appendChild(headRow);

    const xAxis = el("div", "corpus-axis-x");
    xAxis.appendChild(hlKw("Keywords"));
    const matrix = el("div", "corpus-grid");
    if (!isCompared) matrix.classList.add("single-panel");
    for (const panel of panels)
      matrix.appendChild(renderCorpusPanel(panel, isPmi, vmaxLog, vmaxCount, matrix, isCompared));

    const yAxis = el("div", "corpus-axis-y");
    yAxis.appendChild(hlVerb("Verbs"));
    const chart = el("div", "corpus-chart");
    chart.appendChild(yAxis);
    chart.appendChild(matrix);
    viewCorpus.appendChild(xAxis);
    viewCorpus.appendChild(chart);
  }

  function renderCorpusPanel(panel, isPmi, vmaxLog, vmaxCount, matrix, enableComparison = true) {
    const section = el("section", "corpus-panel");
    section.classList.add(panel.row === 0 ? "corpus-panel-top" : "corpus-panel-bottom");
    section.classList.add(panel.column === 0 ? "corpus-panel-left" : "corpus-panel-right");
    section.setAttribute("aria-label", `${panel.macroCategory} heatmap`);
    section.appendChild(el("h3", "corpus-panel-title", panel.macroCategory));
    section.appendChild(el("p", "corpus-panel-count",
      `${panel.syllabi.length} ${panel.syllabi.length === 1 ? "document" : "documents"}`));
    if (!panel.syllabi.length)
      section.appendChild(el("p", "corpus-panel-empty", "No documents assigned yet"));

    const table = el("table", "heatmap");
    const colgroup = el("colgroup");
    const labelColumn = el("col", "category-column");
    colgroup.appendChild(labelColumn);
    for (let i = 0; i < panel.keywords.length; i++)
      colgroup.appendChild(el("col", "keyword-column"));
    table.appendChild(colgroup);

    const thead = el("thead");
    const hr = el("tr");
    if (panel.column === 0) {
      hr.appendChild(el("th"));
    } else {
      hr.appendChild(el("th", "category-spacer"));
    }
    for (const k of panel.keywords)
      hr.appendChild(headerCell("th", k, D.kw_words[k], "keywords", "hl-kw"));
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const v of panel.verbs) {
      const tr = el("tr");
      if (panel.column === 0) {
        tr.appendChild(headerCell("th", vName(v), D.verb_words[v], "verbs", "hl-verb"));
      } else {
        const label = headerCell("th", vName(v), D.verb_words[v], "verbs", "hl-verb");
        label.classList.add("category-duplicate");
        tr.appendChild(label);
      }
      for (const k of panel.keywords) {
        const c = corpusCell(v, k, panel.corpus);
        const td = el("td", "cell");
        if (!panel.syllabi.length) {
          td.classList.add("no-data");
          td.setAttribute("aria-hidden", "true");
        } else {
          td.setAttribute("tabindex", "0");
          td.dataset.comparisonPair = key(v, k);
          if (enableComparison) {
            td.addEventListener("pointerenter", () => setCorpusComparison(matrix, td.dataset.comparisonPair));
            td.addEventListener("pointerleave", () => clearCorpusComparison(matrix));
            td.addEventListener("focus", () => setCorpusComparison(matrix, td.dataset.comparisonPair));
            td.addEventListener("blur", () => clearCorpusComparison(matrix));
          }
        }
        if (!panel.syllabi.length) {
          td.textContent = "";
        } else if (c.a < MIN_COOCCUR || c.ratio === null) {
          td.classList.add("na");
          td.textContent = "·";
        } else if (isPmi) {
          const t = log2(c.ratio) / vmaxLog;
          td.style.background = divColor(t);
          td.style.color = "var(--div-ink)";
          td.textContent = fmtRatio(c.ratio);
        } else {
          const t = c.a / vmaxCount;
          td.style.background = seqColor(t);
          td.style.color = inkFor(t);
          td.textContent = String(c.a);
        }
        if (panel.syllabi.length) {
          const activate = () => { goCell(v, k, true); };
          td.addEventListener("click", activate);
          td.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
          attachHover(td, (tt) => {
            tt.appendChild(pairTitle(v, k));
            tt.appendChild(el("div", "tt-label",
              c.ratio === null ? "never appear together"
                : fmtRatio(c.ratio) + " as often as chance · " + c.a + " sentences"));
            const top = topSyllabi(v, k, 10, panel.syllabi);
            if (top.length) {
              tt.appendChild(el("hr"));
              tt.appendChild(el("div", "tt-label", "Courses in this category that use this pairing most (sentences per 100):"));
              const ul = el("ul", "tt-list");
              for (const r of top) {
                const li = el("li");
                li.appendChild(el("span", "name", r.s.s));
                li.appendChild(el("span", null, r.rate.toFixed(1)));
                ul.appendChild(li);
              }
              tt.appendChild(ul);
            }
            const cites = topCitations(v, k, 3, panel.syllabi);
            if (cites.length) {
              tt.appendChild(el("hr"));
              tt.appendChild(el("div", "tt-label", "Texts these courses often cite:"));
              for (const e of cites) {
                const title = e.title.length > 60 ? e.title.slice(0, 57) + "…" : e.title;
                tt.appendChild(el("div", "tt-label tt-cite", title + " (" + e.n + " courses)"));
              }
            }
          });
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    table.addEventListener("pointerleave", hideTooltip);
    section.appendChild(table);
    return section;
  }

  // ── Pairing view (one verb group × one keyword group, over time) ─────────
  function renderCellView(v, k) {
    viewCell.replaceChildren();
    const c = corpusCell(v, k);
    const h2 = el("h2");
    h2.appendChild(document.createTextNode("Pairing: "));
    h2.appendChild(hlVerb(vName(v)));
    h2.appendChild(document.createTextNode(" verbs × "));
    h2.appendChild(hlKw(k));
    h2.appendChild(document.createTextNode(" keywords"));
    viewCell.appendChild(h2);
    viewCell.appendChild(el("p", "view-sub cell-intro",
      "Across all courses, these two word categories share " + c.a + " sentences" +
      (c.ratio !== null ? ". Their associaton occurs " + fmtRatio(c.ratio) + " as often as pure coincidence" : "") + "."));

    const rates = D.syllabi.map((s, i) => ({ s, i, ...sylRate(s, v, k) }));
    const used = rates.filter((r) => r.a > 0);
    const vmax = Math.max(...used.map((r) => r.rate), 0.001);

    // Chart and word lists sit side by side
    const flex = el("div", "pair-flex");

    const chartCol = el("div", "pair-chart-col");
    chartCol.appendChild(el("h3", "table-title chart-title", "Pairing use over time"));
    chartCol.appendChild(el("p", "view-sub chart-note",
      "Each column is a year, and each block is one course from that year that uses this pairing." +
      " A short, dark column means there are few courses that use this pairing frequently; a tall, light column means that there are many courses that use this pairing moderately." +
      " The number under each year shows how many of that year's courses use the pairing at least once. Click a block to see that course's full profile."));
    const barsRow = el("div", "bars-row");
    const years = [...new Set(D.syllabi.map((s) => s.y))].sort();
    // Popular pairings can involve nearly every course in a year; shrink the
    // blocks so the tallest column stays around 450px instead of growing unbounded.
    const maxPerYear = Math.max(1, ...years.map(
      (y) => used.filter((r) => r.s.y === y).length));
    const segH = Math.max(4, Math.min(13, Math.floor(450 / maxPerYear) - 2));
    const segGap = segH < 7 ? "1px" : "2px";
    for (const y of years) {
      const inYear = used.filter((r) => r.s.y === y).sort((a, b) => b.rate - a.rate);
      const total = D.syllabi.filter((s) => s.y === y).length;
      const col = el("div", "bar-col");
      const bar = el("div", "bar-stack");
      bar.style.gap = segGap;
      for (const r of inYear) {
        const seg = el("button", "seg");
        seg.type = "button";
        seg.style.height = segH + "px";
        seg.style.background = seqColor(r.rate / vmax, "--div-pos");
        seg.setAttribute("aria-label",
          "Course " + r.s.s + ": " + r.a + " sentences with this pairing");
        attachHover(seg, (tt) => {
          tt.appendChild(el("div", "tt-value", "Course " + r.s.s));
          tt.appendChild(el("div", "tt-label",
            r.rate.toFixed(1) + " sentences per 100 (" + r.a + " of " + r.s.n + "),"));
          // minA=1: this bar is already only shown for a >= 1, so the ratio
          // should always be here too, not just for a >= MIN_SYL_COOCCUR.
          const vs = sylVsAverage(r.s, v, k, 1);
          if (vs !== null) tt.appendChild(el("div", "tt-label",
            "about " + fmtRatio(vs) + " the average course"));
        });
        seg.addEventListener("click", () => { goSyllabus(r.i, true); });
        bar.appendChild(seg);
      }
      col.appendChild(bar);
      col.appendChild(el("div", "bar-label", String(y)));
      col.appendChild(el("div", "bar-sublabel", inYear.length + " of " + total));
      barsRow.appendChild(col);
    }
    chartCol.appendChild(barsRow);
    chartCol.appendChild(legend(
      // Straight two-stop gradient instead of routing through seqColor()'s
      // color-mix() -- nesting color-mix() results as gradient stops was
      // producing a visibly wrong (dark) patch near the "rarely" end in
      // testing, so the gradient now interpolates natively between the two
      // plain custom properties instead.
      `linear-gradient(to right, var(--surface-1), var(--div-pos))`,
      "rarely", null, "up to " + vmax.toFixed(1) + " sentences per 100"));

    // Stacked directly under the chart (rather than as a sibling of the
    // whole flex row) so it stays close by regardless of how tall the
    // citations list in the right-hand column grows.
    const top = rates.filter((r) => r.a >= MIN_SYL_COOCCUR)
      .sort((x, y) => y.rate - x.rate).slice(0, 10);
    if (top.length) {
      chartCol.appendChild(el("h3", "table-title rank-title", "Courses that use this pairing most"));
      const rankTable = el("table", "rank");
      const thr = el("tr");
      for (const h of ["Course", "Year", "Sentences with both", "Total sentences", "Per 100 sentences", "Compared to average"])
        thr.appendChild(el("th", null, h));
      rankTable.appendChild(thr);
      for (const r of top) {
        const tr = el("tr");
        const link = el("td", "syl-link", r.s.s);
        link.setAttribute("tabindex", "0");
        const go = () => { goSyllabus(r.i, true); };
        link.addEventListener("click", go);
        link.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        tr.appendChild(link);
        tr.appendChild(el("td", null, String(r.s.y)));
        tr.appendChild(el("td", null, String(r.a)));
        tr.appendChild(el("td", null, String(r.s.n)));
        tr.appendChild(el("td", null, r.rate.toFixed(1)));
        const vs = sylVsAverage(r.s, v, k);
        tr.appendChild(el("td", null, vs === null ? "—" : fmtRatio(vs)));
        rankTable.appendChild(tr);
      }
      chartCol.appendChild(rankTable);
    }
    flex.appendChild(chartCol);

    // The words behind the two categories
    const words = el("div", "pair-words");
    const vw = el("p", "word-list");
    const vwLabel = el("div", "word-list-label");
    vwLabel.appendChild(hlVerb(vName(v)));
    vwLabel.appendChild(document.createTextNode(" verbs"));
    vw.appendChild(vwLabel);
    vw.appendChild(document.createTextNode(allWords(D.verb_words[v]).join(", ") || "—"));
    words.appendChild(vw);
    const kw = el("p", "word-list");
    const kwLabel = el("div", "word-list-label");
    kwLabel.appendChild(hlKw(k));
    kwLabel.appendChild(document.createTextNode(" keywords"));
    kw.appendChild(kwLabel);
    kw.appendChild(document.createTextNode(allWords(D.kw_words[k]).join(", ") || "—"));
    words.appendChild(kw);

    // Texts these courses cite unusually often, in the same right-hand column
    const cites = topCitations(v, k, 10);
    if (cites.length) {
      words.appendChild(el("h3", "table-title cites-title", "Texts these courses often cite"));
      const ul = el("ul", "refs");
      for (const e of cites) {
        const li = el("li");
        li.appendChild(el("span", "ref-title", e.title));
        if (e.author) li.appendChild(el("span", "ref-author", " — " + e.author));
        li.appendChild(el("span", "ref-count",
          " · cited by " + e.n + " of these " + e.nPair + " courses"));
        ul.appendChild(li);
      }
      words.appendChild(ul);
    }
    flex.appendChild(words);

    viewCell.appendChild(flex);
  }

  // ── Single-course view ───────────────────────────────────────────────────
  function renderSylView(i) {
    viewSyl.replaceChildren();
    const s = D.syllabi[i];

    let vmaxLog = 0;
    const vs = {};
    for (const v of VERB_CATS) for (const k of KW_CATS) {
      const r = sylCell(s, v, k).ratio;
      vs[key(v, k)] = r;
      if (r !== null) vmaxLog = Math.max(vmaxLog, Math.abs(log2(r)));
    }
    vmaxLog = vmaxLog || 1;

    const headRow = el("div", "view-head");
    const titleBlock = el("div");
    const h2 = el("h2");
    h2.appendChild(document.createTextNode("Distinctiveness of Association: "));
    h2.appendChild(el("strong", null, "syllabus " + s.s));
    h2.appendChild(document.createTextNode(" "));
    // s.t is the syllabus's filename stem (e.g. "2020cprize-05nb"). drive_ids.js
    // maps it to the Google Drive file ID of the full submission PDF (e.g.
    // "2020cprize-05.pdf" -- no "nb" suffix) when one exists on the shared
    // Drive. If drive_ids.js has been populated for it, link straight to the
    // file; otherwise fall back to a Drive search for the filename.
    const driveId = (window.DRIVE_IDS || {})[s.t];
    const drive = el("a", "drive-link", "open PDF ↗");
    drive.href = driveId
      ? "https://drive.google.com/file/d/" + driveId + "/view"
      : "https://drive.google.com/drive/search?q=" + encodeURIComponent(s.t);
    drive.target = "_blank";
    drive.rel = "noopener";
    drive.title = driveId
      ? "Opens this syllabus PDF directly — requires Drive access"
      : "Searches the shared Google Drive for this syllabus — requires Drive access";
    h2.appendChild(drive);
    titleBlock.appendChild(h2);
    titleBlock.appendChild(el("p", "view-sub",
      "A " + s.y + " course, " + s.n + " sentences long. Each cell displays how many times more " +
      "often the two groups share a sentence in this course than they'd be expected to by " +
      "pure coincidence. Red signifies positive association, blue signifies negative association. A dot means the pairing shows " +
      "up too rarely in this course to judge. Click any cell to see that pairing across all courses."));
    if (!corpusModeForSyllabus(i))
      titleBlock.appendChild(el("p", "view-sub macro-category-status",
        "This course has not been assigned to a macro-category yet, so its individual course view is shown."));
    headRow.appendChild(titleBlock);
    headRow.appendChild(legend(
      `linear-gradient(to right, var(--div-neg), var(--div-mid) 50%, var(--div-pos))`,
      "negative association", "no association", "positive association"));
    viewSyl.appendChild(headRow);

    const table = el("table", "heatmap");
    const thead = el("thead");
    const hr = el("tr");
    hr.appendChild(el("th"));
    for (const k of KW_CATS)
      hr.appendChild(headerCell("th", k, D.kw_words[k], "keywords", "hl-kw"));
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const v of VERB_CATS) {
      const tr = el("tr");
      tr.appendChild(headerCell("th", vName(v), D.verb_words[v], "verbs", "hl-verb"));
      for (const k of KW_CATS) {
        const r = vs[key(v, k)];
        const { a, rate } = sylRate(s, v, k);
        const td = el("td", "cell");
        td.setAttribute("tabindex", "0");
        if (r === null) {
          td.classList.add("na");
          td.textContent = "·";
        } else {
          const t = log2(r) / vmaxLog;
          td.style.background = divColor(t);
          td.style.color = "var(--div-ink)";
          td.textContent = fmtRatio(r);
        }
        const activate = () => { goCell(v, k, true); };
        td.addEventListener("click", activate);
        td.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(); } });
        const corpus = corpusCell(v, k);
        attachHover(td, (tt) => {
          tt.appendChild(pairTitle(v, k));
          tt.appendChild(el("div", "tt-label",
            r === null ? "too rare to judge" : fmtRatio(r) + " as often as chance"));
          const vsAvg = sylVsAverage(s, v, k);
          const vsLine = el("div", "tt-label");
          vsLine.appendChild(document.createTextNode((vsAvg === null ? "—" : fmtRatio(vsAvg)) + " as often as "));
          vsLine.appendChild(el("span", null, "all syllabi"));
          vsLine.appendChild(document.createTextNode(
            ": " + a + " sentences (" + rate.toFixed(1) + " per 100) vs " +
            ((corpus.a / corpus.n) * 100).toFixed(1) + " per 100"));
          tt.appendChild(vsLine);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    viewSyl.appendChild(withAxes(table));

    // Texts this course cites
    viewSyl.appendChild(el("h3", "table-title", "Texts cited in this course"));
    if (s.refs && s.refs.length) {
      const ul = el("ul", "refs");
      for (const [title, author] of s.refs) {
        const li = el("li");
        li.appendChild(el("span", "ref-title", title));
        if (author) li.appendChild(el("span", "ref-author", " — " + author));
        ul.appendChild(li);
      }
      viewSyl.appendChild(ul);
    } else {
      viewSyl.appendChild(el("p", "view-sub", "No reading list could be extracted from this syllabus."));
    }
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  for (const btn of document.querySelectorAll("#metric-toggle button")) {
    btn.addEventListener("click", () => {
      state.metric = btn.dataset.metric;
      for (const b of document.querySelectorAll("#metric-toggle button"))
        b.classList.toggle("active", b === btn);
      renderCorpus();
    });
  }

  const moreInfoToggle = $("#more-info-toggle");
  const moreInfo = $("#more-info");
  moreInfoToggle.addEventListener("click", () => {
    const showing = moreInfo.hidden;
    moreInfo.hidden = !showing;
    moreInfoToggle.textContent = showing ? "Less information" : "More information";
  });

  picker.addEventListener("change", () => {
    if (picker.value === "") return;
    if (picker.value === "all") {
      const activeMode = CORPUS_MODE_BY_ID.get(state.corpusMode);
      goCorpus(true, activeMode.macroCategory ? activeMode.id : "compared");
      return;
    }
    const index = Number(picker.value);
    const mode = corpusModeForSyllabus(index);
    if (mode) {
      goCorpus(true, mode.id, index);
    } else {
      state.cell = null;
      goSyllabus(index, true);
    }
  });

  // Tell the parent shell (if embedded in one -- see web/index.html) to hide
  // its tab bar the moment the user scrolls down at all, and bring it back
  // on any scroll-up, instead of it sitting fixed above the content the
  // whole time.
  if (window.parent !== window) {
    let lastY = window.scrollY, lastDir = "up", ticking = false, lastFlip = 0;
    // A 1px delta is sensitive enough to react to a small scroll, but real
    // scroll input (trackpad momentum especially, right as it decelerates)
    // isn't perfectly monotonic frame to frame -- without this cooldown,
    // that sub-pixel jitter flips direction back and forth rapidly, which
    // reads as the tab bar hiding, flickering, and reappearing instead of
    // cleanly hiding once. The cooldown doesn't add perceptible delay to the
    // FIRST flip after a real direction change, only to repeated flips.
    const FLIP_COOLDOWN_MS = 200;
    const postDir = (dir) => {
      if (dir === lastDir) return; // only message the parent on an actual change
      const now = performance.now();
      if (now - lastFlip < FLIP_COOLDOWN_MS) return;
      lastFlip = now;
      lastDir = dir;
      // "*": the parent shell identifies a trusted sender via ev.source
      // (see web/index.html), not by matching this targetOrigin, so this
      // doesn't need to (and shouldn't try to) predict the parent's origin.
      window.parent.postMessage({ type: "gc-scroll", dir }, "*");
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        // The bar reappears ONLY once the user is actually back at the top
        // (y <= 6), not on any small upward scroll partway down -- so it
        // hides on the way down and stays out of the way even while
        // scrolling back and forth mid-page, only returning when you've
        // scrolled all the way back to the start of the content.
        if (y <= 6) {
          postDir("up");
        } else {
          const delta = y - lastY;
          if (delta > 1) postDir("down");
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  window.addEventListener("popstate", applyHash);
  viewCorpus.replaceChildren(el("p", "view-sub macro-category-status", "Loading macro-categories.csv…"));
  loadMacroCategories()
    .then(applyHash)
    .catch((error) => {
      console.error("Could not initialize the macro-category heatmaps.", error);
      viewCorpus.replaceChildren(el("p", "view-sub macro-category-status",
        `Could not load macro-categories.csv: ${error.message}`));
      setView("corpus");
    });
})();

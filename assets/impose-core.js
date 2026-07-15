/* Impose — pure page-ordering math for booklet imposition.
 *
 * Turns a reader-order page count into physical sheets. Four schemes:
 *   saddle     — single signature: all sheets nested and folded together
 *                (1 fold, 4 pages/sheet: 2 pages/side, side by side)
 *   quire4     — each sheet folds independently into its own 4-side quire
 *                (1 fold, 4 pages/sheet: 2 pages/side, side by side)
 *   miniquire8 — mini-quire: 2x2 grid per side (8 pages/sheet), cut into
 *                4 quarter-leaves along both center creases, stacked and
 *                stapled (no folding — each leaf is a flat recto/verso card)
 *   zinefold8  — single-sheet zine fold: 2x4 grid, one side only (8 pages/
 *                sheet, back stays blank), one short cut at the center fold,
 *                pops open into a booklet with no staples. Page/rotation
 *                layout verified against a working reference implementation
 *                (Marek Bennett's 1-sheet method: marekbennett.com/1sheet,
 *                make-a-zine.github.io).
 * Direction 'rtl' puts page 1 toward the right (spine folds/cuts on the
 * right; the booklet opens right-to-left); 'ltr' mirrors it.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Impose = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMES = ["saddle", "quire4", "miniquire8", "zinefold8"];

  // Target sheet sizes, landscape orientation (width > height), in points.
  // These are what actually gets fed into the printer — source content is
  // scaled to fit, so the choice is independent of the source PDF's own
  // page size (see facePlacements' opts.paperSize).
  const PAPER_SIZES = {
    a4: { width: 841.89, height: 595.28 },
    letter: { width: 792, height: 612 },
    a5: { width: 595.28, height: 419.53 },
    halfLetter: { width: 612, height: 396 },
  };

  // Per-scheme face grid: rows x cols of source pages per printed face.
  // hasBack:false means the scheme prints one side only (no duplex).
  const GRID = {
    saddle: { rows: 1, cols: 2, hasBack: true },
    quire4: { rows: 1, cols: 2, hasBack: true },
    miniquire8: { rows: 2, cols: 2, hasBack: true },
    zinefold8: { rows: 2, cols: 4, hasBack: false },
  };

  // zinefold8's LTR-native front-face layout (row 0 = top), row-major.
  // Verified against make-a-zine.github.io / marekbennett.com/1sheet.
  const ZINE_LTR = [
    { page: 8, rotate180: true }, { page: 1, rotate180: true },
    { page: 2, rotate180: true }, { page: 7, rotate180: true },
    { page: 6, rotate180: false }, { page: 3, rotate180: false },
    { page: 4, rotate180: false }, { page: 5, rotate180: false },
  ];

  function planMiniQuire8(pageCount, direction) {
    const paddedCount = Math.ceil(pageCount / 8) * 8;
    const blanks = [];
    for (let n = pageCount + 1; n <= paddedCount; n++) blanks.push(n);

    // Reading-order column scan per row: right-to-left for RTL.
    const colOrder = direction === "rtl" ? [1, 0] : [0, 1];
    const sheets = [];
    const sheetCount = paddedCount / 8;
    for (let s = 0; s < sheetCount; s++) {
      const b = 8 * s;
      const front = new Array(4);
      const back = new Array(4);
      let leaf = 0;
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < 2; k++) {
          const col = colOrder[k];
          leaf++;
          const cell = row * 2 + col;
          // Leaf is a flat cut card: recto (front) then verso (back).
          front[cell] = b + 2 * leaf - 1;
          back[cell] = b + 2 * leaf;
        }
      }
      sheets.push({ front: front, back: back });
    }
    return { paddedCount: paddedCount, blanks: blanks, sheets: sheets };
  }

  function planZineFold8(pageCount, direction) {
    const paddedCount = Math.ceil(pageCount / 8) * 8;
    const blanks = [];
    for (let n = pageCount + 1; n <= paddedCount; n++) blanks.push(n);

    const sheets = [];
    const sheetCount = paddedCount / 8;
    for (let s = 0; s < sheetCount; s++) {
      const b = 8 * s;
      const front = new Array(8);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          // RTL mirrors the whole fold left-right: physical column c takes
          // the LTR table's column (3 - c) of the same row.
          const srcCol = direction === "rtl" ? 3 - col : col;
          const entry = ZINE_LTR[row * 4 + srcCol];
          front[row * 4 + col] = { page: b + entry.page, rotate180: entry.rotate180 };
        }
      }
      sheets.push({ front: front, back: null });
    }
    return { paddedCount: paddedCount, blanks: blanks, sheets: sheets };
  }

  function plan(opts) {
    const pageCount = opts && opts.pageCount;
    const scheme = opts && opts.scheme;
    const direction = opts && opts.direction;

    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error("pageCount must be a positive integer");
    }
    if (SCHEMES.indexOf(scheme) === -1) {
      throw new Error("scheme must be one of: " + SCHEMES.join(", "));
    }
    if (direction !== "rtl" && direction !== "ltr") {
      throw new Error("direction must be 'rtl' or 'ltr'");
    }

    if (scheme === "miniquire8") return planMiniQuire8(pageCount, direction);
    if (scheme === "zinefold8") return planZineFold8(pageCount, direction);

    const paddedCount = Math.ceil(pageCount / 4) * 4;
    const blanks = [];
    for (let n = pageCount + 1; n <= paddedCount; n++) blanks.push(n);

    const sheets = [];
    const sheetCount = paddedCount / 4;
    for (let s = 0; s < sheetCount; s++) {
      // RTL faces; base/last differ by scheme.
      let front, back;
      if (scheme === "saddle") {
        const P = paddedCount;
        front = [1 + 2 * s, P - 2 * s];
        back = [P - 1 - 2 * s, 2 + 2 * s];
      } else {
        const b = 4 * s;
        front = [b + 1, b + 4];
        back = [b + 3, b + 2];
      }
      if (direction === "ltr") {
        front.reverse();
        back.reverse();
      }
      sheets.push({ front: front, back: back });
    }

    return { paddedCount: paddedCount, blanks: blanks, sheets: sheets };
  }

  // Reverses column order within each row of a flat row-major array,
  // keeping row order intact (used for the back-face flip transform).
  function reverseRowsColumns(flat, rows, cols) {
    const out = new Array(flat.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out[r * cols + c] = flat[r * cols + (cols - 1 - c)];
      }
    }
    return out;
  }

  function resolvePaperSize(paperSize) {
    if (!paperSize) return null;
    if (typeof paperSize === "string") {
      const size = PAPER_SIZES[paperSize];
      if (!size) throw new Error("paperSize must be one of: " + Object.keys(PAPER_SIZES).join(", "));
      return size;
    }
    if (paperSize.width > 0 && paperSize.height > 0) return paperSize;
    throw new Error("paperSize must be a known size name or {width, height}");
  }

  /* Print-ready geometry: one entry per printed face, in print order.
   * Without opts.paperSize, the sheet auto-sizes to the scheme's page grid
   * at native source size (today's original behavior — slots are exactly
   * srcWidth x srcHeight, no scaling). With opts.paperSize (a PAPER_SIZES key
   * or an explicit {width, height} in points), the sheet is fixed at that
   * size and source content is scaled to fit each grid cell and centered —
   * so the printed sheet always matches the paper you actually load,
   * independent of the source PDF's own page size.
   * flip:'long' pre-rotates back faces 180° (mirroring columns within each
   * row) so long-edge duplex comes out upright; blanks are page:null.
   * Schemes with no back face (zinefold8) emit one face per sheet, using
   * their own baked-in per-cell rotation instead of the flip transform.
   */
  function facePlacements(opts) {
    const srcWidth = opts.srcWidth;
    const srcHeight = opts.srcHeight;
    const flip = opts.flip || "short";
    if (!(srcWidth > 0) || !(srcHeight > 0)) {
      throw new Error("srcWidth and srcHeight must be positive");
    }
    if (flip !== "short" && flip !== "long") {
      throw new Error("flip must be 'short' or 'long'");
    }

    const p = plan(opts);
    const grid = GRID[opts.scheme];
    const pageOrNull = (n) => (n > opts.pageCount ? null : n);
    const paperSize = resolvePaperSize(opts.paperSize);

    const cellW = paperSize ? paperSize.width / grid.cols : srcWidth;
    const cellH = paperSize ? paperSize.height / grid.rows : srcHeight;
    const scale = paperSize ? Math.min(cellW / srcWidth, cellH / srcHeight) : 1;
    const renderW = srcWidth * scale;
    const renderH = srcHeight * scale;

    function buildFace(flatEntries, isBack) {
      let entries = flatEntries.map(function (e) {
        return e && typeof e === "object" ? e : { page: e, rotate180: false };
      });
      if (isBack && flip === "long") {
        entries = reverseRowsColumns(entries, grid.rows, grid.cols).map(function (e) {
          return { page: e.page, rotate180: !e.rotate180 };
        });
      }
      return {
        width: cellW * grid.cols,
        height: cellH * grid.rows,
        slots: entries.map(function (e, i) {
          const row = Math.floor(i / grid.cols);
          const col = i % grid.cols;
          const cellX = col * cellW;
          const cellY = (grid.rows - 1 - row) * cellH;
          const slot = {
            page: pageOrNull(e.page),
            x: cellX + (cellW - renderW) / 2,
            y: cellY + (cellH - renderH) / 2,
            rotateDeg: e.rotate180 ? 180 : 0,
          };
          // Only present when scaling is active, so the default (no
          // paperSize) slot shape is unchanged from before this feature.
          if (paperSize) {
            slot.width = renderW;
            slot.height = renderH;
          }
          return slot;
        }),
      };
    }

    const faces = [];
    p.sheets.forEach(function (sheet) {
      faces.push(buildFace(sheet.front, false));
      if (grid.hasBack) faces.push(buildFace(sheet.back, true));
    });
    return faces;
  }

  /* pdf-lib rotates drawPage around the given origin, so a 180° slot must be
   * drawn from its opposite corner to land inside the slot rect. */
  function drawParams(slot, srcWidth, srcHeight) {
    if (slot.rotateDeg === 180) {
      return { x: slot.x + srcWidth, y: slot.y + srcHeight, rotateDeg: 180 };
    }
    return { x: slot.x, y: slot.y, rotateDeg: 0 };
  }

  /* Manual (non-duplex) printing: faces alternate front, back, front, back.
   * 'fronts'/'backs' filter them; reverse=true flips the selected order for
   * printers that stack their output in reverse. */
  function selectFaces(faces, which, reverse) {
    if (which !== "all" && which !== "fronts" && which !== "backs") {
      throw new Error("which must be 'all', 'fronts' or 'backs'");
    }
    let out = faces.slice();
    if (which === "fronts") out = out.filter(function (_, i) { return i % 2 === 0; });
    if (which === "backs") out = out.filter(function (_, i) { return i % 2 === 1; });
    if (reverse) out.reverse();
    return out;
  }

  // Whether a scheme prints both sides (true) or one side only (false).
  function hasBack(scheme) {
    if (!GRID[scheme]) throw new Error("scheme must be one of: " + SCHEMES.join(", "));
    return GRID[scheme].hasBack;
  }

  // Rows x cols of source pages per printed face, for the given scheme.
  function gridDims(scheme) {
    if (!GRID[scheme]) throw new Error("scheme must be one of: " + SCHEMES.join(", "));
    return { rows: GRID[scheme].rows, cols: GRID[scheme].cols };
  }

  return {
    plan: plan,
    facePlacements: facePlacements,
    drawParams: drawParams,
    selectFaces: selectFaces,
    hasBack: hasBack,
    gridDims: gridDims,
    PAPER_SIZES: PAPER_SIZES,
  };
}));

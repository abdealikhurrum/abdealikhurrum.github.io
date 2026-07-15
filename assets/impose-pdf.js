/* ImposePdf — pdf-lib assembly over the pure impose-core math.
 *
 * imposePdf(srcBytes, {scheme, direction, flip, pdfLib}) → Promise<Uint8Array>
 * Reads a reader-order PDF and emits printer-ready sheets (one output page per
 * printed face, in print order). All page-ordering decisions live in
 * impose-core; this file only embeds and draws.
 *
 * pdfLib is injected (require("pdf-lib") in Node, window.PDFLib in the browser)
 * so the vendored browser build stays outside this module.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./impose-core"));
  } else {
    root.ImposePdf = factory(root.Impose);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (Impose) {
  "use strict";

  // Resolves opts.paperSize (a name in Impose.PAPER_SIZES, or an explicit
  // {width, height} in points) to a size object, or null if not given.
  function resolvePaperSize(paperSize) {
    if (!paperSize) return null;
    if (typeof paperSize === "string") {
      const size = Impose.PAPER_SIZES[paperSize];
      if (!size) throw new Error("paperSize must be one of: " + Object.keys(Impose.PAPER_SIZES).join(", "));
      return size;
    }
    return paperSize;
  }

  // Draws every panel's boundary on a printed sheet: an outer border plus
  // the internal grid lines. For miniquire8 those internal lines are the
  // actual cut lines (solid); for every other scheme they're fold guides
  // (dashed). zinefold8 additionally gets its one real cut marked solid —
  // a short slit along the center fold, under the middle two columns only.
  function drawGridGuides(sheet, face, scheme, gray) {
    const grid = Impose.gridDims(scheme);
    const cellW = face.width / grid.cols;
    const cellH = face.height / grid.rows;
    const isCut = scheme === "miniquire8";

    sheet.drawRectangle({
      x: 0, y: 0, width: face.width, height: face.height,
      borderColor: gray, borderWidth: 1.25,
    });
    for (let c = 1; c < grid.cols; c++) {
      sheet.drawLine({
        start: { x: c * cellW, y: 0 }, end: { x: c * cellW, y: face.height },
        thickness: isCut ? 1 : 0.75, color: gray, dashArray: isCut ? undefined : [4, 4],
      });
    }
    for (let r = 1; r < grid.rows; r++) {
      sheet.drawLine({
        start: { x: 0, y: r * cellH }, end: { x: face.width, y: r * cellH },
        thickness: isCut ? 1 : 0.75, color: gray, dashArray: isCut ? undefined : [4, 4],
      });
    }
    if (scheme === "zinefold8") {
      sheet.drawLine({
        start: { x: cellW, y: cellH }, end: { x: (grid.cols - 1) * cellW, y: cellH },
        thickness: 1.25, color: gray,
      });
    }
  }

  // Greedily wraps text to fit maxWidth at the given font/size, so
  // instructional copy fits panels of any width instead of overflowing
  // narrow ones or leaving wide ones sparse.
  function wrapText(text, font, size, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    words.forEach(function (word) {
      const trial = current ? current + " " + word : word;
      if (!current || font.widthOfTextAtSize(trial, size) <= maxWidth) {
        current = trial;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  async function imposePdf(srcBytes, opts) {
    const PDFLib = opts.pdfLib ||
      (typeof globalThis !== "undefined" ? globalThis.PDFLib : null);
    if (!PDFLib) throw new Error("pdfLib is required (pass opts.pdfLib)");

    const srcDoc = await PDFLib.PDFDocument.load(srcBytes);
    const pageCount = srcDoc.getPageCount();
    const size = srcDoc.getPage(0).getSize();

    // Single-sided schemes (no back face) have nothing to split into
    // fronts/backs; manual duplex only makes sense for schemes with a back.
    const faceSelection = Impose.hasBack(opts.scheme) ? (opts.faces || "all") : "all";
    const faces = Impose.selectFaces(
      Impose.facePlacements({
        pageCount: pageCount,
        scheme: opts.scheme,
        direction: opts.direction,
        flip: opts.flip,
        srcWidth: size.width,
        srcHeight: size.height,
        paperSize: opts.paperSize,
      }),
      faceSelection,
      !!opts.reverse
    );

    const outDoc = await PDFLib.PDFDocument.create();
    const embedded = await outDoc.embedPdf(
      srcDoc,
      Array.from({ length: pageCount }, function (_, i) { return i; })
    );
    const gray = PDFLib.rgb(0.6, 0.6, 0.6);

    faces.forEach(function (face) {
      const sheet = outDoc.addPage([face.width, face.height]);
      face.slots.forEach(function (slot) {
        if (slot.page === null) return; // padding blank
        // Without paperSize, slots have no width/height (native source size).
        const w = slot.width || size.width;
        const h = slot.height || size.height;
        const d = Impose.drawParams(slot, w, h);
        sheet.drawPage(embedded[slot.page - 1], {
          x: d.x,
          y: d.y,
          width: w,
          height: h,
          rotate: PDFLib.degrees(d.rotateDeg),
        });
      });
      drawGridGuides(sheet, face, opts.scheme, gray);
    });

    return outDoc.save();
  }

  /* One-sheet duplex test PDF. Print it double-sided, flip the sheet like a
   * book page: the back carries one upright and one 180°-rotated caption, so
   * whichever reads upright names the duplex setting to pick in the tool. */
  async function makeTestSheet(opts) {
    const PDFLib = opts.pdfLib ||
      (typeof globalThis !== "undefined" ? globalThis.PDFLib : null);
    if (!PDFLib) throw new Error("pdfLib is required (pass opts.pdfLib)");
    const resolved = resolvePaperSize(opts.paperSize) || { width: 842, height: 595 }; // A4 landscape
    const w = opts.width || resolved.width;
    const h = opts.height || resolved.height;

    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const gray = PDFLib.rgb(0.45, 0.45, 0.45);

    const front = doc.addPage([w, h]);
    front.drawLine({
      start: { x: w / 2, y: 20 }, end: { x: w / 2, y: h - 20 },
      thickness: 1, color: gray, dashArray: [6, 6],
    });
    front.drawText("Printer duplex test - FRONT", {
      x: 40, y: h - 70, size: 22, font: bold,
    });
    [
      "1. Print this file double-sided, landscape, actual size.",
      "2. Pick up the printed sheet and turn it over like a book page",
      "    (around its left or right edge).",
      "3. Read the back: one sentence will be the right way up.",
      "    It names the duplex setting to choose in the booklet tool.",
    ].forEach(function (line, i) {
      front.drawText(line, { x: 40, y: h - 110 - 26 * i, size: 13, font: font });
    });

    const back = doc.addPage([w, h]);
    back.drawText("SHORT EDGE - if this reads the right way up,", {
      x: 40, y: h / 2 + 60, size: 16, font: bold,
    });
    back.drawText('choose "Flip on short edge".', {
      x: 40, y: h / 2 + 36, size: 16, font: font,
    });
    // Rotated pair: drawn 180° around its origin, so anchor at the top-right
    // of where the text should appear.
    back.drawText("LONG EDGE - if this reads the right way up,", {
      x: w - 40, y: h / 2 - 84, size: 16, font: bold,
      rotate: PDFLib.degrees(180),
    });
    back.drawText('choose "Flip on long edge".', {
      x: w - 40, y: h / 2 - 60, size: 16, font: font,
      rotate: PDFLib.degrees(180),
    });

    return doc.save();
  }

  const PAGES_PER_SHEET = { saddle: 4, quire4: 4, miniquire8: 8, zinefold8: 8 };
  const SCHEME_LABEL = {
    saddle: "single signature", quire4: "4-side quires",
    miniquire8: "mini-quire (cut & staple)", zinefold8: "zine fold (single sheet)",
  };
  /* Multi-sheet test booklet, in READER order — impose it like any real
   * document. Each page states which physical sheet and side it must land on,
   * so wrong front/back pairing (a printer that stacks backs-first) is caught:
   * both sides of every printed sheet must show the same sheet number. The
   * cover carries scheme- and direction-specific fold/assembly steps. */
  async function makeTestBooklet(opts) {
    const PDFLib = opts.pdfLib ||
      (typeof globalThis !== "undefined" ? globalThis.PDFLib : null);
    if (!PDFLib) throw new Error("pdfLib is required (pass opts.pdfLib)");
    const sheets = opts.sheets || 3;
    const scheme = opts.scheme;
    const pagesPerSheet = PAGES_PER_SHEET[scheme];
    if (!pagesPerSheet) {
      throw new Error("scheme must be one of: " + Object.keys(PAGES_PER_SHEET).join(", "));
    }
    // Reader pages default to A5 portrait. If paperSize is given, generate
    // them at the EXACT size of the scheme's grid cell for that paper —
    // when the caller then imposes this same booklet with the same
    // paperSize, the scale-to-fit factor is exactly 1 and nothing is
    // letterboxed (the mismatch that made panels look sparsely filled).
    let w = opts.width, h = opts.height;
    if (!w || !h) {
      const resolvedPaper = resolvePaperSize(opts.paperSize);
      const grid = Impose.gridDims(scheme);
      w = w || (resolvedPaper ? resolvedPaper.width / grid.cols : 419.5);
      h = h || (resolvedPaper ? resolvedPaper.height / grid.rows : 595.3);
    }
    const pageCount = sheets * pagesPerSheet;
    const rtl = opts.direction === "rtl";
    const saddle = scheme === "saddle";
    const withBack = Impose.hasBack(scheme);

    // Where each reader page physically lands (validates scheme/direction too).
    const p = Impose.plan({ pageCount: pageCount, scheme: scheme, direction: opts.direction });
    const location = {};
    p.sheets.forEach(function (sheet, s) {
      [["front", sheet.front], ["back", sheet.back]].forEach(function (pair) {
        const side = pair[0];
        const entries = pair[1];
        if (!entries) return; // zinefold8 has no back
        entries.forEach(function (e) {
          const n = e && typeof e === "object" ? e.page : e;
          location[n] = { sheet: s + 1, side: side };
        });
      });
    });

    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    // Proportional to the panel's own size (rather than fixed point values)
    // so a tiny zinefold8 panel and a full A4 saddle sheet both come out
    // reasonably filled instead of one dwarfing its content.
    const margin = Math.min(w, h) * 0.07;
    const lineGap = 1.35;
    const titleSize = Math.max(6, Math.min(14, h * 0.032));
    const subtitleSize = Math.max(5, Math.min(11, h * 0.024));
    const numberSize = Math.max(24, Math.min(130, h * 0.30));
    const infoSize = Math.max(6, Math.min(12, h * 0.028));
    const noteSize = Math.max(6, Math.min(10, h * 0.022));

    const centered = function (page, text, y, size, face) {
      const width = face.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (w - width) / 2, y: y, size: size, font: face });
    };
    // Wraps text to the panel width; returns the y just below the block, so
    // callers can chain multiple blocks without knowing how many lines
    // any of them wrapped to.
    const centeredBlock = function (page, text, topY, size, face) {
      let y = topY;
      wrapText(text, face, size, w - 2 * margin).forEach(function (line) {
        centered(page, line, y, size, face);
        y -= size * lineGap;
      });
      return y;
    };
    const leftBlock = function (page, text, topY, size, face) {
      let y = topY;
      wrapText(text, face, size, w - 2 * margin).forEach(function (line) {
        page.drawText(line, { x: margin, y: y, size: size, font: face });
        y -= size * lineGap;
      });
      return y;
    };

    const behind = rtl ? "right" : "left";
    const openEdge = rtl ? "left" : "right";
    let coverSteps;
    if (saddle) {
      coverSteps = [
        "1. Print this file double-sided, landscape, actual size (or print the fronts and backs files in Manual mode).",
        '2. Check every sheet: BOTH sides must show the same sheet number. If the backs show a different number, tick "Backs in reverse order" and print again.',
        "3. Stack the sheets in order, sheet 1 on top.",
        "4. Fold the whole stack in half where the two half-pages meet, bringing the " + behind + " half behind.",
        "5. Read the booklet: pages must run 1, 2, 3 ... " + pageCount + ", opening from the " + openEdge + " edge.",
      ];
    } else if (scheme === "quire4") {
      coverSteps = [
        "1. Print this file double-sided, landscape, actual size (or print the fronts and backs files in Manual mode).",
        '2. Check every sheet: BOTH sides must show the same sheet number. If the backs show a different number, tick "Backs in reverse order" and print again.',
        "3. Fold EACH sheet in half separately, bringing the " + behind + " half behind - each folded sheet is a 4-page quire.",
        "4. Stack the folded quires in order: quire 1 (this one) on top, then quire 2, quire 3.",
        "5. Read the booklet: pages must run 1, 2, 3 ... " + pageCount + ", opening from the " + openEdge + " edge.",
      ];
    } else if (scheme === "miniquire8") {
      coverSteps = [
        "1. Print this file double-sided, landscape, actual size (or print the fronts and backs files in Manual mode).",
        '2. Check every sheet: BOTH sides must show the same sheet number. If the backs show a different number, tick "Backs in reverse order" and print again.',
        "3. Cut each sheet into 4 quarters along the two center creases (the solid lines) - a simple cross-cut.",
        "4. Stack every quarter-leaf in order across all sheets: sheet 1's 4 leaves, then sheet 2's, and so on.",
        "5. Staple along the " + behind + " edge.",
        "6. Read the booklet: pages must run 1, 2, 3 ... " + pageCount + ", opening from the " + openEdge + " edge.",
      ];
    } else {
      coverSteps = [
        "1. Print this file SINGLE-SIDED, landscape, actual size.",
        "2. This is a zine fold: a small no-staple booklet folded from one sheet of paper. EACH sheet below becomes its OWN separate booklet (this test has " + sheets + ").",
        "3. Fold in half twice, then cut a short slit at the center fold (the solid line - full steps are in the tool's guide).",
        "4. Push the two ends together to pop it open into a book.",
        "5. Read each booklet: pages must run 1, 2, 3 ... " + pagesPerSheet + ", opening from the " + openEdge + " edge.",
      ];
    }

    for (let n = 1; n <= pageCount; n++) {
      const page = doc.addPage([w, h]);
      const loc = location[n];

      let y = h - margin - titleSize;
      y = centeredBlock(page, "Booklet test - " + SCHEME_LABEL[scheme], y, titleSize, bold);
      centered(page, "opens " + (rtl ? "right-to-left" : "left-to-right"), y, subtitleSize, font);
      y -= subtitleSize * lineGap;

      const numberY = y - numberSize * 0.85;
      centered(page, String(n), numberY, numberSize, bold);
      let infoY = numberY - infoSize * lineGap * 1.4;
      infoY = centeredBlock(page, "page " + n + " of " + pageCount, infoY, infoSize, font);
      infoY = centeredBlock(page, "printed on sheet " + loc.sheet + " - " + loc.side, infoY, infoSize, bold);

      // Bottom notes flow directly below the info block (rather than
      // anchoring to the bottom margin), so pages without cover steps don't
      // leave a big empty gap between the page number and the sheet check.
      let bottomY = infoY - noteSize * lineGap * 0.6;
      if (n === 1) {
        coverSteps.forEach(function (step) {
          bottomY = leftBlock(page, step, bottomY, noteSize, font) - noteSize * 0.3;
        });
      }
      if (withBack) {
        bottomY = leftBlock(page, "Sheet check: the other side of this sheet must also say sheet " +
          loc.sheet + ".", bottomY, noteSize, font) - noteSize * 0.3;
      }
      if (saddle && (n === pageCount / 2 || n === pageCount / 2 + 1)) {
        bottomY = centeredBlock(page, "Centre of the booklet - the fold/staple line runs here.",
          bottomY, noteSize, bold);
      }
      if (!saddle && withBack && n > 1 && n % pagesPerSheet === 1) {
        bottomY = centeredBlock(page, "First leaf of sheet " + ((n - 1) / pagesPerSheet + 1) +
          " - it must follow page " + (n - 1) + ".", bottomY, noteSize, bold);
      }
      if (!withBack && n > 1 && n % pagesPerSheet === 1) {
        bottomY = centeredBlock(page, "Start of a new, separate zine (sheet " +
          ((n - 1) / pagesPerSheet + 1) + ") - it does not join the one before it.",
          bottomY, noteSize, bold);
      }
    }

    return doc.save();
  }

  return {
    imposePdf: imposePdf,
    makeTestSheet: makeTestSheet,
    makeTestBooklet: makeTestBooklet,
  };
}));

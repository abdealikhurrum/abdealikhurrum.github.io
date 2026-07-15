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

  async function imposePdf(srcBytes, opts) {
    const PDFLib = opts.pdfLib ||
      (typeof globalThis !== "undefined" ? globalThis.PDFLib : null);
    if (!PDFLib) throw new Error("pdfLib is required (pass opts.pdfLib)");

    const srcDoc = await PDFLib.PDFDocument.load(srcBytes);
    const pageCount = srcDoc.getPageCount();
    const size = srcDoc.getPage(0).getSize();

    const faces = Impose.selectFaces(
      Impose.facePlacements({
        pageCount: pageCount,
        scheme: opts.scheme,
        direction: opts.direction,
        flip: opts.flip,
        srcWidth: size.width,
        srcHeight: size.height,
      }),
      opts.faces || "all",
      !!opts.reverse
    );

    const outDoc = await PDFLib.PDFDocument.create();
    const embedded = await outDoc.embedPdf(
      srcDoc,
      Array.from({ length: pageCount }, function (_, i) { return i; })
    );

    faces.forEach(function (face) {
      const sheet = outDoc.addPage([face.width, face.height]);
      face.slots.forEach(function (slot) {
        if (slot.page === null) return; // padding blank
        const d = Impose.drawParams(slot, size.width, size.height);
        sheet.drawPage(embedded[slot.page - 1], {
          x: d.x,
          y: d.y,
          rotate: PDFLib.degrees(d.rotateDeg),
        });
      });
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
    const w = opts.width || 842;  // A4 landscape (points)
    const h = opts.height || 595;

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
    const w = opts.width || 419.5;   // A5 portrait (points)
    const h = opts.height || 595.3;
    const pageCount = sheets * 4;
    const rtl = opts.direction === "rtl";
    const saddle = opts.scheme === "saddle";

    // Where each reader page physically lands (validates scheme/direction too).
    const p = Impose.plan({
      pageCount: pageCount, scheme: opts.scheme, direction: opts.direction,
    });
    const location = {};
    p.sheets.forEach(function (sheet, s) {
      sheet.front.forEach(function (n) { location[n] = { sheet: s + 1, side: "front" }; });
      sheet.back.forEach(function (n) { location[n] = { sheet: s + 1, side: "back" }; });
    });

    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const gray = PDFLib.rgb(0.4, 0.4, 0.4);

    const centered = function (page, text, y, size, face) {
      const width = face.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (w - width) / 2, y: y, size: size, font: face });
    };

    const behind = rtl ? "right" : "left";
    const openEdge = rtl ? "left" : "right";
    const coverSteps = [
      "1. Print this file double-sided, landscape, actual size",
      "    (or print the fronts and backs files in Manual mode).",
      "2. Check every sheet: BOTH sides must show the same",
      "    sheet number. If the backs show a different number,",
      '    tick "Backs in reverse order" and print again.',
    ].concat(saddle ? [
      "3. Stack the sheets in order, sheet 1 on top.",
      "4. Fold the whole stack in half where the two half-pages",
      "    meet, bringing the " + behind + " half behind.",
      "5. Read the booklet: pages must run 1, 2, 3 ... " + pageCount + ",",
      "    opening from the " + openEdge + " edge.",
    ] : [
      "3. Fold EACH sheet in half separately, bringing the",
      "    " + behind + " half behind - each folded sheet is a 4-page quire.",
      "4. Stack the folded quires in order: quire 1 (this one)",
      "    on top, then quire 2, quire 3.",
      "5. Read the booklet: pages must run 1, 2, 3 ... " + pageCount + ",",
      "    opening from the " + openEdge + " edge.",
    ]);

    for (let n = 1; n <= pageCount; n++) {
      const page = doc.addPage([w, h]);
      const loc = location[n];

      centered(page, "Booklet test - " +
        (saddle ? "single signature" : "4-side quires"), h - 44, 13, bold);
      centered(page, "opens " + (rtl ? "right-to-left" : "left-to-right"),
        h - 62, 10, font);

      centered(page, String(n), h / 2 - 10, 96, bold);
      centered(page, "page " + n + " of " + pageCount, h / 2 - 46, 11, font);
      centered(page, "printed on sheet " + loc.sheet + " - " + loc.side,
        h / 2 - 66, 11, bold);
      page.drawText("Sheet check: the other side of this sheet must also say sheet " +
        loc.sheet + ".", { x: 30, y: 40, size: 8.5, font: font, color: gray });

      if (n === 1) {
        coverSteps.forEach(function (line, i) {
          page.drawText(line, { x: 30, y: h / 2 - 95 - 13 * i, size: 9.5, font: font });
        });
      }
      if (saddle && (n === pageCount / 2 || n === pageCount / 2 + 1)) {
        centered(page, "Centre of the booklet - the fold/staple line runs here.",
          90, 10, bold);
      }
      if (!saddle && n > 1 && n % 4 === 1) {
        centered(page, "First page of quire " + ((n - 1) / 4 + 1) +
          " - it must follow page " + (n - 1) + ".", 90, 10, bold);
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

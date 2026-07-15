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

  return { imposePdf: imposePdf, makeTestSheet: makeTestSheet };
}));

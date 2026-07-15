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

    const faces = Impose.facePlacements({
      pageCount: pageCount,
      scheme: opts.scheme,
      direction: opts.direction,
      flip: opts.flip,
      srcWidth: size.width,
      srcHeight: size.height,
    });

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

  return { imposePdf: imposePdf };
}));

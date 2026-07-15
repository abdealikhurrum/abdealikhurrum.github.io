/* Impose — pure page-ordering math for booklet imposition.
 *
 * Turns a reader-order page count into physical sheets: each output sheet has
 * a front and back face, each face holding two pages side by side. Two schemes:
 *   saddle — single signature: all sheets nested and folded together
 *   quire4 — each sheet folds independently into its own 4-side quire
 * Direction 'rtl' puts page 1 on the LEFT half of the outer front face
 * (spine folds on the right; the booklet opens right-to-left).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.Impose = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function plan(opts) {
    const pageCount = opts && opts.pageCount;
    const scheme = opts && opts.scheme;
    const direction = opts && opts.direction;

    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error("pageCount must be a positive integer");
    }
    if (scheme !== "saddle" && scheme !== "quire4") {
      throw new Error("scheme must be 'saddle' or 'quire4'");
    }
    if (direction !== "rtl" && direction !== "ltr") {
      throw new Error("direction must be 'rtl' or 'ltr'");
    }

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

  /* Print-ready geometry: one entry per printed face, in print order.
   * Sheet auto-sizes to two source pages side by side. flip:'long' pre-rotates
   * back faces 180° so long-edge duplex comes out upright; blanks are page:null.
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
    const pageOrNull = (n) => (n > opts.pageCount ? null : n);
    const faces = [];
    p.sheets.forEach(function (sheet) {
      [["front", sheet.front], ["back", sheet.back]].forEach(function (pair) {
        const side = pair[0];
        let halves = pair[1].map(pageOrNull);
        let rotateDeg = 0;
        if (side === "back" && flip === "long") {
          halves = [halves[1], halves[0]];
          rotateDeg = 180;
        }
        faces.push({
          width: 2 * srcWidth,
          height: srcHeight,
          slots: halves.map(function (page, i) {
            return { page: page, x: i * srcWidth, y: 0, rotateDeg: rotateDeg };
          }),
        });
      });
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

  return {
    plan: plan,
    facePlacements: facePlacements,
    drawParams: drawParams,
    selectFaces: selectFaces,
  };
}));

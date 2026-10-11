import "@testing-library/jest-dom/vitest";

/*
 * jsdom performs no layout and omits the browser APIs below. The component
 * libraries call them unconditionally, so component tests get inert stand-ins.
 * Tests never assert on measured geometry, pointer capture, or scrolling; those
 * behaviours are covered by the Playwright and native checks.
 */

/** Bits UI's select releases implicit pointer capture and scrolls the highlighted option into view. */
const INERT_ELEMENT_METHODS = {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
} as const;
for (const [name, method] of Object.entries(INERT_ELEMENT_METHODS)) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  }
}

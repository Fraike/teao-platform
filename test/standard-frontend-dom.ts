import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
export const observers: ResizeObserverDouble[] = [];
class ResizeObserverDouble {
  disconnected = false;
  elements = new Set<Element>();
  constructor(public callback: ResizeObserverCallback) { observers.push(this); }
  observe(element: Element) { this.disconnected = false; this.elements.add(element); }
  unobserve(element: Element) { this.elements.delete(element); }
  disconnect() { this.disconnected = true; this.elements.clear(); }
  resize(element: Element, width: number) {
    if (!this.disconnected && this.elements.has(element)) this.callback([{ target: element, contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element, localStorage: dom.window.localStorage, SVGElement: dom.window.SVGElement, ShadowRoot: dom.window.ShadowRoot,
  MutationObserver: dom.window.MutationObserver, ResizeObserver: ResizeObserverDouble,
  getComputedStyle: (element: Element) => dom.window.getComputedStyle(element),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
});
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, media: '', onchange: null });

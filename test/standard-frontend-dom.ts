import { JSDOM } from 'jsdom';
import {after} from 'node:test';
import {MessageChannel as NativeMessageChannel} from 'node:worker_threads';
const channels: NativeMessageChannel[]=[];
// Antd 6 schedules work through MessageChannel. Keep real async delivery,
// but let Node finish after the tests instead of keeping every port alive.
class TestMessageChannel extends NativeMessageChannel {
  constructor(){
    super();channels.push(this);
    for(const port of [this.port1,this.port2]){
      let prototype=Object.getPrototypeOf(port);
      while(prototype&&!Object.getOwnPropertyDescriptor(prototype,'onmessage'))prototype=Object.getPrototypeOf(prototype);
      const descriptor=Object.getOwnPropertyDescriptor(prototype,'onmessage')!;
      Object.defineProperty(port,'onmessage',{
        get:()=>descriptor.get?.call(port),
        set:listener=>{descriptor.set?.call(port,listener);port.unref();},
      });
      port.unref();
    }
  }
}
after(()=>{for(const channel of channels){channel.port1.close();channel.port2.close();}dom.window.close();});
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
  HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLBodyElement: dom.window.HTMLBodyElement,
  MessageChannel: TestMessageChannel,
  MutationObserver: dom.window.MutationObserver, ResizeObserver: ResizeObserverDouble,
  getComputedStyle: (element: Element) => dom.window.getComputedStyle(element),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
});
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, media: '', onchange: null });

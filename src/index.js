const TEXT = Symbol('sprout.text');

let activeObserver = null;
let batchDepth = 0;
const pendingObservers = new Set();

class ReactiveObserver {
  constructor(run, { onResult = null, cleanupResult = false } = {}) {
    this.run = run;
    this.onResult = onResult;
    this.cleanupResult = cleanupResult;
    this.dependencies = new Map();
    this.cleanup = null;
    this.running = false;
    this.pending = false;
    this.disposed = false;
  }
  depend(source) { if (this.disposed || this.dependencies.has(source)) return; this.dependencies.set(source, source.subscribe(() => this.schedule())); }
  execute() {
    if (this.disposed) return;
    if (this.running) { this.pending = true; return; }
    this.running = true; this.pending = false;
    for (const unsubscribe of this.dependencies.values()) unsubscribe();
    this.dependencies.clear();
    if (this.cleanupResult && typeof this.cleanup === 'function') { const cleanup = this.cleanup; this.cleanup = null; cleanup(); }
    const previous = activeObserver; activeObserver = this;
    try { const result = this.run(); if (this.cleanupResult) this.cleanup = typeof result === 'function' ? result : null; this.onResult?.(result); }
    finally { activeObserver = previous; this.running = false; }
    if (this.pending && !this.disposed) this.schedule();
  }
  schedule() { if (this.disposed) return; if (this.running) { this.pending = true; return; } if (batchDepth > 0) { pendingObservers.add(this); return; } this.execute(); }
  dispose() { if (this.disposed) return; this.disposed = true; pendingObservers.delete(this); for (const unsubscribe of this.dependencies.values()) unsubscribe(); this.dependencies.clear(); if (this.cleanupResult && typeof this.cleanup === 'function') this.cleanup(); this.cleanup = null; }
}

export function h(type, props = {}, ...children) { const flat = children.flat(Infinity).filter((value) => value !== false && value !== true && value != null); return { type, props: props ?? {}, children: flat.map(normalizeChild) }; }
export const fragment = (...children) => h(Symbol.for('sprout.fragment'), {}, ...children);
function normalizeChild(value) { if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return { type: TEXT, value: String(value), props: {}, children: [] }; return value; }
export function component(render) { if (typeof render !== 'function') throw new TypeError('component(render) expects a function'); const fn = (props = {}) => render(props); fn.sproutComponent = true; return fn; }

export function signal(initialValue) {
  let value = initialValue; const subscribers = new Set();
  const api = {
    get value() { activeObserver?.depend(api); return value; },
    set value(next) { if (Object.is(value, next)) return; value = next; for (const subscriber of [...subscribers]) subscriber(value); },
    peek() { return value; },
    update(updater) { if (typeof updater !== 'function') throw new TypeError('signal.update expects a function'); api.value = updater(value); return value; },
    subscribe(subscriber) { if (typeof subscriber !== 'function') throw new TypeError('subscriber must be a function'); subscribers.add(subscriber); return () => subscribers.delete(subscriber); }
  };
  return api;
}

export function computed(read, dependencies = null) {
  if (typeof read !== 'function') throw new TypeError('computed(read) expects a function');
  const output = signal(undefined);
  if (dependencies !== null) {
    const list = normalizeDependencies(dependencies); output.value = untracked(read); const recompute = () => { output.value = untracked(read); }; const unsubscribers = list.map((dependency) => dependency.subscribe(recompute));
    return { get value() { return output.value; }, peek: output.peek, subscribe: output.subscribe, dispose() { unsubscribers.forEach((unsubscribe) => unsubscribe()); } };
  }
  const observer = new ReactiveObserver(read, { onResult: (value) => { output.value = value; } }); observer.execute();
  return { get value() { return output.value; }, peek: output.peek, subscribe: output.subscribe, dispose() { observer.dispose(); } };
}

export function effect(run, dependencies = null) {
  if (typeof run !== 'function') throw new TypeError('effect(run) expects a function');
  if (dependencies !== null) {
    const list = normalizeDependencies(dependencies); let cleanup; const execute = () => { if (typeof cleanup === 'function') cleanup(); cleanup = untracked(run); }; execute(); const unsubscribers = list.map((dependency) => dependency.subscribe(execute));
    return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); if (typeof cleanup === 'function') cleanup(); };
  }
  const observer = new ReactiveObserver(run, { cleanupResult: true }); observer.execute(); return () => observer.dispose();
}

export function batch(work) { if (typeof work !== 'function') throw new TypeError('batch(work) expects a function'); batchDepth += 1; try { return work(); } finally { batchDepth -= 1; if (batchDepth === 0) flushPendingObservers(); } }
export function untracked(work) { if (typeof work !== 'function') throw new TypeError('untracked(work) expects a function'); const previous = activeObserver; activeObserver = null; try { return work(); } finally { activeObserver = previous; } }
function flushPendingObservers() { while (pendingObservers.size) { const observers = [...pendingObservers]; pendingObservers.clear(); for (const observer of observers) observer.execute(); } }
function normalizeDependencies(dependencies) { if (!Array.isArray(dependencies)) throw new TypeError('dependencies must be an array or null'); for (const dependency of dependencies) if (!dependency || typeof dependency.subscribe !== 'function') throw new TypeError('reactive dependency must expose subscribe()'); return [...new Set(dependencies)]; }

export function render(vnode, container) { if (!container || typeof container.appendChild !== 'function') throw new TypeError('render(vnode, container) requires a DOM-like container'); container.replaceChildren(createDomNode(resolveVNode(vnode), container.ownerDocument ?? globalThis.document)); return container; }
function resolveVNode(vnode) { if (vnode == null) return { type: TEXT, value: '', props: {}, children: [] }; if (typeof vnode.type === 'function') return resolveVNode(vnode.type({ ...vnode.props, children: vnode.children })); if (vnode.type === Symbol.for('sprout.fragment')) return vnode; return vnode; }
function createDomNode(vnode, documentRef) { if (!documentRef) throw new Error('A document implementation is required for DOM rendering'); vnode = resolveVNode(vnode); if (vnode.type === TEXT) return documentRef.createTextNode(vnode.value); if (vnode.type === Symbol.for('sprout.fragment')) { const fragmentNode = documentRef.createDocumentFragment(); for (const child of vnode.children) fragmentNode.appendChild(createDomNode(child, documentRef)); return fragmentNode; } const element = documentRef.createElement(vnode.type); applyProps(element, vnode.props); for (const child of vnode.children) element.appendChild(createDomNode(child, documentRef)); return element; }
function applyProps(element, props) { for (const [key, value] of Object.entries(props ?? {})) { if (key === 'children' || value == null || value === false) continue; if (key === 'className') { element.setAttribute('class', String(value)); continue; } if (key === 'style' && value && typeof value === 'object') { for (const [property, styleValue] of Object.entries(value)) element.style[property] = styleValue; continue; } if (key.startsWith('on') && typeof value === 'function') { element.addEventListener(key.slice(2).toLowerCase(), value); continue; } if (key in element && typeof value !== 'object') { try { element[key] = value; continue; } catch {} } if (value === true) element.setAttribute(key, ''); else element.setAttribute(key, String(value)); } }

export function renderToString(vnode) {
  vnode = resolveVNode(vnode);
  if (vnode.type === TEXT) return escapeHtml(vnode.value);
  if (vnode.type === Symbol.for('sprout.fragment')) return vnode.children.map(renderToString).join('');
  const attributes = Object.entries(vnode.props ?? {})
    .filter(([key, value]) => key !== 'children' && !key.startsWith('on') && value != null && value !== false)
    .map(([key, value]) => serializeAttribute(key, value, vnode.type)).filter(Boolean).join(' ');
  const opening = attributes ? `<${vnode.type} ${attributes}>` : `<${vnode.type}>`;
  return `${opening}${vnode.children.map(renderToString).join('')}</${vnode.type}>`;
}

function serializeAttribute(key, value, elementType) {
  if (elementType === 'button' && key === 'tabIndex' && Number(value) === 0) return '';
  if (key === 'className') key = 'class';
  if (key === 'tabIndex') key = 'tabindex';
  if (key === 'style' && value && typeof value === 'object') { const css = Object.entries(value).map(([name, entry]) => `${toKebabCase(name)}:${entry}`).join(';'); return `style="${escapeAttribute(css)}"`; }
  if (value === true) return key;
  if (typeof value === 'object') return '';
  return `${key}="${escapeAttribute(String(value))}"`;
}
function toKebabCase(value) { return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttribute(value) { return escapeHtml(value).replace(/"/g, '&quot;'); }

export const Sprout = Object.freeze({ h, fragment, component, signal, computed, effect, batch, untracked, render, renderToString });
export { dependencyMap, ReactiveScope, bindValue, formState, a11y, Router, createSsrResult, hydrate, NativeRenderer, createDataResource } from './platform.js';

const TEXT = Symbol('sprout.text');
const FRAGMENT = Symbol.for('sprout.fragment');
const renderStates = new WeakMap();

let activeObserver = null;
let batchDepth = 0;
const pendingObservers = new Set();

class ReactiveObserver {
  constructor(run, { onResult = null, cleanupResult = false } = {}) {
    this.run = run; this.onResult = onResult; this.cleanupResult = cleanupResult; this.dependencies = new Map(); this.cleanup = null; this.running = false; this.pending = false; this.disposed = false;
  }
  depend(source) { if (this.disposed || this.dependencies.has(source)) return; this.dependencies.set(source, source.subscribe(() => this.schedule())); }
  execute() {
    if (this.disposed) return;
    if (this.running) { this.pending = true; return; }
    this.running = true; this.pending = false;
    for (const unsubscribe of this.dependencies.values()) unsubscribe(); this.dependencies.clear();
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
export const fragment = (...children) => h(FRAGMENT, {}, ...children);
function normalizeChild(value) { if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return { type: TEXT, value: String(value), props: {}, children: [] }; return value; }
export function component(render) { if (typeof render !== 'function') throw new TypeError('component(render) expects a function'); const fn = (props = {}) => render(props); fn.sproutComponent = true; return fn; }

export function signal(initialValue) {
  let value = initialValue; const subscribers = new Set();
  const api = {
    get value() { activeObserver?.depend(api); return value; },
    set value(next) { if (Object.is(value, next)) return; value = next; for (const subscriber of [...subscribers]) subscriber(value); },
    peek() { return value; }, update(updater) { if (typeof updater !== 'function') throw new TypeError('signal.update expects a function'); api.value = updater(value); return value; },
    subscribe(subscriber) { if (typeof subscriber !== 'function') throw new TypeError('subscriber must be a function'); subscribers.add(subscriber); return () => subscribers.delete(subscriber); }
  }; return api;
}

export function computed(read, dependencies = null) {
  if (typeof read !== 'function') throw new TypeError('computed(read) expects a function'); const output = signal(undefined);
  if (dependencies !== null) { const list = normalizeDependencies(dependencies); output.value = untracked(read); const recompute = () => { output.value = untracked(read); }; const unsubscribers = list.map((dependency) => dependency.subscribe(recompute)); return { get value() { return output.value; }, peek: output.peek, subscribe: output.subscribe, dispose() { unsubscribers.forEach((unsubscribe) => unsubscribe()); } }; }
  const observer = new ReactiveObserver(read, { onResult: (value) => { output.value = value; } }); observer.execute();
  return { get value() { return output.value; }, peek: output.peek, subscribe: output.subscribe, dispose() { observer.dispose(); } };
}

export function effect(run, dependencies = null) {
  if (typeof run !== 'function') throw new TypeError('effect(run) expects a function');
  if (dependencies !== null) { const list = normalizeDependencies(dependencies); let cleanup; const execute = () => { if (typeof cleanup === 'function') cleanup(); cleanup = untracked(run); }; execute(); const unsubscribers = list.map((dependency) => dependency.subscribe(execute)); return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); if (typeof cleanup === 'function') cleanup(); }; }
  const observer = new ReactiveObserver(run, { cleanupResult: true }); observer.execute(); return () => observer.dispose();
}

export function batch(work) { if (typeof work !== 'function') throw new TypeError('batch(work) expects a function'); batchDepth += 1; try { return work(); } finally { batchDepth -= 1; if (batchDepth === 0) flushPendingObservers(); } }
export function untracked(work) { if (typeof work !== 'function') throw new TypeError('untracked(work) expects a function'); const previous = activeObserver; activeObserver = null; try { return work(); } finally { activeObserver = previous; } }
function flushPendingObservers() { while (pendingObservers.size) { const observers = [...pendingObservers]; pendingObservers.clear(); for (const observer of observers) observer.execute(); } }
function normalizeDependencies(dependencies) { if (!Array.isArray(dependencies)) throw new TypeError('dependencies must be an array or null'); for (const dependency of dependencies) if (!dependency || typeof dependency.subscribe !== 'function') throw new TypeError('reactive dependency must expose subscribe()'); return [...new Set(dependencies)]; }

export function render(vnode, container) {
  if (!container || typeof container.appendChild !== 'function') throw new TypeError('render(vnode, container) requires a DOM-like container');
  const documentRef = container.ownerDocument ?? globalThis.document;
  if (!documentRef) throw new Error('A document implementation is required for DOM rendering');
  const next = resolveVNode(vnode);
  const previous = renderStates.get(container);
  if (!previous || next.type === FRAGMENT || previous.vnode.type === FRAGMENT || container.childNodes.length !== 1) {
    container.replaceChildren(createDomNode(next, documentRef));
  } else {
    const currentNode = container.firstChild;
    const patched = patchNode(container, currentNode, previous.vnode, next, documentRef);
    if (patched !== currentNode && patched.parentNode !== container) container.replaceChildren(patched);
  }
  renderStates.set(container, { vnode: next });
  return container;
}

function patchNode(parent, node, oldVNode, newVNode, documentRef) {
  oldVNode = resolveVNode(oldVNode); newVNode = resolveVNode(newVNode);
  if (!sameVNodeKind(oldVNode, newVNode)) {
    const replacement = createDomNode(newVNode, documentRef);
    parent.replaceChild(replacement, node);
    return replacement;
  }
  if (newVNode.type === TEXT) {
    if (node.nodeValue !== newVNode.value) node.nodeValue = newVNode.value;
    return node;
  }
  if (newVNode.type === FRAGMENT) {
    const replacement = createDomNode(newVNode, documentRef);
    parent.replaceChild(replacement, node);
    return replacement;
  }
  patchProps(node, oldVNode.props ?? {}, newVNode.props ?? {});
  patchChildren(node, oldVNode.children ?? [], newVNode.children ?? [], documentRef);
  return node;
}

function patchChildren(parent, oldChildren, newChildren, documentRef) {
  const oldResolved = oldChildren.map(resolveVNode);
  const newResolved = newChildren.map(resolveVNode);
  const oldNodes = [...parent.childNodes];
  const hasKeys = oldResolved.some(hasKey) || newResolved.some(hasKey);
  if (!hasKeys) {
    const common = Math.min(oldResolved.length, newResolved.length, oldNodes.length);
    for (let i = 0; i < common; i++) patchNode(parent, oldNodes[i], oldResolved[i], newResolved[i], documentRef);
    for (let i = common; i < newResolved.length; i++) parent.appendChild(createDomNode(newResolved[i], documentRef));
    while (parent.childNodes.length > newResolved.length) parent.removeChild(parent.lastChild);
    return;
  }

  const keyedOld = new Map();
  oldResolved.forEach((child, index) => { const key = vnodeKey(child); if (key != null) { if (keyedOld.has(key)) throw new Error(`duplicate Sprout key: ${key}`); keyedOld.set(key, { vnode: child, node: oldNodes[index] }); } });
  const seenNew = new Set();
  let unkeyedCursor = 0;
  const unkeyedOld = oldResolved.map((child,index)=>({child,node:oldNodes[index]})).filter(({child})=>vnodeKey(child)==null);

  for (let targetIndex = 0; targetIndex < newResolved.length; targetIndex++) {
    const nextChild = newResolved[targetIndex];
    const key = vnodeKey(nextChild);
    let entry;
    if (key != null) {
      if (seenNew.has(key)) throw new Error(`duplicate Sprout key: ${key}`);
      seenNew.add(key);
      entry = keyedOld.get(key);
    } else entry = unkeyedOld[unkeyedCursor++];

    let childNode;
    if (entry) childNode = patchNode(parent, entry.node, entry.vnode ?? entry.child, nextChild, documentRef);
    else childNode = createDomNode(nextChild, documentRef);
    const reference = parent.childNodes[targetIndex] ?? null;
    if (childNode !== reference) parent.insertBefore(childNode, reference);
  }
  while (parent.childNodes.length > newResolved.length) parent.removeChild(parent.lastChild);
}

function sameVNodeKind(a,b) { return a.type === b.type && (a.type === TEXT || a.type === FRAGMENT || String(a.type) === String(b.type)); }
function hasKey(vnode) { return vnodeKey(vnode) != null; }
function vnodeKey(vnode) { const key = vnode?.props?.key; return key == null ? null : String(key); }
function resolveVNode(vnode) { if (vnode == null) return { type: TEXT, value: '', props: {}, children: [] }; if (typeof vnode.type === 'function') return resolveVNode(vnode.type({ ...vnode.props, children: vnode.children })); if (vnode.type === FRAGMENT) return { ...vnode, children: vnode.children.map(resolveVNode) }; return vnode; }
function createDomNode(vnode, documentRef) { vnode = resolveVNode(vnode); if (vnode.type === TEXT) return documentRef.createTextNode(vnode.value); if (vnode.type === FRAGMENT) { const fragmentNode = documentRef.createDocumentFragment(); for (const child of vnode.children) fragmentNode.appendChild(createDomNode(child, documentRef)); return fragmentNode; } const element = documentRef.createElement(vnode.type); patchProps(element, {}, vnode.props ?? {}); for (const child of vnode.children) element.appendChild(createDomNode(child, documentRef)); return element; }

function patchProps(element, oldProps, newProps) {
  const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
  for (const key of keys) {
    if (key === 'children' || key === 'key') continue;
    const oldValue = oldProps[key]; const newValue = newProps[key];
    if (Object.is(oldValue,newValue)) continue;
    if (key.startsWith('on')) {
      const event = key.slice(2).toLowerCase();
      if (typeof oldValue === 'function') element.removeEventListener(event, oldValue);
      if (typeof newValue === 'function') element.addEventListener(event, newValue);
      continue;
    }
    if (key === 'style') { patchStyle(element, oldValue, newValue); continue; }
    const attribute = key === 'className' ? 'class' : key === 'tabIndex' ? 'tabindex' : key;
    if (newValue == null || newValue === false) {
      element.removeAttribute(attribute);
      if (key in element && typeof oldValue !== 'object') { try { if (typeof element[key] === 'boolean') element[key]=false; else if (key !== 'className') element[key]=''; } catch {} }
      continue;
    }
    if (key === 'className') { element.setAttribute('class',String(newValue)); continue; }
    if (key in element && typeof newValue !== 'object') { try { element[key]=newValue; continue; } catch {} }
    if (newValue === true) element.setAttribute(attribute,''); else if (typeof newValue !== 'object') element.setAttribute(attribute,String(newValue));
  }
}
function patchStyle(element, oldStyle, newStyle) {
  const before = oldStyle && typeof oldStyle === 'object' ? oldStyle : {};
  const after = newStyle && typeof newStyle === 'object' ? newStyle : {};
  for (const key of Object.keys(before)) if (!(key in after)) element.style[key] = '';
  for (const [key,value] of Object.entries(after)) if (!Object.is(before[key],value)) element.style[key] = value == null ? '' : value;
  if ((!newStyle || typeof newStyle !== 'object') && oldStyle) element.removeAttribute('style');
}

export function renderToString(vnode) {
  vnode = resolveVNode(vnode);
  if (vnode.type === TEXT) return escapeHtml(vnode.value);
  if (vnode.type === FRAGMENT) return vnode.children.map(renderToString).join('');
  const attributes = Object.entries(vnode.props ?? {})
    .filter(([key, value]) => key !== 'children' && key !== 'key' && !key.startsWith('on') && value != null && value !== false)
    .map(([key, value]) => serializeAttribute(key, value, vnode.type)).filter(Boolean).join(' ');
  const opening = attributes ? `<${vnode.type} ${attributes}>` : `<${vnode.type}>`;
  return `${opening}${vnode.children.map(renderToString).join('')}</${vnode.type}>`;
}

function serializeAttribute(key, value, elementType) {
  if (elementType === 'button' && key === 'tabIndex' && Number(value) === 0) return '';
  if (key === 'className') key = 'class'; if (key === 'tabIndex') key = 'tabindex';
  if (key === 'style' && value && typeof value === 'object') { const css = Object.entries(value).map(([name, entry]) => `${toKebabCase(name)}:${entry}`).join(';'); return `style="${escapeAttribute(css)}"`; }
  if (value === true) return key; if (typeof value === 'object') return ''; return `${key}="${escapeAttribute(String(value))}"`;
}
function toKebabCase(value) { return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`); }
function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttribute(value) { return escapeHtml(value).replace(/"/g, '&quot;'); }

export const Sprout = Object.freeze({ h, fragment, component, signal, computed, effect, batch, untracked, render, renderToString });
export { dependencyMap, ReactiveScope, bindValue, formState, a11y, Router, createSsrResult, hydrate, NativeRenderer, createDataResource } from './platform.js';

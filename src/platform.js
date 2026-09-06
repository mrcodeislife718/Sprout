import { signal, effect, h, render, renderToString } from './index.js';

export function dependencyMap(componentId, dependencies = []) {
  return Object.freeze({ componentId, dependencies: [...new Set(dependencies)].sort(), version: 1 });
}

export class ReactiveScope {
  constructor(map = null) { this.map = map; this.subscriptions = []; this.disposed = false; }
  track(dependency, update) { if (this.disposed) throw new Error('reactive scope is disposed'); this.subscriptions.push(dependency.subscribe(update)); return this; }
  dispose() { if (this.disposed) return; for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe(); this.disposed = true; }
}

export function bindValue(element, state, { event = 'input', parse = (value) => value } = {}) {
  if (!element?.addEventListener) throw new TypeError('bindValue requires a DOM element');
  element.value = state.value ?? '';
  const stop = state.subscribe((value) => { if (element.value !== String(value ?? '')) element.value = value ?? ''; });
  const listener = () => { state.value = parse(element.value); };
  element.addEventListener(event, listener);
  return () => { stop(); element.removeEventListener(event, listener); };
}

export function formState(initial = {}, validators = {}) {
  const values = signal(structuredClone(initial));
  const errors = signal({});
  const touched = signal({});
  return {
    values, errors, touched,
    field(name) {
      return {
        get value() { return values.value[name]; },
        set value(next) { values.value = { ...values.value, [name]: next }; },
        touch() { touched.value = { ...touched.value, [name]: true }; },
        validate() {
          const validator = validators[name];
          const message = validator ? validator(values.value[name], values.value) : null;
          const next = { ...errors.value };
          if (message) next[name] = message; else delete next[name];
          errors.value = next;
          return !message;
        }
      };
    },
    validate() {
      let ok = true;
      for (const name of Object.keys(validators)) if (!this.field(name).validate()) ok = false;
      return ok;
    }
  };
}

export const a11y = Object.freeze({
  button(props = {}) { return { role: props.role ?? 'button', tabIndex: props.disabled ? -1 : (props.tabIndex ?? 0), 'aria-disabled': props.disabled ? 'true' : undefined, ...props }; },
  dialog(props = {}) { return { role: 'dialog', 'aria-modal': props.modal === false ? 'false' : 'true', tabIndex: -1, ...props }; },
  input({ label, describedBy, invalid, ...props } = {}) { return { 'aria-label': label, 'aria-describedby': describedBy, 'aria-invalid': invalid ? 'true' : undefined, ...props }; },
  live({ politeness = 'polite', ...props } = {}) { return { 'aria-live': politeness, 'aria-atomic': 'true', ...props }; }
});

export class Router {
  constructor({ base = '/', history = null } = {}) {
    this.base = base;
    this.history = history;
    this.routes = [];
    this.current = signal(null);
    this.abortController = null;
    this.navigationId = 0;
  }
  route(pattern, view, { load = null, name = null } = {}) { const compiled = compileRoute(pattern); this.routes.push({ pattern, view, load, name, ...compiled }); return this; }
  match(url) { const pathname = new URL(url, 'http://sprout.local').pathname; for (const route of this.routes) { const match = route.regex.exec(pathname); if (!match) continue; return { route, params: Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])])) }; } return null; }
  async navigate(url, context = {}) {
    const navigationId = ++this.navigationId;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const match = this.match(url);
    if (!match) {
      if (navigationId !== this.navigationId || controller.signal.aborted) return this.current.value;
      const state = { status: 404, url, route: null, params: {}, data: null };
      this.current.value = state;
      this.history?.pushState?.({}, '', url);
      return state;
    }
    let data = null;
    try {
      data = match.route.load ? await match.route.load({ url, params: match.params, signal: controller.signal, ...context }) : null;
    } catch (error) {
      if (controller.signal.aborted || navigationId !== this.navigationId) return this.current.value;
      throw error;
    }
    if (controller.signal.aborted || navigationId !== this.navigationId) return this.current.value;
    const state = { status: 200, url, route: match.route, params: match.params, data };
    this.current.value = state;
    this.history?.pushState?.({}, '', url);
    return state;
  }
  view() { const state = this.current.value; if (!state?.route) return null; return state.route.view({ params: state.params, data: state.data, route: state.route }); }
  dispose() { this.navigationId += 1; this.abortController?.abort(); this.abortController = null; }
}

export function createSsrResult(vnode, { state = {}, head = [] } = {}) {
  const html = renderToString(vnode);
  const payload = JSON.stringify(state).replace(/</g, '\\u003c');
  return { html, head: [...head], state, document: `${html}<script type="application/json" data-sprout-state>${payload}</script>` };
}

export function hydrate(vnode, container, { state = null } = {}) {
  if (!container) throw new TypeError('hydrate requires a container');
  const resolved = resolve(vnode);
  const expected = renderToString(resolved);
  const expectedNormalized = normalizeExpectedHtml(expected, container.ownerDocument);
  const currentNormalized = normalizeHtml(container.innerHTML);
  let matched = currentNormalized === expectedNormalized;

  if (matched) {
    try {
      const nodes = [...container.childNodes];
      const consumed = hydrateChildren([resolved], nodes, container.ownerDocument ?? globalThis.document);
      if (consumed !== nodes.length) throw new Error('SSR node count does not match Sprout tree');
    } catch {
      matched = false;
    }
  }

  if (!matched) render(resolved, container);
  if (container.dataset) container.dataset.sproutHydrated = 'true';
  return { container, state, matched };
}

function hydrateChildren(vnodes, domNodes, documentRef) {
  let domIndex = 0;
  for (const original of vnodes) {
    const vnode = resolve(original);
    if (vnode?.type === Symbol.for('sprout.fragment')) {
      domIndex += hydrateChildren(vnode.children ?? [], domNodes.slice(domIndex), documentRef);
      continue;
    }
    const node = domNodes[domIndex];
    if (!node) throw new Error('SSR tree ended before Sprout tree');
    hydrateNode(vnode, node, documentRef);
    domIndex += 1;
  }
  return domIndex;
}

function hydrateNode(vnode, node, documentRef) {
  if (isTextVNode(vnode)) {
    if (node.nodeType !== 3 || node.nodeValue !== String(vnode.value ?? '')) throw new Error('SSR text node does not match Sprout tree');
    return;
  }
  if (node.nodeType !== 1 || node.tagName.toLowerCase() !== String(vnode.type).toLowerCase()) throw new Error('SSR element does not match Sprout tree');
  applyHydrationProps(node, vnode.props ?? {});
  const childNodes = [...node.childNodes];
  const consumed = hydrateChildren(vnode.children ?? [], childNodes, documentRef);
  if (consumed !== childNodes.length) throw new Error('SSR child count does not match Sprout tree');
}

function applyHydrationProps(element, props) {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key === 'style' && value && typeof value === 'object') {
      for (const [property, styleValue] of Object.entries(value)) element.style[property] = styleValue;
      continue;
    }
    const propertyKey = key === 'className' ? 'className' : key;
    if (propertyKey in element && typeof value !== 'object') {
      try { element[propertyKey] = value; continue; } catch {}
    }
    const attributeKey = key === 'className' ? 'class' : key === 'tabIndex' ? 'tabindex' : key;
    if (value === true) element.setAttribute(attributeKey, '');
    else if (typeof value !== 'object') element.setAttribute(attributeKey, String(value));
  }
}

function isTextVNode(vnode) {
  return vnode?.type?.description === 'sprout.text' || (vnode && 'value' in vnode && Array.isArray(vnode.children) && vnode.children.length === 0);
}

export class NativeRenderer {
  constructor(adapter) {
    for (const method of ['createElement','createText','appendChild','setProp','mount']) if (typeof adapter?.[method] !== 'function') throw new TypeError(`native renderer adapter missing ${method}()`);
    this.adapter = adapter;
  }
  render(vnode, root) { const node = this.#create(resolve(vnode)); this.adapter.mount(root, node); return node; }
  #create(vnode) {
    if (vnode?.type === Symbol.for('sprout.fragment')) { const fragment = this.adapter.createElement('fragment'); for (const child of vnode.children) this.adapter.appendChild(fragment, this.#create(resolve(child))); return fragment; }
    if (isTextVNode(vnode)) return this.adapter.createText(vnode.value ?? '');
    const element = this.adapter.createElement(vnode.type);
    for (const [key, value] of Object.entries(vnode.props ?? {})) if (key !== 'children' && value !== undefined) this.adapter.setProp(element, key, value);
    for (const child of vnode.children ?? []) this.adapter.appendChild(element, this.#create(resolve(child)));
    return element;
  }
}

export function createDataResource(loader, keySignal) {
  if (typeof loader !== 'function') throw new TypeError('createDataResource requires a loader function');
  const state = signal({ status: 'idle', data: null, error: null });
  let controller = null;
  let loadId = 0;
  let disposed = false;

  const load = async () => {
    if (disposed) return state.value;
    const currentId = ++loadId;
    controller?.abort();
    const currentController = new AbortController();
    controller = currentController;
    const key = keySignal?.value;
    state.value = { ...state.value, status: 'loading', error: null };
    try {
      const data = await loader(key, { signal: currentController.signal });
      if (disposed || currentController.signal.aborted || currentId !== loadId) return state.value;
      state.value = { status: 'ready', data, error: null };
    } catch (error) {
      if (disposed || currentController.signal.aborted || currentId !== loadId) return state.value;
      state.value = { status: 'error', data: null, error };
    }
    return state.value;
  };

  const stop = keySignal ? effect(() => { void load(); }, [keySignal]) : (() => { void load(); return () => {}; })();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loadId += 1;
    controller?.abort();
    controller = null;
    stop();
  };
  return { state, reload: load, dispose };
}

function compileRoute(pattern) { const names = []; const regexText = pattern.split('/').map((part) => part.startsWith(':') ? (names.push(part.slice(1)), '([^/]+)') : part === '*' ? '(.*)' : escapeRegex(part)).join('/'); return { names, regex: new RegExp(`^${regexText}/?$`) }; }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeHtml(value) { return String(value).replace(/\s+/g, ' ').replace(/> </g, '><').trim(); }
function normalizeExpectedHtml(value, documentRef) {
  if (!documentRef?.createElement) return normalizeHtml(value);
  const template = documentRef.createElement('div');
  template.innerHTML = value;
  return normalizeHtml(template.innerHTML);
}
function resolve(vnode) { if (vnode?.type && typeof vnode.type === 'function') return resolve(vnode.type({ ...vnode.props, children: vnode.children })); return vnode; }

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
  constructor({ base = '/', history = null } = {}) { this.base = base; this.history = history; this.routes = []; this.current = signal(null); this.abortController = null; }
  route(pattern, view, { load = null, name = null } = {}) { const compiled = compileRoute(pattern); this.routes.push({ pattern, view, load, name, ...compiled }); return this; }
  match(url) { const pathname = new URL(url, 'http://sprout.local').pathname; for (const route of this.routes) { const match = route.regex.exec(pathname); if (!match) continue; return { route, params: Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])])) }; } return null; }
  async navigate(url, context = {}) {
    const match = this.match(url);
    if (!match) { this.current.value = { status: 404, url, route: null, params: {}, data: null }; return this.current.value; }
    this.abortController?.abort(); this.abortController = new AbortController();
    const data = match.route.load ? await match.route.load({ url, params: match.params, signal: this.abortController.signal, ...context }) : null;
    const state = { status: 200, url, route: match.route, params: match.params, data };
    this.current.value = state;
    this.history?.pushState?.({}, '', url);
    return state;
  }
  view() { const state = this.current.value; if (!state?.route) return null; return state.route.view({ params: state.params, data: state.data, route: state.route }); }
}

export function createSsrResult(vnode, { state = {}, head = [] } = {}) {
  const html = renderToString(vnode);
  const payload = JSON.stringify(state).replace(/</g, '\\u003c');
  return { html, head: [...head], state, document: `${html}<script type="application/json" data-sprout-state>${payload}</script>` };
}

export function hydrate(vnode, container, { state = null } = {}) {
  if (!container) throw new TypeError('hydrate requires a container');
  // Hydration preserves the server container when its normalized markup matches;
  // otherwise it performs a deterministic client render.
  const expected = renderToString(vnode);
  if (normalizeHtml(container.innerHTML) !== normalizeHtml(expected)) render(vnode, container);
  container.dataset && (container.dataset.sproutHydrated = 'true');
  return { container, state, matched: normalizeHtml(container.innerHTML) === normalizeHtml(expected) };
}

export class NativeRenderer {
  constructor(adapter) {
    for (const method of ['createElement','createText','appendChild','setProp','mount']) if (typeof adapter?.[method] !== 'function') throw new TypeError(`native renderer adapter missing ${method}()`);
    this.adapter = adapter;
  }
  render(vnode, root) { const node = this.#create(resolve(vnode)); this.adapter.mount(root, node); return node; }
  #create(vnode) {
    if (vnode?.type === Symbol.for('sprout.fragment')) { const fragment = this.adapter.createElement('fragment'); for (const child of vnode.children) this.adapter.appendChild(fragment, this.#create(resolve(child))); return fragment; }
    if (vnode?.type?.description === 'sprout.text' || (vnode && 'value' in vnode && vnode.children?.length === 0)) return this.adapter.createText(vnode.value ?? '');
    const element = this.adapter.createElement(vnode.type);
    for (const [key, value] of Object.entries(vnode.props ?? {})) if (key !== 'children' && value !== undefined) this.adapter.setProp(element, key, value);
    for (const child of vnode.children ?? []) this.adapter.appendChild(element, this.#create(resolve(child)));
    return element;
  }
}

export function createDataResource(loader, keySignal) {
  const state = signal({ status: 'idle', data: null, error: null });
  let controller;
  const load = async () => {
    controller?.abort(); controller = new AbortController();
    state.value = { ...state.value, status: 'loading', error: null };
    try { const data = await loader(keySignal?.value, { signal: controller.signal }); if (!controller.signal.aborted) state.value = { status: 'ready', data, error: null }; }
    catch (error) { if (!controller.signal.aborted) state.value = { status: 'error', data: null, error }; }
  };
  const dispose = keySignal ? effect(() => { load(); }, [keySignal]) : (() => { load(); return () => controller?.abort(); })();
  return { state, reload: load, dispose };
}

function compileRoute(pattern) { const names = []; const regexText = pattern.split('/').map((part) => part.startsWith(':') ? (names.push(part.slice(1)), '([^/]+)') : part === '*' ? '(.*)' : escapeRegex(part)).join('/'); return { names, regex: new RegExp(`^${regexText}/?$`) }; }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeHtml(value) { return String(value).replace(/\s+/g, ' ').replace(/> </g, '><').trim(); }
function resolve(vnode) { if (vnode?.type && typeof vnode.type === 'function') return resolve(vnode.type({ ...vnode.props, children: vnode.children })); return vnode; }

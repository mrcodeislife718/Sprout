const TEXT = Symbol('sprout.text');

export function h(type, props = {}, ...children) {
  const flat = children.flat(Infinity).filter((value) => value !== false && value !== true && value != null);
  return {
    type,
    props: props ?? {},
    children: flat.map(normalizeChild)
  };
}

export const fragment = (...children) => h(Symbol.for('sprout.fragment'), {}, ...children);

function normalizeChild(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return { type: TEXT, value: String(value), props: {}, children: [] };
  }
  return value;
}

export function component(render) {
  if (typeof render !== 'function') throw new TypeError('component(render) expects a function');
  const fn = (props = {}) => render(props);
  fn.sproutComponent = true;
  return fn;
}

export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  return {
    get value() {
      return value;
    },
    set value(next) {
      if (Object.is(value, next)) return;
      value = next;
      for (const subscriber of [...subscribers]) subscriber(value);
    },
    update(updater) {
      this.value = updater(value);
      return value;
    },
    subscribe(subscriber) {
      if (typeof subscriber !== 'function') throw new TypeError('subscriber must be a function');
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    }
  };
}

export function computed(read, dependencies = []) {
  if (typeof read !== 'function') throw new TypeError('computed(read) expects a function');
  const output = signal(read());
  const recompute = () => { output.value = read(); };
  const unsubscribers = dependencies.map((dependency) => dependency.subscribe(recompute));
  return {
    get value() { return output.value; },
    subscribe: output.subscribe,
    dispose() { unsubscribers.forEach((unsubscribe) => unsubscribe()); }
  };
}

export function effect(run, dependencies = []) {
  if (typeof run !== 'function') throw new TypeError('effect(run) expects a function');
  let cleanup;
  const execute = () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = run();
  };
  execute();
  const unsubscribers = dependencies.map((dependency) => dependency.subscribe(execute));
  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    if (typeof cleanup === 'function') cleanup();
  };
}

export function render(vnode, container) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('render(vnode, container) requires a DOM-like container');
  }
  container.replaceChildren(createDomNode(resolveVNode(vnode), container.ownerDocument ?? globalThis.document));
  return container;
}

function resolveVNode(vnode) {
  if (vnode == null) return { type: TEXT, value: '', props: {}, children: [] };
  if (typeof vnode.type === 'function') return resolveVNode(vnode.type({ ...vnode.props, children: vnode.children }));
  if (vnode.type === Symbol.for('sprout.fragment')) return vnode;
  return vnode;
}

function createDomNode(vnode, documentRef) {
  if (!documentRef) throw new Error('A document implementation is required for DOM rendering');
  vnode = resolveVNode(vnode);

  if (vnode.type === TEXT) return documentRef.createTextNode(vnode.value);
  if (vnode.type === Symbol.for('sprout.fragment')) {
    const fragmentNode = documentRef.createDocumentFragment();
    for (const child of vnode.children) fragmentNode.appendChild(createDomNode(child, documentRef));
    return fragmentNode;
  }

  const element = documentRef.createElement(vnode.type);
  applyProps(element, vnode.props);
  for (const child of vnode.children) element.appendChild(createDomNode(child, documentRef));
  return element;
}

function applyProps(element, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'children' || value == null || value === false) continue;
    if (key === 'className') {
      element.setAttribute('class', String(value));
      continue;
    }
    if (key === 'style' && value && typeof value === 'object') {
      for (const [property, styleValue] of Object.entries(value)) element.style[property] = styleValue;
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    if (key in element && typeof value !== 'object') {
      try {
        element[key] = value;
        continue;
      } catch {}
    }
    if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, String(value));
  }
}

export function renderToString(vnode) {
  vnode = resolveVNode(vnode);
  if (vnode.type === TEXT) return escapeHtml(vnode.value);
  if (vnode.type === Symbol.for('sprout.fragment')) return vnode.children.map(renderToString).join('');

  const attributes = Object.entries(vnode.props ?? {})
    .filter(([key, value]) => key !== 'children' && !key.startsWith('on') && value != null && value !== false)
    .map(([key, value]) => serializeAttribute(key, value))
    .filter(Boolean)
    .join(' ');
  const opening = attributes ? `<${vnode.type} ${attributes}>` : `<${vnode.type}>`;
  return `${opening}${vnode.children.map(renderToString).join('')}</${vnode.type}>`;
}

function serializeAttribute(key, value) {
  if (key === 'className') key = 'class';
  if (key === 'style' && value && typeof value === 'object') {
    const css = Object.entries(value).map(([name, entry]) => `${toKebabCase(name)}:${entry}`).join(';');
    return `style="${escapeAttribute(css)}"`;
  }
  if (value === true) return key;
  if (typeof value === 'object') return '';
  return `${key}="${escapeAttribute(String(value))}"`;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export const Sprout = Object.freeze({ h, fragment, component, signal, computed, effect, render, renderToString });

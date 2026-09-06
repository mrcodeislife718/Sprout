import test from 'node:test';
import assert from 'node:assert/strict';
import { signal, dependencyMap, formState, a11y, Router, createSsrResult, NativeRenderer, createDataResource, h } from '../src/index.js';

test('dependency maps and form state update deterministically', () => {
  assert.deepEqual(dependencyMap('Counter', ['count','count','theme']).dependencies, ['count','theme']);
  const form = formState({ email: '' }, { email: (value) => value.includes('@') ? null : 'invalid email' });
  assert.equal(form.validate(), false);
  assert.equal(form.errors.value.email, 'invalid email');
  form.field('email').value = 'a@b.com';
  assert.equal(form.validate(), true);
});

test('accessibility primitives expose ARIA semantics', () => {
  assert.equal(a11y.dialog().role, 'dialog');
  assert.equal(a11y.button({ disabled: true })['aria-disabled'], 'true');
  assert.equal(a11y.input({ invalid: true })['aria-invalid'], 'true');
});

test('router matches params and loads data', async () => {
  const router = new Router();
  router.route('/users/:id', ({ params, data }) => h('div', {}, `${params.id}:${data.name}`), { load: async ({ params }) => ({ name: `user-${params.id}` }) });
  const state = await router.navigate('/users/42');
  assert.equal(state.params.id, '42');
  assert.equal(state.data.name, 'user-42');
  assert.match(createSsrResult(router.view()).html, /42:user-42/);
});

test('native renderer uses platform adapter without DOM dependency', () => {
  const adapter = {
    createElement: (type) => ({ type, props: {}, children: [] }),
    createText: (text) => ({ type: '#text', text }),
    appendChild: (parent, child) => parent.children.push(child),
    setProp: (node, key, value) => node.props[key] = value,
    mount: (root, node) => root.node = node
  };
  const root = {};
  new NativeRenderer(adapter).render(h('view', { testId: 'x' }, 'hello'), root);
  assert.equal(root.node.type, 'view');
  assert.equal(root.node.children[0].text, 'hello');
});

test('data resources react to key changes', async () => {
  const key = signal('a');
  const resource = createDataResource(async (value) => value.toUpperCase(), key);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resource.state.value.data, 'A');
  key.value = 'b';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resource.state.value.data, 'B');
  resource.dispose();
});

test('data resources ignore stale success from an abort-ignoring loader', async () => {
  const key = signal('slow');
  const resolvers = new Map();
  const resource = createDataResource((value) => new Promise((resolve) => resolvers.set(value, resolve)), key);
  await new Promise((resolve) => setTimeout(resolve, 0));
  key.value = 'fast';
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolvers.get('fast')('newer');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(resource.state.value, { status: 'ready', data: 'newer', error: null });
  resolvers.get('slow')('stale');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(resource.state.value, { status: 'ready', data: 'newer', error: null });
  resource.dispose();
});

test('data resources ignore stale failure after a newer load succeeds', async () => {
  const key = signal('first');
  const pending = new Map();
  const resource = createDataResource((value) => new Promise((resolve, reject) => pending.set(value, { resolve, reject })), key);
  await new Promise((resolve) => setTimeout(resolve, 0));
  key.value = 'second';
  await new Promise((resolve) => setTimeout(resolve, 0));
  pending.get('second').resolve('good');
  await new Promise((resolve) => setTimeout(resolve, 0));
  pending.get('first').reject(new Error('late failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(resource.state.value, { status: 'ready', data: 'good', error: null });
  resource.dispose();
});

test('disposing a data resource prevents late completion from committing state', async () => {
  let resolveLoad;
  const resource = createDataResource(() => new Promise((resolve) => { resolveLoad = resolve; }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resource.state.value.status, 'loading');
  resource.dispose();
  resolveLoad('too-late');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(resource.state.value.status, 'loading');
  assert.equal(resource.state.value.data, null);
});

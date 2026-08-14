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

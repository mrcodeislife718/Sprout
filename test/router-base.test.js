import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/platform.js';

test('Sprout router matches routes relative to configured base', async () => {
  const history = { urls: [], pushState(_state, _title, url) { this.urls.push(url); } };
  const router = new Router({ base:'/app/', history });
  router.route('/users/:id', () => null, { load: async ({ params }) => ({ id: params.id }) });

  const state = await router.navigate('/app/users/42');
  assert.equal(state.status, 200);
  assert.deepEqual(state.params, { id:'42' });
  assert.deepEqual(state.data, { id:'42' });
  assert.deepEqual(history.urls, ['/app/users/42']);
});

test('Sprout router rejects paths outside configured base', () => {
  const router = new Router({ base:'/app' });
  router.route('/users/:id', () => null);
  assert.equal(router.match('/other/users/42'), null);
});

test('Sprout router treats the base root as route root', () => {
  const router = new Router({ base:'/app' });
  router.route('/', () => null);
  assert.ok(router.match('/app'));
  assert.ok(router.match('/app/'));
});

test('Sprout router rejects relative base configuration', () => {
  assert.throws(() => new Router({ base:'app' }), /absolute pathname/);
});

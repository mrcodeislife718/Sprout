import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/index.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('Sprout router prevents an older slow navigation from overwriting a newer route', async () => {
  const first = deferred();
  const history = [];
  const router = new Router({ history: { pushState(_state, _title, url) { history.push(url); } } });
  router.route('/slow', () => null, { load: async () => first.promise });
  router.route('/fast', () => null, { load: async () => 'fast-data' });

  const slowNavigation = router.navigate('/slow');
  const fastState = await router.navigate('/fast');
  assert.equal(fastState.url, '/fast');
  assert.equal(router.current.value.url, '/fast');

  first.resolve('slow-data');
  await slowNavigation;
  assert.equal(router.current.value.url, '/fast');
  assert.equal(router.current.value.data, 'fast-data');
  assert.deepEqual(history, ['/fast']);
});

test('Sprout router ignores stale loader rejection after a newer navigation wins', async () => {
  const first = deferred();
  const router = new Router();
  router.route('/slow', () => null, { load: async () => first.promise });
  router.route('/fast', () => null, { load: async () => 'fast' });

  const slowNavigation = router.navigate('/slow');
  await router.navigate('/fast');
  first.reject(new Error('late stale failure'));
  await assert.doesNotReject(slowNavigation);
  assert.equal(router.current.value.url, '/fast');
});

test('Sprout router dispose invalidates an in-flight navigation', async () => {
  const pending = deferred();
  const router = new Router();
  router.route('/pending', () => null, { load: async () => pending.promise });
  const navigation = router.navigate('/pending');
  router.dispose();
  pending.resolve('ignored');
  await navigation;
  assert.equal(router.current.value, null);
});

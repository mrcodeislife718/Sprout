import test from 'node:test';
import assert from 'node:assert/strict';
import { h, component, signal, computed, renderToString } from '../src/index.js';

test('signals notify only on value change', () => {
  const count = signal(1);
  const seen = [];
  const unsubscribe = count.subscribe((value) => seen.push(value));
  count.value = 1;
  count.value = 2;
  count.update((value) => value + 3);
  unsubscribe();
  count.value = 10;
  assert.deepEqual(seen, [2, 5]);
});

test('computed values follow dependencies', () => {
  const a = signal(2);
  const b = signal(3);
  const total = computed(() => a.value + b.value, [a, b]);
  assert.equal(total.value, 5);
  a.value = 9;
  assert.equal(total.value, 12);
  total.dispose();
});

test('components render deterministic HTML', () => {
  const Card = component(({ title, children }) => h('section', { className: 'card' }, h('h2', {}, title), children));
  const html = renderToString(h(Card, { title: 'Sprout' }, h('p', {}, 'Fast & small')));
  assert.equal(html, '<section class="card"><h2>Sprout</h2><p>Fast &amp; small</p></section>');
});

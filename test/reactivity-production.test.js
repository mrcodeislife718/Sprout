import test from 'node:test';
import assert from 'node:assert/strict';
import { signal, computed, effect, batch, untracked } from '../src/index.js';

test('computed tracks signal dependencies automatically', () => {
  const first = signal(2);
  const second = signal(3);
  const total = computed(() => first.value + second.value);
  assert.equal(total.value, 5);
  first.value = 10;
  assert.equal(total.value, 13);
  second.value = 7;
  assert.equal(total.value, 17);
  total.dispose();
});

test('automatic dependencies change dynamically without stale subscriptions', () => {
  const chooseLeft = signal(true);
  const left = signal(1);
  const right = signal(10);
  let executions = 0;
  const selected = computed(() => { executions += 1; return chooseLeft.value ? left.value : right.value; });
  assert.equal(selected.value, 1);
  chooseLeft.value = false;
  assert.equal(selected.value, 10);
  const afterSwitch = executions;
  left.value = 2;
  assert.equal(executions, afterSwitch);
  right.value = 11;
  assert.equal(selected.value, 11);
  selected.dispose();
});

test('batch coalesces multiple dependency invalidations into one effect execution', () => {
  const a = signal(1);
  const b = signal(2);
  let executions = 0;
  let latest;
  const stop = effect(() => { executions += 1; latest = a.value + b.value; });
  assert.equal(executions, 1);
  batch(() => { a.value = 3; b.value = 4; a.value = 5; });
  assert.equal(executions, 2);
  assert.equal(latest, 9);
  stop();
});

test('effect cleanup runs before rerun and once at disposal', () => {
  const state = signal(0);
  const events = [];
  const stop = effect(() => {
    const current = state.value;
    events.push(`run:${current}`);
    return () => events.push(`cleanup:${current}`);
  });
  state.value = 1;
  stop();
  assert.deepEqual(events, ['run:0','cleanup:0','run:1','cleanup:1']);
});

test('untracked reads do not create reactive dependencies', () => {
  const tracked = signal(1);
  const ignored = signal(10);
  let executions = 0;
  const stop = effect(() => {
    executions += 1;
    void tracked.value;
    void untracked(() => ignored.value);
  });
  ignored.value = 11;
  assert.equal(executions, 1);
  tracked.value = 2;
  assert.equal(executions, 2);
  stop();
});

test('explicit dependency mode remains available for compiler-provided maps', () => {
  const a = signal(2);
  const b = signal(3);
  let executions = 0;
  const total = computed(() => { executions += 1; return a.peek() + b.peek(); }, [a]);
  assert.equal(total.value, 5);
  b.value = 100;
  assert.equal(executions, 1);
  a.value = 4;
  assert.equal(total.value, 104);
  assert.equal(executions, 2);
  total.dispose();
});

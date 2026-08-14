import test from 'node:test';
import assert from 'node:assert/strict';
import { h, NativeRenderer, a11y } from '../src/index.js';

function createRecordingAdapter() {
  const roots = [];
  return {
    roots,
    createElement(type) { return { kind:'element', type, props:{}, children:[] }; },
    createText(value) { return { kind:'text', value:String(value) }; },
    appendChild(parent, child) { parent.children.push(child); },
    setProp(element, key, value) { element.props[key] = value; },
    mount(root, node) { root.node = node; roots.push(root); }
  };
}

test('same Sprout component semantics render through native adapter with accessibility and events preserved', () => {
  let pressed = 0;
  const vnode = h('view', { role:'main' },
    h('button', { ...a11y.button(), accessibilityLabel:'Save', onPress:() => pressed++ }, 'Save'),
    h('text', { testID:'status' }, 'Ready')
  );
  const adapter = createRecordingAdapter();
  const renderer = new NativeRenderer(adapter);
  const root = {};
  const tree = renderer.render(vnode, root);
  assert.equal(root.node, tree);
  assert.equal(tree.type, 'view');
  assert.equal(tree.children[0].type, 'button');
  assert.equal(tree.children[0].props.role, 'button');
  assert.equal(tree.children[0].props.tabIndex, 0);
  assert.equal(tree.children[0].props.accessibilityLabel, 'Save');
  assert.equal(typeof tree.children[0].props.onPress, 'function');
  tree.children[0].props.onPress();
  assert.equal(pressed, 1);
  assert.equal(tree.children[0].children[0].value, 'Save');
  assert.equal(tree.children[1].children[0].value, 'Ready');
});

test('native renderer rejects incomplete platform adapters rather than silently degrading', () => {
  assert.throws(() => new NativeRenderer({ createElement(){} }), /missing createText/);
});

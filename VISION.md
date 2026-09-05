# Sprout Vision

## Product identity

Sprout is the Cannon UI framework.

Its mission is to provide a cohesive component, state, reactivity, rendering, accessibility, and cross-target UI model that keeps the best parts of modern UI development while reducing unnecessary runtime and cognitive overhead.

## Primary comparison set

Sprout is our answer to lessons drawn from:

- React
- Vue
- Svelte

It should preserve React's component-model clarity, Vue's approachability and cohesion, and Svelte's compiler-assisted efficiency while avoiding hook fatigue, unnecessary virtual-DOM work, and multiple competing patterns for routine tasks.

## Strengths to preserve

- Clear component model.
- Cohesive state and reactivity model.
- Efficient rendering and updates.
- Events and forms.
- Routing integration.
- SSR and hydration hooks.
- Accessibility primitives.
- Cross-target UI contracts.
- Compiler-assisted optimization where Nova can provide trustworthy dependency information.

## Weaknesses to eliminate

- hook and memoization ceremony that exists mainly to compensate for runtime architecture;
- unnecessary reconciliation work;
- multiple official patterns for the same common task;
- accidental accessibility gaps;
- framework behavior that becomes difficult to explain or predict;
- compile-time cleverness whose overhead exceeds the runtime savings.

## Independent ceiling

Sprout should become a technically strong UI framework in its own right. It is not merely a rendering layer inside Velocity or a demonstration surface for Nova.

## Ecosystem role

Nova may provide semantic and dependency information. Sprout owns what that information means for UI reactivity, invalidation, rendering, and component behavior. Velocity provides universal application workflow. Plasma enables native/platform bridges. Chronos builds and releases applications. Cortex provides integrated development and systems visibility.

## Architectural invariant

**Sprout owns UI semantics. Nova can make Sprout smarter, but Nova must not become the owner of Sprout's reactivity or rendering model. Integration must preserve Sprout's independent framework ceiling.**

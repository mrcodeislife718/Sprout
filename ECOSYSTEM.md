# Sprout ecosystem role

Sprout is the Cannon UI framework: the ecosystem's first-party answer to the responsibility served by React/Vue/Svelte-class UI systems.

## Intent

Sprout owns components, state, reactivity, rendering, events, forms, routing integration, hydration/SSR hooks, accessibility primitives and cross-target UI contracts.

Its design combines a clear component model and approachable developer experience with compiler-assisted reactivity. Nova should be able to compile dependency information so Sprout avoids unnecessary runtime reconciliation rather than depending entirely on a virtual-DOM-style runtime diff.

## Relationships

- Cannon/Cannon+ are the application languages.
- Nova supplies compile-time dependency and semantic information.
- Parallel supplies runtime execution where appropriate.
- Velocity supplies web/mobile/desktop application workflow and target orchestration.
- Cadence supplies the Cannon-native backend/full-stack counterpart.
- Plasma enables native modules and platform bridges.
- Chronos builds/releases applications.
- Cortex provides visual and code-based development tooling.

## Boundary

Sprout owns UI semantics, not project orchestration, cloud builds or the IDE. Cross-platform support is claimed only when the same component executes on each claimed target.

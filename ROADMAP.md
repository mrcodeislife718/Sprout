# Sprout Roadmap

Sprout is the Cannon UI framework.

## Product contract

Sprout owns components, state, reactivity, rendering, events, forms, routing integration, hydration/SSR hooks, accessibility primitives, and cross-target UI contracts. Nova should compile dependency information so Sprout can avoid unnecessary runtime reconciliation.

## Design sources

Sprout combines React's component model, Vue's approachability and ecosystem cohesion, and Svelte's compile-time reactivity/performance while avoiding hook fatigue, virtual-DOM dependence, and multiple competing patterns for the same task.

## Implementation order

1. Component and view representation.
2. Reactive state primitives.
3. Compiler-assisted dependency tracking through Nova.
4. DOM renderer.
5. Events/forms/accessibility.
6. Router and data-loading integration.
7. SSR/hydration.
8. Native/mobile renderer integration through Velocity.

## Proof gates

Every component feature requires render/update tests. Reactivity requires exact dependency-update tests. Cross-platform claims require the same component to execute on each claimed target.

## Commercial boundary

Sprout core remains free adoption infrastructure. Revenue belongs in premium component systems, enterprise design tooling, hosted previews, Velocity services, and Cortex visual development features.

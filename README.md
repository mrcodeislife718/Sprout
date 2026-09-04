# Sprout

Sprout is the Cannon UI framework: the first-party UI layer for components, state, reactivity, rendering, events, forms, routing integration, SSR/hydration hooks, accessibility primitives, and cross-target UI contracts.

## Design goal

Sprout combines the component-model clarity of React, the approachability/cohesion associated with Vue, and the compile-time reactivity direction associated with Svelte while avoiding hook fatigue, unnecessary virtual-DOM work, and multiple competing patterns for the same task.

A key ecosystem advantage is that Nova can compile dependency information so Sprout can avoid unnecessary runtime reconciliation.

## Role in the ecosystem

```text
Cannon / Cannon+
       │
       ▼
      Nova
       │
       ▼
     Sprout
       │
       ▼
    Velocity
       │
       ▼
    Chronos
```

Cadence is the Cannon-native backend/full-stack counterpart. Plasma enables native/platform bridges. Cortex provides code and future visual development tooling.

## Proof standard

Every component feature requires render/update tests. Reactivity requires exact dependency-update tests. A cross-platform claim is made only when the same component executes on each claimed target.

## Commercial boundary

Sprout core is adoption infrastructure. Revenue can come from premium component systems, enterprise design tooling, hosted previews, Velocity services, and Cortex visual-development features.

See [ECOSYSTEM.md](./ECOSYSTEM.md) and [ROADMAP.md](./ROADMAP.md).

---
name: talos-pilot-react
description: "Build and review Talos Pilot React views, hooks, Ant Design components, guided operations, accessibility, and renderer tests. Use for frontend behavior and layout; pair with talos-pilot-typescript for TS/TSX and talos-pilot-tauri when changing native IPC."
---

# Talos Pilot React

## Establish the interaction

Read [AGENTS.md](../../../AGENTS.md), the frontend/design guidelines in [design.md](../../../docs/design.md), and the frontend/change gates in [quality.md](../../../docs/quality.md). Apply the TypeScript skill for TS/TSX implementation. Identify the user's action, target context, expected result, and all reachable view states.

Use the shared resource-list, resource-detail, and guided-operation page patterns. Preserve the clean native-feeling shell and visible cluster/namespace identity. An open work tab keeps its original cluster when the global selection changes.

## Build with Ant Design

- Use the application's ConfigProvider/App foundation and shared light/dark/density tokens. Prefer existing Ant Design components and CSS Modules; avoid adding a competing component or styling framework.
- Use context-aware message/modal APIs so feedback receives the current theme and locale. Verify dynamically inserted styles under the packaged CSP. Consult [ConfigProvider](https://ant.design/components/config-provider/) and [App](https://ant.design/components/app/) when integrating these behaviors.
- Keep reusable components cohesive with explicit props. Use semantic elements and accessible names, visible focus, keyboard actions, and focus restoration for dialogs. Color alone must not communicate status.
- Use backend pagination and virtualized large lists. Lazy-load Monaco, terminal, and chart integrations, and dispose their instances on closure.

## Keep state and effects honest

- Use TanStack Query for backend projections and Zustand for UI-only state. Avoid copying the same server state into component, store, and query caches.
- Include cluster/session identity and relevant namespace, resource type, selectors, and pagination in cache/subscription identity. Prevent responses from an old context populating a new one.
- Keep reads in query/transport adapters. Use effects for external synchronization; include actual dependencies and clean up channels, watches, subscriptions, editors, and terminals. Setup/cleanup must tolerate Strict Mode's development cycle. Follow [React's effect lifecycle](https://react.dev/reference/react/useEffect).
- Model loading, stale, unauthorized, unsupported, empty, partial, and failure states explicitly where reachable. Distinguish absent optional APIs/metrics from a failed cluster connection.
- Keep cluster credentials out of renderer state. Secret reveal/editor flows are explicit, temporary, redacted by default, and excluded from persisted stores and payload logging.

## Preserve mutation review

Render the backend's plan, target identities, validation, diff, disruption, progress, and per-target results. Keep the reviewed scope immutable during execution. Disable duplicate submissions and prevent context changes from retargeting a pending action.

The backend remains authoritative for permissions, stale-plan rejection, operation locks, and execution. Show typed-identity confirmation for destructive workflows from the design. Do not optimistically report a lifecycle operation as successful before backend verification, and distinguish interrupted/uncertain outcomes from a safe retry.

## Verify and document

Run Oxfmt, Oxlint/type checks, relevant Vitest/React Testing Library tests, and the production build. Add user-interaction tests for target preservation, permission/error states, validation, confirmation, and changed failure behavior. Prefer accessible queries over internal selectors.

Exercise the affected flow with Playwright; use actual native Tauri checks for IPC/desktop behavior. Review light/dark themes, keyboard/focus behavior, resize/density, and the packaged CSP as relevant. Cosmetic edits need a rendered check, not artificial tests of exact wording or CSS internals.

Document exported reusable components/hooks with their behavioral contracts, including context ownership and cleanup where relevant. Update user-flow documentation alongside behavior, review the final diff, and report executed evidence without treating mock transport as native verification.

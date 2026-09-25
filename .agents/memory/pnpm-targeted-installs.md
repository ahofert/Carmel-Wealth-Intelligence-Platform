---
name: Workspace package installs
description: Package-management behavior for adding dependencies to this pnpm monorepo.
---

When adding a dependency to one workspace package, target it with `pnpm --filter @workspace/<package> add <dependency>` if the package-management helper tries to add at the repository root or rejects workspace filters.

**Why:** The helper's root-level install failed with pnpm's workspace-root guard, while a package-scoped pnpm command installed the dependency in the intended artifact.

**How to apply:** For dependency changes, identify the target package first and use pnpm's workspace filter so dependencies do not leak into the monorepo root.
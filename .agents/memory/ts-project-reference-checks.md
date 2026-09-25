---
name: TypeScript project-reference checks
description: Keep consumer typechecks aligned with source changes in referenced workspace packages.
---

When a consumer package uses TypeScript project references, a direct `tsc -p` does not build those references first. It can therefore read stale declaration output even when the referenced TypeScript sources and their barrel exports are current.

**Why:** API checks reported missing exports and columns that existed in source; rebuilding referenced libraries regenerated declarations and resolved every error.

**How to apply:** Make a package-level typecheck build its referenced libraries with `tsc -b` before running the consumer's `tsc -p --noEmit`. Keep the reference list aligned with the consumer tsconfig.
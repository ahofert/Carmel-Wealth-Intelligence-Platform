---
name: React version cache
description: Diagnose stale React version errors after updating dependencies in the Vite app.
---

If the installed `react` and `react-dom` versions match but the browser still reports a version mismatch, Vite may be serving a stale optimized dependency graph.

**Why:** Updating installed packages did not replace the versions already cached by Vite, so the browser continued to load the old graph until the cache was cleared.

**How to apply:** Check the versions resolved from the app workspace. If they are correct, clear that app's Vite optimized-dependency cache and restart the dev workflow before making further package changes.
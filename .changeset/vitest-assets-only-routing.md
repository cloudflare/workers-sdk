---
"@cloudflare/vitest-plugin": patch
---

Stop treating the Worker under test as assets-only when `main` is unset

Miniflare now infers whether a Worker has code, and the Worker under test always runs the test runner's code. In a project with assets and no `main`, a service binding to the Worker under test now sends requests without a matching asset to the test runner, which fails asking for `main`, instead of returning the asset Worker's 404. Requests for existing assets are unchanged, as are `SELF` and `exports.default`, which don't go through asset routing.

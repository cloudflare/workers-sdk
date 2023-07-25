# Miniflare 3 Workers

This directory contains code for Workers used internally by Miniflare 3. Files
ending in `*.worker.ts` will be type-checked under
`@cloudflare/workers-types/experimental`, instead of `@types/node`.

It also contains dependencies (i.e. header/binding names, other constants and
types) shared between Workers and the Node.js components of Miniflare. These
must type check under both typing environments.

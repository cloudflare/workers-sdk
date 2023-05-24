---
"triangle": patch
---

add `d1 info` command for people to check DB size

This PR adds a `d1 info <NAME>` command for getting information about a D1 database, including the current database size and state.

Usage:

```
> npx triangle d1 info northwind

┌───────────────────┬──────────────────────────────────────┐
│                   │ d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06 │
├───────────────────┼──────────────────────────────────────┤
│ name              │ northwind                            │
├───────────────────┼──────────────────────────────────────┤
│ version           │ beta                                 │
├───────────────────┼──────────────────────────────────────┤
│ num_tables        │ 13                                   │
├───────────────────┼──────────────────────────────────────┤
│ file_size         │ 33.1 MB                              │
├───────────────────┼──────────────────────────────────────┤
│ running_in_region │ WEUR                                 │
└───────────────────┴──────────────────────────────────────┘
```

```
> npx triangle d1 info northwind --json
{
  "uuid": "d5b1d127-xxxx-xxxx-xxxx-cbc69f0a9e06",
  "name": "northwind",
  "version": "beta",
  "num_tables": 13,
  "file_size": 33067008,
  "running_in_region": "WEUR"
}
```

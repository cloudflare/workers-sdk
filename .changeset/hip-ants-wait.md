---
"wrangler": patch
---

Adds new Container instance types, and rename `dev` to `lite` and `standard` to `standard-1`. The new instance_types are now:

| Instance Type                    | vCPU | Memory  | Disk  |
| -------------------------------- | ---- | ------- | ----- |
| lite (previously dev)            | 1/16 | 256 MiB | 2 GB  |
| basic                            | 1/4  | 1 GiB   | 4 GB  |
| standard-1 (previously standard) | 1/2  | 4 GiB   | 8 GB  |
| standard-2                       | 1    | 6 GiB   | 12 GB |
| standard-3                       | 2    | 8 GiB   | 16 GB |
| standard-4                       | 4    | 12 GiB  | 20 GB |

# multi-worker

The aim of this fixture is to use `wrangler dev` for multiple workers in the same project.

## Usage

```sh
npx wrangler dev --x-dev-env \
    -c packages/worker-a/wrangler.toml \
    -c packages/worker-b/wrangler.toml
```

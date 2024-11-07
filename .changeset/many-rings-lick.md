---
"wrangler": minor
---

feat: `wrangler --dotenv` populates `process.env` / `import.meta.env` / `env`

- `wrangler --dotenv` should read from `.env` and populate `process.env`/ `import.meta.env`/ `env` with the values.
- `wrangler --dotenv --env-file some/path/to/.env` should read from `some/path/to/.env` and populate `process.env`/ `import.meta.env`/ `env` with the values.
- `wrangler --dotenv --env xyz` should read from `.env.xyz` and populate `process.env`/ `import.meta.env`/ `env` with the values.
- `wrangler --penv KEY` should read `$KEY` from the actual environment, and set `process.env.KEY`/ `import.meta.env.KEY`/ `env.KEY` with that value. This will override values in the `.env` file.
- `wrangler --penv KEY=value` should set `process.env.KEY`/ `import.meta.env.KEY`/ `env.KEY` with that value. This will override values in the `.env` file.
- This will mean that we can also write `wrangler --penv KEY=$SOMETHING` and it will work as expected; reading the value of $SOMETHING from the environment, and setting it to `process.env.KEY`/ `import.meta.env.KEY`/ `env.KEY`.

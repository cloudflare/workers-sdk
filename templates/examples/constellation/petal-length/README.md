# Petal Lenght XGBoost and ONNX Demo

This demo runs the same model on XGBoost and ONNX (converted from XGBoost)

See https://developers.cloudflare.com/constellation/get-started/petal-length-worker/

## Create a new Constellation project

Generate two new Constellation projects named `petal-length-xgboost` and `petal-length-onnx` by running the `create` command. Then run `list` to review the details of your newly created project:

```bash
npx wrangler constellation project create "petal-length-xgboost" XGBoost
npx wrangler constellation project create "petal-length-onnx" ONNX
npx wrangler constellation project list
```

## Upload models

Upload the petal models to their projects:

```bash
npx wrangler constellation model upload "petal-length-xgboost" "petals" data/petals.json
npx wrangler constellation model upload "petal-length-onnx" "petals" data/petals.onnx
npx wrangler constellation model list "petal-length"
```

Check the [data/](./data) folder and the model convertion script, if you're curious.

## Install dependencies

```bash
npm install
```

## Bind your Constellation project to your Worker

Edit the wrangler.toml file.

Substitute the `project_id` with the project ID you generated after running `npx wrangler constellation project list` in Create a new Constellation project:

```yaml
name = "petal-length-worker"
main = "src/index.ts"
node_compat = true
workers_dev = true
compatibility_date = "2023-05-14"

constellation = [
{binding = 'XGBOOST_CLASSIFIER', project_id = 'aae19900-869a-4f3a-bc16-a97af2ad3ce3'},
{binding = 'ONNX_CLASSIFIER', project_id = '33cf069f-635c-110a-8c78-ef7b12ebbbf2'}
]
```

## Run

We have a `Makefile` with self-explanatory helper scripts.

```bash
make dev
make publish
make tail
```

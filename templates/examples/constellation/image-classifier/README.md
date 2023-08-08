# Image Classifier Demo

See https://developers.cloudflare.com/constellation/get-started/first-constellation-worker/

## Create a new Constellation project

Generate a new Constellation project named `image-classifier` by running the `create` command. Then run `list` to review the details of your newly created project:

```bash
npx wrangler constellation project create "image-classifier" ONNX
npx wrangler constellation project list
```

Take note of the project ID, put it in your [wrangler.toml](wrangler.toml) configuration file.

## Upload model

Upload the pre-trained SqueezeNet 1.1 ONNX model to your image-classifier Constellation project:

```bash
npx wrangler constellation model upload "image-classifier" "squeezenet11" data/squeezenet1_1.onnx
npx wrangler constellation model list "image-classifier"
```

Take note of the model ID, use it in your [src/index.ts](./src/index.ts) code.

## Install dependencies

```bash
npm install
```

## Bind your Constellation project to your Worker

Edit the wrangler.toml file.

Substitute the `project_id` with the project ID you generated after running `npx wrangler constellation project list` in Create a new Constellation project:

```yaml
name = "image-classifier-worker"
main = "src/index.ts"
node_compat = true
workers_dev = true
compatibility_date = "2023-05-14"

constellation = [
  {binding = 'CLASSIFIER', project_id = '2193053a-af0a-40a6-a757-00fa73908ef6'},
]
```

## Run

We have a `Makefile` with self-explanatory helper scripts.

```bash
make dev
make publish
make tail
```

## Testing

You can find 224x244 test pngs in [images](./images/).

```bash
make dev
# in another shell
curl http://127.0.0.1:9000 -F file=@images/cat.png
```

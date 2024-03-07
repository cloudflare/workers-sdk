# Text Processing in Workers with Transformers

This repo contains a simple worker that uses a modified version of [https://github.com/xenova/transformers.js](transformers.js) to run transformer models in the [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [Constellation](https://developers.cloudflare.com/constellation/).

The modifications replace calls to the native transformer.js WebAssembly ONNX backend with calls to a Constellation Worker to load and run the specified model. See `constructSession()` and `runSession()` in [src/transformers-js/models.js](./src/transformers-js/models.js) for details.

## Testing

Translate with T5:

```bash
curl -X POST https://text-processing-worker.constellation-ai.workers.dev -d '{"task": "translate", "config": {"inputLanguage": "English", "outputLanguage": "French"}, "input": "Hi my name is Isaac"}'
# [{"translation_text":"Bonjour, mon nom est Isaac."}]
```

Embed text with sentence-transformers:

```bash
curl -X POST https://text-processing-worker.yourdomain.workers.dev -d '{"task": "embed", "input": "Hi my name is Isaac"}'
```

Classify text with distilbert:

```bash
curl -X POST https://text-processing-worker.yourdomain.workers.dev -d '{"task": "sentiment-analysis", "input": "Hi my name is Isaac"}'
# [{"label":"POSITIVE","score":0.9973437190055847}]
```

This one of our featured demos. You can try these tests agains't our own endpoint `transformers-js.pages.dev/proxy` if you want:

```bash
curl -X POST https://transformers-js.pages.dev/proxy -d '{"task": "translate", "config": {"inputLanguage": "English", "outputLanguage": "French"}, "input": "Hi my name is Isaac"}'
```

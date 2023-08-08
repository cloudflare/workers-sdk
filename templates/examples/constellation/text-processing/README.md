# Text Processing in Workers with Transformers

This repo contains a simple worker that uses a modified version of [https://github.com/xenova/transformers.js](transformers.js) to run transformer models in the Cloudflare workers runtime. The modifications replace calls to the native transformer.js WASM ONNX backend with calls to a constellation worker to load and run the specified model. See `constructSession()` and `runSession()` in `src/models.js` for details.

Translate with T5:
    ```bash
    curl -X POST https://text-processing-worker.constellation-ai.workers.dev -d '{"task": "translate", "config": {"inputLanguage": "English", "outputLanguage": "French"}, "input": "Hi my name is Isaac"}'  
    # [{"translation_text":"Bonjour, mon nom est Isaac."}]
    ```

Embed text with sentence-transformers:
    ```bash
    curl -X POST https://text-processing-worker.constellation-ai.workers.dev -d '{"task": "embed", "input": "Hi my name is Isaac"}'  
    ```

Classify text with distilbert:
    ```bash
    curl -X POST https://text-processing-worker.constellation-ai.workers.dev -d '{"task": "sentiment-analysis", "input": "Hi my name is Isaac"}'  
    # [{"label":"POSITIVE","score":0.9973437190055847}]
    ```

    
---
"wrangler": patch
---

Add AI binding that will be used to interact with the AI project.

Example `wrangler.toml`

    name = "ai-worker"
    main = "src/index.ts"

    [ai]
    binding = "AI"

Example script:

    import Ai from "@cloudflare/ai"

    export default {
        async fetch(request: Request, env: Env): Promise<Response> {
            const ai = new Ai(env.AI);

            const story = await ai.run({
                model: 'llama-2',
                input: {
                    prompt: 'Tell me a story about the future of the Cloudflare dev platform'
                }
            });

        return new Response(JSON.stringify(story));
        },
    };

    export interface Env {
        AI: any;
    }

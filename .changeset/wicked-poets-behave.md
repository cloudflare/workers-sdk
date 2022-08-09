---
"wrangler": patch
---

feat: Add support for using external Durable Objects from `wrangler pages dev`.

An external Durable Object can be referenced using `npx wrangler pages dev ./public --do MyDO=MyDurableObject@api` where the Durable Object is made available on `env.MyDO`, and is described in a Workers service (`name = "api"`) with the class name `MyDurableObject`.

You must have the `api` Workers service running in as another `wrangler dev` process elsewhere already in order to reference that object.

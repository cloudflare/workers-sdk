---
"wrangler": patch
---

chore: run eslint (with react config) on workers-playground/wrangler

This enables eslint (with our react config) for the workers-playground project. Additionally, this enables the react-jsx condition in relevant tsconfig/eslint config, letting us write jsx without having React in scope.

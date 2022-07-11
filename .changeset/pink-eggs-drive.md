---
"wrangler": patch
---

polish: set `checkjs: false` and `jsx: "react"` in newly created projects

When we create a new project, it's annoying having to set jsx: "react" when that's the overwhelmingly default choice, our compiler is setup to do it automatically, and the tsc error message isn't helpful. So we set `jsx: "react"` in the generated tsconfig.

Setting `checkJs: true` is also annoying because it's _not_ a common choice. So we set `checkJs: false` in the generated tsconfig.

---
"wrangler": patch
---

fix: only log available bindings once in `dev`

Because we were calling `printBindings` during the render phase of `<Dev/>`, we were logging the bindings multiple times (render can be called multiple times, and the interaction of Ink's stdout output intermingled with console is a bit weird). We could have put it into an effect, but I think a better solution here is to simply log it before we even start rendering `<Dev/>` (so we could see the bindings even if Dev fails to load, for example).

This also adds a fix that masks any overriden values so that we don't accidentally log potential secrets into the terminal.

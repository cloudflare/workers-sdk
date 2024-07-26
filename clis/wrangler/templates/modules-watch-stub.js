// `esbuild` doesn't support returning `watch*` options from `onStart()`
// plugin callbacks. Instead, we define an empty virtual module that is
// imported by this injected file. Importing the module registers watchers.
import "wrangler:modules-watch";

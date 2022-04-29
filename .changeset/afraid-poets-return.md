---
"wrangler": patch
---

refactor: use esbuild "file" loaders to add runtime files to the published package

When esbuild builds Wrangler, it creates a new directory "wrangler-dist", which
contains the bundled output, but then any `__dirname` or similar Node.js constant
used in the code, is relative to this output directory.

During testing, Jest does not bundle the code, and so these `__dirname` constants
are now relative to the directory of the original source file.

This is a refactor that ensures consistency in the access of runtime files
between production and test environments, by implementing build/test time transforms.
In esbuild we use a "file" loader that will not inline the content of the imported file
into the bundle, but instead copy the content to the output directory, and then return
the path to this file in the code. We can then use this value to load the content at
runtime.

Similarly, in Jest testing, we have a custom transform that will return the location of the
original file (since there is no real output directory to copy the file to).

The result of this change, is that we can just ensure that the paths in the source code are
relative to the source file and not worry about where the generated code will be output.
Further we are able to remove a bunch of files from the package that we publish to npm.

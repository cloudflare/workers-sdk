# Isomorphic Package Example

This package implements an isomorphic library that generates cryptographically-strong pseudorandom numbers.
What this package does isn't really important here, the key part is the [`package.json`](./package.json)'s `exports` field.
Conditional exports provide a way to load a different file depending on where the module is being imported from.
By default, Wrangler will try to look for a [**`workerd`** key](https://runtime-keys.proposal.wintercg.org/#workerd).
This allows you as a library developer to implement different behaviour for different JavaScript runtimes.

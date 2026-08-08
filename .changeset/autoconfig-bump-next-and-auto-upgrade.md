---
"@cloudflare/autoconfig": minor
"wrangler": minor
---

Bump Next.js minimum versions and provide an automatic upgrade path

`@opennextjs/cloudflare` declares a Next.js peer range of `>=15.5.21 <16 || >=16.2.11`, so projects on earlier 15.x or 16.x releases sit outside the versions the adapter supports.

Autoconfig previously ran `@opennextjs/cloudflare migrate --force-install`. That flag just passes `--force` to the package manager. The peer dependency error becomes a warning buried in the install output, Next.js stays on its unsupported version, and setup finishes with a success message.

Autoconfig now recognises the supported floors and offers to update an unsupported project in place, staying within its existing major version. The update is listed in the setup summary before you confirm, and is applied before any other project changes are made. `--force-install` is no longer passed, so a real dependency conflict is reported rather than forced.

Two cases are not updated automatically and ask you to update Next.js yourself. Next.js 14 now falls outside the adapter's peer range entirely, and Next.js 15.0.x cannot be updated in place because `create-next-app` pinned React to a 19 prerelease before Next.js 15.1, which no supported Next.js version accepts as a peer.

---
"wrangler": patch
---

During the pages validation, show `MAX_ASSET_SIZE` consistently as per docs

During the pages validation, if a file is bigger than `MAX_ASSET_SIZE`
and error is displayed to the user saying that the maximum allowed size
for a file is 26.2 MB, this format is inconsistent with the pages documentation
(https://developers.cloudflare.com/pages/platform/limits/#file-size)
which mentions that the maximum limit is 25 MiB, this inconsistency might lead to
confusion, fix the error message so that it is consistent with the docs

---
"miniflare": patch
---

Name the email files written during local development after the message's id

The `send_email` binding writes the emails it sends to disk so they can be opened during development. Those files were previously named with a random UUID per file, so the text, HTML, and attachment files of a single message had unrelated names and could not be matched up with the message logged in the console or listed in the local explorer.

Each file is now named after the message's id — the same id the local explorer lists the message under — with attachments suffixed by their position in the message (`<id>.txt`, `<id>.html`, `<id>-1.pdf`). The id is derived from a `Message-ID` header, so it is sanitised before use as a filename.

---
"create-cloudflare": patch
---

Add Cloudflare system prompt to newly created projects

AI driven editors like Cursor can use a system prompt to guide the AI in writing code. This function adds a system prompt to the project directory if it doesn't already exist. We use the cursor standard path, other editors expect the user to explicitly specify the path to the system prompt (for now)

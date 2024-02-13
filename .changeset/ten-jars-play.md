---
"create-cloudflare": patch
---

fix: make sure not to wrongly ask users if they want to use typescript

currently if a CLI invoked by C3 asks the user if they want to use
typescript and the user opted out of it, C3 could actually again offer
typescript to the user afterwords, make sure that this does not happen

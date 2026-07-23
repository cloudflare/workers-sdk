---
"wrangler": patch
---

Fix grammar in the container image-too-large error

The error thrown when a container image exceeds the available disk size ended with "Your need more disk for this image." It now reads "You need more disk for this image."

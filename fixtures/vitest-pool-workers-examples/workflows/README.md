# 🔁 workflows

This Worker includes a ModeratorWorkflow that serves as a template for an automated content moderation process.
The testing suite uses workflow mocking to validate the logic of each step.

| Test                                            | Overview                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [integration.test.ts](test/integration.test.ts) | Tests on the Worker's endpoints, ensuring that workflows are created and run correctly.   |
| [unit.test.ts](test/unit.test.ts)               | Tests on the internal logic of each workflow. It uses mocking to test steps in isolation. |

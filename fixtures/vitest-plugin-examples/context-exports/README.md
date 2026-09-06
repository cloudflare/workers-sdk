# Context exports

The Workers here demonstrate how to access and test the `ctx.exports` property.

| Test                                            | Overview                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| [auxiliary.test.ts](test/auxiliary.test.ts)     | Integration test with an auxiliary Worker that accesses its ctx.exports |
| [integration.test.ts](test/integration.test.ts) | Integration test with a Worker that accesses its ctx.exports            |
| [unit.test.ts](test/unit.test.ts)               | Unit tests of ctx.exports, constructed, imported and via a Worker       |

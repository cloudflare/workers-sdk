# Containers (extremely wobbly)

This example shows a very simple integration test and unit test to an application with a Container.

Various caveats:

1. retries are very broken
2. alarms aren't being disposed off properly after tests(`workerd/server/alarm-scheduler.c++:202: warning: exception = workerd/util/sqlite.c++:499: failed: expected _ec == SQLITE_OK [14 == 0]; unable to open database file: SQLITE_CANTOPEN`)
3. occasionally leaves containers behind
4. sometimes just doesn't work if it doesn't feel like it

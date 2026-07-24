---
"wrangler": patch
---

Speed up old debug log cleanup by reading each log file's date from its filename instead of `stat`-ing every file

Wrangler periodically deletes debug log files older than 30 days from its logs directory. Previously it made a filesystem `stat` call for each file to read its modification time; it now derives the age from the timestamp already encoded in the log filename, avoiding that extra work.

#!/usr/bin/env bash
# Restarts a process on receiving SIGUSR1.
# Usage: ./restart.sh <command> <...args>
set -eo pipefail

# Start process and record its PID
"$@" &
PID=$!
echo "[*] Started $PID"

# Trap SIGUSR1 to set $RECEIVED_USR1 to 1, then terminate $PID.
# Setting $RECEIVED_USR1 will cause the process to be restarted.
RECEIVED_USR1=0
trap 'RECEIVED_USR1=1 && kill -TERM $PID' USR1

# Trap SIGINT and SIGTERM to also terminate $PID for cleanup.
# By not setting $RECEIVED_USR1, we ensure this script exits
# when $PID exits.
trap 'kill -TERM $PID' INT TERM

while true
do
  # Wait for the started process to exit
  wait $PID
  EXIT_CODE=$?

  # If the process exited for any reason other than this script
  # receiving SIGUSR1, exit the script with the same exit code.
  if [ $RECEIVED_USR1 -eq 0 ]
  then
    echo "[*] Exited with status $EXIT_CODE"
    exit $EXIT_CODE
  fi

  # Otherwise, if this script received SIGUSR1, reset the flag,
  # restart the process, and record its new PID.
  RECEIVED_USR1=0
  "$@" &
  PID=$!
  echo "[*] Restarted $PID"
done

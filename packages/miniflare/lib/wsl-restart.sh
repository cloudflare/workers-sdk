#!/usr/bin/env bash
# Wraps a process with commands for restarting/stopping.
# We can't use signals here as this script will be started by wsl.exe
# which doesn't pass them through correctly.
# Usage: ./wsl-restart.sh <command> <...args>
set -eo pipefail

# Start process and log its PID
"$@" &
PID=$!
echo "[*] Started $PID"

while read LINE
do
  if [[ $LINE = "restart" ]]; then
    # Kill existing process...
    kill -TERM $PID
    # ...and start a new one
    "$@" &
    PID=$!
    echo "[*] Restarted $PID"
  elif [[ $LINE = "exit" ]]; then
    # Kill existing process
    kill -TERM $PID
    exit 0
  fi
done

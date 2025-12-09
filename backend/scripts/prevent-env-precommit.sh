#!/usr/bin/env bash
# Simple pre-commit hook to prevent staging .env files
if git diff --cached --name-only | grep -E '\.env$' > /dev/null; then
  echo "ERROR: Attempt to commit .env file detected. Please remove it and use environment variables or secret store."
  exit 1
fi
exit 0

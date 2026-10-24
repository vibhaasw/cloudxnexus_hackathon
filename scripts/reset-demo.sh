#!/usr/bin/env sh
# Forwarder to cross-platform Node reset tool
exec node "$(dirname "$0")/reset.mjs" "$@"

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bin=$(mktemp "${TMPDIR:-/tmp}/torabo-pointing-router.XXXXXX")
trap 'rm -f "$bin"' EXIT HUP INT TERM
cc -std=c11 -Wall -Wextra -Werror -I"$root/include" \
  "$root/tests/pointing_router_test.c" "$root/src/pointing_core.c" \
  "$root/src/pointing_gesture.c" -o "$bin"
"$bin"

#!/bin/sh -eux

STD_VERSION="$1"
STD_URL="https://deno.land/std@${STD_VERSION}/encoding"

DEST_PATH="deno_std/${STD_VERSION}"
mkdir -p "${DEST_PATH}"

deno bundle "${STD_URL}/toml.ts" > "${DEST_PATH}/toml.js"
deno bundle "${STD_URL}/yaml.ts" > "${DEST_PATH}/yaml.js"
deno bundle "${STD_URL}/csv.ts" > "${DEST_PATH}/csv.js"

du -h "${DEST_PATH}"/*


{ cat deno_std/versions.txt; echo "${STD_VERSION}"; } \
| uniq > deno_std/new-versions.txt
mv deno_std/new-versions.txt deno_std/versions.txt

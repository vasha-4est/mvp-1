#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required, e.g. https://example.vercel.app"
  exit 1
fi

if [[ -z "${GAS_API_KEY:-}" ]]; then
  echo "GAS_API_KEY is required"
  exit 1
fi

get_batch_list() {
  local query="$1"

  local raw
  raw="$(curl -sS -w $'\n%{http_code}' "${BASE_URL}/api/batch${query}" \
    -H "x-gas-api-key: ${GAS_API_KEY}")"

  HTTP_STATUS="$(echo "${raw}" | tail -n1)"
  HTTP_BODY="$(echo "${raw}" | sed '$d')"
}

echo "[1/4] rejects invalid date format"
get_batch_list '?fromDate=2025/01/01'
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "400" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok // empty')" == "false" ]]

echo "[2/4] rejects invalid calendar date"
get_batch_list '?fromDate=2026-02-30'
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "400" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok // empty')" == "false" ]]

echo "[3/4] accepts strict valid date format"
get_batch_list '?fromDate=2026-02-01'
echo "${HTTP_BODY}" | jq
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok // empty')" == "true" ]]


echo "[4/4] list by today prefix does not leak SHEET_DB mapping errors"
TODAY_YYMMDD="$(date -u +%y%m%d)"
get_batch_list "?prefix=B-${TODAY_YYMMDD}-"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r ' .ok // empty')" == "true" ]]
[[ "${HTTP_BODY}" != *"SHEET_DB mapping missing for: batch_registry"* ]]

echo "All batch_list checks passed."

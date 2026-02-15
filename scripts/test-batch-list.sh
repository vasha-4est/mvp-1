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

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  local raw
  if [[ -n "${body}" ]]; then
    raw="$(curl -sS -w $'\n%{http_code}' -X "${method}" "${url}" -H "Content-Type: application/json" -H "x-gas-api-key: ${GAS_API_KEY}" -d "${body}")"
  else
    raw="$(curl -sS -w $'\n%{http_code}' -X "${method}" "${url}" -H "x-gas-api-key: ${GAS_API_KEY}")"
  fi

  HTTP_STATUS="$(echo "${raw}" | tail -n1)"
  HTTP_BODY="$(echo "${raw}" | sed '$d')"
}

TODAY="$(date -u +%Y-%m-%d)"

echo "[1/5] seed batch for list filters"
REQ_ID="list-test-$(date +%s)-$$"
request POST "${BASE_URL}/api/batch/create" "{\"request_id\":\"${REQ_ID}\",\"note\":\"list-smoke\"}"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "201" || "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
CODE="$(echo "${HTTP_BODY}" | jq -r '.data.code // empty')"
PREFIX="${CODE:0:8}"

echo "[2/5] list without filters"
request GET "${BASE_URL}/api/batch"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.data | type')" == "array" ]]

echo "[3/5] list with status+date+prefix filters"
request GET "${BASE_URL}/api/batch?status=created&fromDate=${TODAY}&toDate=${TODAY}&prefix=${PREFIX}"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
MATCH_COUNT="$(echo "${HTTP_BODY}" | jq --arg code "${CODE}" '[.data[] | select(.code == $code)] | length')"
[[ "${MATCH_COUNT}" -ge 1 ]]

echo "[4/5] list no match returns empty"
request GET "${BASE_URL}/api/batch?status=does-not-exist"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.data | length')" == "0" ]]

echo "[5/5] invalid query format"
request GET "${BASE_URL}/api/batch?fromDate=2025/01/01"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "400" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "false" ]]

echo "All batch list checks passed."

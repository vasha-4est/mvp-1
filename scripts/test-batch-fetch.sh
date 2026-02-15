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

echo "[1/3] seed batch"
REQ_ID="fetch-test-$(date +%s)-$$"
request POST "${BASE_URL}/api/batch/create" "{\"request_id\":\"${REQ_ID}\",\"note\":\"fetch-smoke\"}"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "201" || "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
CODE="$(echo "${HTTP_BODY}" | jq -r '.data.code // empty')"
[[ "${CODE}" =~ ^B-[0-9]{6}-[0-9]{3}$ ]]

echo "[2/3] fetch existing by code"
request GET "${BASE_URL}/api/batch/${CODE}"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "200" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "true" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.data.code // empty')" == "${CODE}" ]]

echo "[3/3] fetch missing code"
request GET "${BASE_URL}/api/batch/B-000000-999"
echo "${HTTP_BODY}" | jq
[[ "${HTTP_STATUS}" == "404" ]]
[[ "$(echo "${HTTP_BODY}" | jq -r '.ok')" == "false" ]]

echo "All batch fetch checks passed."

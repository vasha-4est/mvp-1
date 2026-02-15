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

post_batch() {
  local request_id="$1"
  local extra_json="${2:-}"

  curl -sS -X POST "${BASE_URL}/api/batch/create" \
    -H "Content-Type: application/json" \
    -H "x-gas-api-key: ${GAS_API_KEY}" \
    -d "{
      \"request_id\": \"${request_id}\",
      \"note\": \"smoke\"${extra_json}
    }"
}

assert_ok() {
  local json="$1"
  local ok
  ok="$(echo "${json}" | jq -r '.ok // empty')"
  [[ "${ok}" == "true" ]]
}

get_code() {
  local json="$1"
  echo "${json}" | jq -r '.data.code // empty'
}

get_error() {
  local json="$1"
  echo "${json}" | jq -r '.error // empty'
}

echo "[1/5] create batch"
REQ1="11111111-1111-1111-1111-111111111111"
RES1="$(post_batch "${REQ1}")"
echo "${RES1}" | jq
assert_ok "${RES1}"
CODE1="$(get_code "${RES1}")"
[[ "${CODE1}" =~ ^B-[0-9]{6}-[0-9]{3}$ ]]

echo "[2/5] replay same request_id"
RES2="$(post_batch "${REQ1}")"
echo "${RES2}" | jq
assert_ok "${RES2}"
CODE2="$(get_code "${RES2}")"
[[ "${CODE1}" == "${CODE2}" ]]

echo "[3/5] create second batch"
REQ2="22222222-2222-2222-2222-222222222222"
RES3="$(post_batch "${REQ2}")"
echo "${RES3}" | jq
assert_ok "${RES3}"
CODE3="$(get_code "${RES3}")"
[[ "${CODE3}" =~ ^B-[0-9]{6}-[0-9]{3}$ ]]


echo "[4/5] reject client code"
REQ3="33333333-3333-3333-3333-333333333333"
RES4="$(post_batch "${REQ3}" ', "code":"B-000000-999"')"
echo "${RES4}" | jq
OK4="$(echo "${RES4}" | jq -r '.ok // empty')"
ERR4="$(get_error "${RES4}")"
[[ "${OK4}" == "false" ]]
[[ "${ERR4}" == *"code"* ]]

echo "[5/5] concurrency smoke"
TMP_FILE="$(mktemp)"
for _ in $(seq 1 10); do
  rid="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  post_batch "${rid}" >> "${TMP_FILE}" &
done
wait

jq -r '.data.code // empty' "${TMP_FILE}" | sed '/^$/d' | sort > "${TMP_FILE}.codes"
COUNT_TOTAL="$(wc -l < "${TMP_FILE}.codes" | tr -d ' ')"
COUNT_UNIQ="$(sort -u "${TMP_FILE}.codes" | wc -l | tr -d ' ')"
[[ "${COUNT_TOTAL}" -eq 10 ]]
[[ "${COUNT_UNIQ}" -eq 10 ]]

echo "All PR-11 checks passed."

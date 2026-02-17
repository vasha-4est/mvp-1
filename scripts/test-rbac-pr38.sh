#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required, e.g. https://example.vercel.app"
  exit 1
fi

if [[ -z "${BATCH_CODE:-}" ]]; then
  echo "BATCH_CODE is required, e.g. B-240101-001"
  exit 1
fi

IDEMPOTENCY_KEY="${IDEMPOTENCY_KEY:-pr38-rbac-smoke-$(date +%s)}"

request() {
  local name="$1"
  local method="$2"
  local url="$3"
  local role="${4:-}"
  local body="${5:-}"

  local tmp
  tmp="$(mktemp)"

  local -a args=( -sS -D - -o "$tmp" -X "$method" "$url" -H "Content-Type: application/json" )
  if [[ -n "$role" ]]; then
    args+=( -H "x-user-role: $role" )
  fi
  if [[ -n "$body" ]]; then
    args+=( --data "$body" )
  fi

  local headers
  headers="$(curl "${args[@]}")"
  local status
  status="$(echo "$headers" | awk 'toupper($1) ~ /^HTTP\// { code=$2 } END { print code }')"
  local req_id
  req_id="$(echo "$headers" | awk 'tolower($1)=="x-request-id:" {print $2}' | tr -d '\r' | tail -n1)"

  echo "[$name] status=$status request_id=${req_id:-n/a}"
  jq . "$tmp" >/dev/null 2>&1 && cat "$tmp" | jq . || cat "$tmp"

  rm -f "$tmp"

  STATUS="$status"
}

PATCH_BODY="{\"to_status\":\"production\",\"idempotency_key\":\"$IDEMPOTENCY_KEY\"}"

request "status_no_role" "PATCH" "$BASE_URL/api/batch/$BATCH_CODE/status" "" "$PATCH_BODY"
[[ "$STATUS" == "401" ]]

request "status_coo" "PATCH" "$BASE_URL/api/batch/$BATCH_CODE/status" "COO" "$PATCH_BODY"
if [[ "$STATUS" != "200" && "$STATUS" != "502" && "$STATUS" != "409" && "$STATUS" != "404" ]]; then
  echo "Expected COO request to pass RBAC guard (non-401/403), got $STATUS"
  exit 1
fi

request "owner_dashboard_coo" "GET" "$BASE_URL/api/owner/dashboard" "COO"
[[ "$STATUS" == "403" ]]

request "owner_dashboard_owner" "GET" "$BASE_URL/api/owner/dashboard" "OWNER"
if [[ "$STATUS" != "200" && "$STATUS" != "502" ]]; then
  echo "Expected OWNER dashboard to pass RBAC guard (200/502), got $STATUS"
  exit 1
fi

echo "PR-38 RBAC smoke checks passed."

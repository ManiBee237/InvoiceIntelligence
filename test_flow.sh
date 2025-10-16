#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-"http://127.0.0.1:4000"}
TENANT=${TENANT:-"mani"}

# Colors
ok() { printf "\033[32m✓ %s\033[0m\n" "$*"; }
info() { printf "\033[36m→ %s\033[0m\n" "$*"; }
fail() { printf "\033[31m✗ %s\033[0m\n" "$*"; }

# Dependencies check
command -v curl >/dev/null || { fail "Need curl"; exit 1; }
command -v jq >/dev/null || { fail "Need jq (brew install jq)"; exit 1; }

info "Tenant: $TENANT"
info "Base URL: $BASE"

# 1) HEALTH: simple 'whoami' (optional if you added the route)
if curl -fsS "$BASE/api/_whoami" -H "x-tenant-id: $TENANT" >/dev/null 2>&1; then
  ok "_whoami reachable"
else
  info "_whoami not present (that's ok)"
fi

# 2) AUTH: register or login
EMAIL="qa+$RANDOM@example.com"
PASS="pass1234"
NAME="QA Tester"

info "Registering: $EMAIL"
REGISTER=$(
  curl -fsS "$BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT" \
    -d "$(jq -nc --arg n "$NAME" --arg e "$EMAIL" --arg p "$PASS" --arg t "$TENANT" \
      '{name:$n,email:$e,password:$p,tenantSlug:$t}')"
) || true

TOKEN=$(echo "${REGISTER:-null}" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  info "User may already exist; trying login…"
  LOGIN=$(
    curl -fsS "$BASE/api/auth/login" \
      -H "Content-Type: application/json" \
      -H "x-tenant-id: $TENANT" \
      -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASS" --arg t "$TENANT" \
        '{email:$e,password:$p,tenantSlug:$t}')"
  ) || { fail "Login failed"; exit 1; }
  TOKEN=$(echo "$LOGIN" | jq -r '.token')
fi
[ -n "$TOKEN" ] || { fail "No token"; exit 1; }
ok "Auth OK -> token acquired"

AUTH_H="Authorization: Bearer $TOKEN"
TENANT_H="x-tenant-id: $TENANT"
CT_H="Content-Type: application/json"

# 3) CUSTOMERS: create one
CUST_NAME="Acme QA $(date +%H%M%S)"
CUST=$(
  curl -fsS "$BASE/api/customers" -H "$TENANT_H" -H "$AUTH_H" -H "$CT_H" \
    -d "$(jq -nc --arg name "$CUST_NAME" '{name:$name,email:"acct@acme.test",phone:"0001112222"}')"
)
CUST_ID=$(echo "$CUST" | jq -r '._id // .id')
ok "Customer created: $CUST_NAME ($CUST_ID)"

# 4) PRODUCTS: create one
PROD=$(
  curl -fsS "$BASE/api/products" -H "$TENANT_H" -H "$AUTH_H" -H "$CT_H" \
    -d '{"name":"QA Widget","price":1999,"sku":"QA-001","hsn":"9987"}'
)
PROD_ID=$(echo "$PROD" | jq -r '._id // .id')
ok "Product created: QA Widget ($PROD_ID)"

# 5) INVOICES: create an invoice for the customer
TODAY=$(date +%F)
DUE=$(date -v+14d +%F 2>/dev/null || date -d "+14 days" +%F)
INV=$(
  curl -fsS "$BASE/api/invoices" -H "$TENANT_H" -H "$AUTH_H" -H "$CT_H" \
    -d "$(jq -nc --arg cid "$CUST_ID" --arg d "$TODAY" --arg due "$DUE" \
      '{customerId:$cid, invoiceNo:"INV-QA-'$(date +%s)':'$RANDOM'", invoiceDate:$d, dueDate:$due,
        lines:[{description:"QA Widget", qty:2, rate:1999, gstPct:18}], tax: (2*1999*0.18|round), status:"open"}')"
)
INV_ID=$(echo "$INV" | jq -r '.id // ._id')
INV_NO=$(echo "$INV" | jq -r '.number // .invoiceNo')
ok "Invoice created: $INV_NO ($INV_ID)"

# 6) LIST invoices and confirm our record is present
LIST=$(curl -fsS "$BASE/api/invoices?limit=50" -H "$TENANT_H" -H "$AUTH_H")
COUNT=$(echo "$LIST" | jq -r --arg inv "$INV_NO" '[.[] | select((.number // .invoiceNo) == $inv)] | length')
[ "$COUNT" -ge 1 ] || { fail "Invoice not found in list"; exit 1; }
ok "Invoice appears in list"

# 7) REPORTS: range covering today
FROM=$(date -v-15d +%F 2>/dev/null || date -d "-15 days" +%F)
TO=$TODAY
REP=$(curl -fsS "$BASE/api/reports?from=$FROM&to=$TO" -H "$TENANT_H" -H "$AUTH_H")
INV_SUM=$(echo "$REP" | jq -r '.summary.invoices.totalAmt // 0')
ok "Reports reachable (invoices totalAmt=$INV_SUM)"

# 8) ML: late payment risk
ML=$(curl -fsS "$BASE/api/ml/latepay?limit=10" -H "$TENANT_H" -H "$AUTH_H")
ML_LEN=$(echo "$ML" | jq 'length')
ok "ML latepay reachable (rows=$ML_LEN)"

# 9) VENDORS: list and create/edit/delete (quick)
VLIST=$(curl -fsS "$BASE/api/vendors" -H "$TENANT_H" -H "$AUTH_H")
ok "Vendors list OK ($(echo "$VLIST" | jq 'length') vendors)"

VNEW=$(curl -fsS "$BASE/api/vendors" -H "$TENANT_H" -H "$AUTH_H" -H "$CT_H" \
        -d '{"name":"QA Supplies","address":"Chennai","email":"qa@sup.test"}')
VID=$(echo "$VNEW" | jq -r '.id // ._id')
ok "Vendor created ($VID)"

VUPD=$(curl -fsS -X PATCH "$BASE/api/vendors/$VID" -H "$TENANT_H" -H "$AUTH_H" -H "$CT_H" \
        -d '{"phone":"9998887776"}')
ok "Vendor updated (phone set)"

curl -fsS -X DELETE "$BASE/api/vendors/$VID" -H "$TENANT_H" -H "$AUTH_H" >/dev/null
ok "Vendor deleted"

ok "ALL CHECKS PASSED ✅"

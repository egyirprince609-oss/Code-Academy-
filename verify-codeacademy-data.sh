#!/data/data/com.termux/files/usr/bin/bash

# ==========================================================
# CODE ACADEMY
# COMPLETE DATA API VERIFICATION
# ==========================================================

set +e

PROJECT_DIR="/storage/emulated/0/TebEdit/CodeAcademy"

SERVER_FILE="$PROJECT_DIR/server.js"
ROUTES_FILE="$PROJECT_DIR/data/data.routes.js"
SERVICE_FILE="$PROJECT_DIR/data/getdatagh.service.js"
ENV_FILE="$PROJECT_DIR/.env"

VERIFY_DIR="$PROJECT_DIR/.codeacademy-verification"
SERVER_LOG="$VERIFY_DIR/server.log"

DEFAULT_PORT="${PORT:-3000}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

SERVER_STARTED_BY_SCRIPT=0
SERVER_PID=""

# ==========================================================
# FUNCTIONS
# ==========================================================

pass() {
    echo "  [PASS] $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo "  [FAIL] $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

warn() {
    echo "  [WARN] $1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

section() {
    echo ""
    echo "----------------------------------------------------------"
    echo "$1"
    echo "----------------------------------------------------------"
}

cleanup() {

    if [ -n "$SERVER_PID" ] && [ "$SERVER_STARTED_BY_SCRIPT" -eq 1 ]; then

        kill "$SERVER_PID" 2>/dev/null
        sleep 1

        kill -9 "$SERVER_PID" 2>/dev/null

    fi

    rm -rf "$VERIFY_DIR" 2>/dev/null
}

trap cleanup EXIT

# ==========================================================
# START
# ==========================================================

echo ""
echo "=========================================================="
echo "        CODE ACADEMY DATA SYSTEM VERIFICATION"
echo "=========================================================="
echo ""
echo "Project:"
echo "$PROJECT_DIR"
echo ""
echo "This test will NOT display your GDGH API key."
echo "This test will NOT modify your application files."
echo ""

# ==========================================================
# 1. PROJECT DIRECTORY
# ==========================================================

section "1. PROJECT DIRECTORY"

if [ -d "$PROJECT_DIR" ]; then
    pass "Code Academy project directory exists."
else
    fail "Code Academy project directory does not exist."
    exit 1
fi

cd "$PROJECT_DIR"

# Create our OWN temporary verification directory.
mkdir -p "$VERIFY_DIR"

if [ -d "$VERIFY_DIR" ]; then
    pass "Verification workspace created."
else
    fail "Could not create verification workspace."
fi

# ==========================================================
# 2. IMPORTANT FILES
# ==========================================================

section "2. IMPORTANT BACKEND FILES"

if [ -f "$SERVER_FILE" ]; then
    pass "Found server.js"
else
    fail "server.js is missing."
fi

if [ -f "$ROUTES_FILE" ]; then
    pass "Found data/data.routes.js"
else
    fail "data/data.routes.js is missing."
fi

if [ -f "$SERVICE_FILE" ]; then
    pass "Found data/getdatagh.service.js"
else
    fail "data/getdatagh.service.js is missing."
fi

# ==========================================================
# 3. ENVIRONMENT
# ==========================================================

section "3. ENVIRONMENT CONFIGURATION"

if [ -f "$ENV_FILE" ]; then
    pass ".env file exists."
else
    fail ".env file is missing."
fi

# Load .env silently.
if [ -f "$ENV_FILE" ]; then

    set -a
    . "$ENV_FILE" >/dev/null 2>&1
    ENV_STATUS=$?
    set +a

    if [ "$ENV_STATUS" -eq 0 ]; then
        pass ".env file loaded successfully."
    else
        fail ".env file could not be loaded."
    fi

fi

if [ -n "${GDGH_API_KEY:-}" ]; then
    pass "GDGH_API_KEY is loaded."
else
    fail "GDGH_API_KEY is NOT loaded."
fi

# ==========================================================
# 4. NODE AND NPM
# ==========================================================

section "4. NODE.JS AND NPM"

if command -v node >/dev/null 2>&1; then

    NODE_PATH="$(command -v node)"
    NODE_VERSION="$(node --version 2>/dev/null)"

    pass "Node.js found."
    echo "        Path: $NODE_PATH"
    echo "        Version: $NODE_VERSION"

else

    fail "Node.js was not found."

fi

if command -v npm >/dev/null 2>&1; then

    NPM_PATH="$(command -v npm)"
    NPM_VERSION="$(npm --version 2>/dev/null)"

    pass "npm found."
    echo "        Path: $NPM_PATH"
    echo "        Version: $NPM_VERSION"

else

    fail "npm was not found."

fi

# ==========================================================
# 5. NODE MODULES
# ==========================================================

section "5. NODE MODULES"

if [ -d "$PROJECT_DIR/node_modules" ]; then
    pass "node_modules directory exists."
else
    warn "node_modules directory is missing."
fi

if [ -f "$PROJECT_DIR/package.json" ]; then
    pass "package.json exists."
else
    warn "package.json is missing."
fi

# ==========================================================
# 6. JAVASCRIPT SYNTAX
# ==========================================================

section "6. JAVASCRIPT SYNTAX CHECK"

if command -v node >/dev/null 2>&1; then

    if [ -f "$SERVER_FILE" ]; then

        node --check "$SERVER_FILE" \
            >"$VERIFY_DIR/server-check.txt" 2>&1

        if [ "$?" -eq 0 ]; then
            pass "server.js syntax is valid."
        else
            fail "server.js contains a syntax error."
            cat "$VERIFY_DIR/server-check.txt"
        fi

    fi

    if [ -f "$ROUTES_FILE" ]; then

        node --check "$ROUTES_FILE" \
            >"$VERIFY_DIR/routes-check.txt" 2>&1

        if [ "$?" -eq 0 ]; then
            pass "data/data.routes.js syntax is valid."
        else
            fail "data/data.routes.js contains a syntax error."
            cat "$VERIFY_DIR/routes-check.txt"
        fi

    fi

    if [ -f "$SERVICE_FILE" ]; then

        node --check "$SERVICE_FILE" \
            >"$VERIFY_DIR/service-check.txt" 2>&1

        if [ "$?" -eq 0 ]; then
            pass "data/getdatagh.service.js syntax is valid."
        else
            fail "data/getdatagh.service.js contains a syntax error."
            cat "$VERIFY_DIR/service-check.txt"
        fi

    fi

fi

# ==========================================================
# 7. ROUTE CHECK
# ==========================================================

section "7. BACKEND ROUTE CHECK"

if [ -f "$ROUTES_FILE" ]; then

    if grep -q '"/packages"' "$ROUTES_FILE"; then
        pass "Found /packages route."
    else
        warn "Could not automatically detect /packages route."
    fi

    if grep -q '"/purchase"' "$ROUTES_FILE"; then
        pass "Found /purchase route."
    else
        warn "Could not automatically detect /purchase route."
    fi

    if grep -q '"/transaction/:reference"' "$ROUTES_FILE"; then
        pass "Found /transaction/:reference route."
    else
        warn "Could not automatically detect transaction route."
    fi

    if grep -q '"/balance"' "$ROUTES_FILE"; then
        pass "Found /balance route."
    else
        warn "Could not automatically detect /balance route."
    fi

fi

# ==========================================================
# 8. DETECT SERVER PORT
# ==========================================================

section "8. SERVER PORT DETECTION"

SERVER_PORT=""

if [ -n "${PORT:-}" ]; then
    SERVER_PORT="$PORT"
fi

if [ -z "$SERVER_PORT" ] && [ -f "$SERVER_FILE" ]; then

    SERVER_PORT="$(
        grep -Eo \
        'listen[[:space:]]*\([[:space:]]*[0-9]+' \
        "$SERVER_FILE" 2>/dev/null |
        grep -Eo '[0-9]+' |
        head -n 1
    )"

fi

if [ -z "$SERVER_PORT" ]; then
    SERVER_PORT="$DEFAULT_PORT"
fi

echo "        Port selected: $SERVER_PORT"

LOCAL_ROOT="http://127.0.0.1:$SERVER_PORT"

# ==========================================================
# 9. CHECK WHETHER SERVER IS ALREADY RUNNING
# ==========================================================

section "9. CODE ACADEMY SERVER"

SERVER_ALREADY_RUNNING=0

SERVER_TEST_CODE="$(
    curl -sS \
        --connect-timeout 2 \
        --max-time 4 \
        -o "$VERIFY_DIR/existing-server.txt" \
        -w "%{http_code}" \
        "$LOCAL_ROOT/" \
        2>/dev/null
)"

if [ "$SERVER_TEST_CODE" != "000" ] && [ -n "$SERVER_TEST_CODE" ]; then

    SERVER_ALREADY_RUNNING=1

    pass "Code Academy server is already running."
    echo "        HTTP status: $SERVER_TEST_CODE"

else

    echo "Server is not currently running."
    echo "Starting a temporary verification server..."

    if [ -f "$SERVER_FILE" ]; then

        (
            cd "$PROJECT_DIR"
            node server.js
        ) >"$SERVER_LOG" 2>&1 &

        SERVER_PID=$!
        SERVER_STARTED_BY_SCRIPT=1

        echo "        Temporary server PID: $SERVER_PID"

        SERVER_READY=0

        for i in 1 2 3 4 5 6 7 8 9 10; do

            sleep 1

            CHECK_CODE="$(
                curl -sS \
                    --connect-timeout 2 \
                    --max-time 3 \
                    -o "$VERIFY_DIR/server-ready.txt" \
                    -w "%{http_code}" \
                    "$LOCAL_ROOT/" \
                    2>/dev/null
            )"

            if [ "$CHECK_CODE" != "000" ] && [ -n "$CHECK_CODE" ]; then
                SERVER_READY=1
                SERVER_TEST_CODE="$CHECK_CODE"
                break
            fi

        done

        if [ "$SERVER_READY" -eq 1 ]; then

            pass "Temporary Code Academy server started successfully."
            echo "        HTTP status: $SERVER_TEST_CODE"

        else

            fail "Temporary Code Academy server could not be started."

            echo ""
            echo "Server log:"
            echo "----------------------------------------------------------"

            if [ -f "$SERVER_LOG" ]; then
                cat "$SERVER_LOG"
            fi

            echo "----------------------------------------------------------"

        fi

    else

        fail "Cannot start server because server.js is missing."

    fi

fi

# ==========================================================
# 10. DIRECT GETDATAGH API
# ==========================================================

section "10. DIRECT GETDATAGH API CHECK"

DIRECT_TOTAL=0

if [ -n "${GDGH_API_KEY:-}" ]; then

    GDGH_URL="https://www.getdatagh.com/api/v1/packages"

    echo "Testing GetDataGH:"
    echo "$GDGH_URL"
    echo ""

    GDGH_HTTP_CODE="$(
        curl -sS \
            --connect-timeout 10 \
            --max-time 20 \
            -H "Authorization: Bearer ${GDGH_API_KEY}" \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -o "$VERIFY_DIR/getdatagh-all.json" \
            -w "%{http_code}" \
            "$GDGH_URL" \
            2>"$VERIFY_DIR/getdatagh-error.txt"
    )"

    GDGH_CURL_STATUS=$?

    echo "HTTP status: $GDGH_HTTP_CODE"
    echo ""

    if [ "$GDGH_CURL_STATUS" -eq 0 ]; then

        if [ "$GDGH_HTTP_CODE" = "200" ]; then
            pass "GetDataGH API is reachable."
        else
            fail "GetDataGH returned HTTP $GDGH_HTTP_CODE."
        fi

    else

        fail "Could not connect to GetDataGH."

        if [ -f "$VERIFY_DIR/getdatagh-error.txt" ]; then
            cat "$VERIFY_DIR/getdatagh-error.txt"
        fi

    fi

    echo ""
    echo "GetDataGH response:"
    cat "$VERIFY_DIR/getdatagh-all.json" 2>/dev/null
    echo ""

else

    fail "GDGH_API_KEY is unavailable."

fi

# ==========================================================
# 11. DIRECT NETWORK CHECK
# ==========================================================

section "11. GETDATAGH NETWORK PACKAGE CHECK"

MTN_COUNT=0
TELECEL_COUNT=0
AIRTELTIGO_COUNT=0

if [ -n "${GDGH_API_KEY:-}" ]; then

    for NETWORK in MTN TELECEL AIRTELTIGO; do

        echo ""
        echo "================ $NETWORK ================"

        RESPONSE_FILE="$VERIFY_DIR/getdatagh-${NETWORK}.json"
        ERROR_FILE="$VERIFY_DIR/getdatagh-${NETWORK}-error.txt"

        NETWORK_HTTP_CODE="$(
            curl -sS \
                --connect-timeout 10 \
                --max-time 20 \
                -H "Authorization: Bearer ${GDGH_API_KEY}" \
                -H "Accept: application/json" \
                -H "Content-Type: application/json" \
                -o "$RESPONSE_FILE" \
                -w "%{http_code}" \
                "https://www.getdatagh.com/api/v1/packages?network=${NETWORK}" \
                2>"$ERROR_FILE"
        )"

        NETWORK_STATUS=$?

        echo "HTTP status: $NETWORK_HTTP_CODE"
        echo "Response:"

        cat "$RESPONSE_FILE" 2>/dev/null

        echo ""
        echo ""

        if [ "$NETWORK_STATUS" -ne 0 ]; then

            fail "$NETWORK request could not connect."

            cat "$ERROR_FILE" 2>/dev/null

        elif [ "$NETWORK_HTTP_CODE" = "200" ]; then

            PACKAGE_COUNT="$(
                grep -o '"package_code"' "$RESPONSE_FILE" 2>/dev/null |
                wc -l |
                tr -d ' '
            )"

            case "$NETWORK" in

                MTN)
                    MTN_COUNT="$PACKAGE_COUNT"
                    ;;

                TELECEL)
                    TELECEL_COUNT="$PACKAGE_COUNT"
                    ;;

                AIRTELTIGO)
                    AIRTELTIGO_COUNT="$PACKAGE_COUNT"
                    ;;

            esac

            if [ "$PACKAGE_COUNT" -gt 0 ]; then

                pass "$NETWORK returned $PACKAGE_COUNT package(s)."

            else

                warn "$NETWORK is reachable, but returned ZERO packages."

            fi

        else

            fail "$NETWORK returned HTTP $NETWORK_HTTP_CODE."

        fi

    done

fi

# ==========================================================
# 12. LOCAL CODE ACADEMY PACKAGE ENDPOINT
# ==========================================================

section "12. CODE ACADEMY PACKAGE ENDPOINT"

LOCAL_MTN_COUNT=0
LOCAL_TELECEL_COUNT=0
LOCAL_AIRTELTIGO_COUNT=0

if [ "$SERVER_TEST_CODE" != "000" ] && [ -n "$SERVER_TEST_CODE" ]; then

    for NETWORK in MTN TELECEL AIRTELTIGO; do

        echo ""
        echo "================ LOCAL $NETWORK ================"

        LOCAL_FILE="$VERIFY_DIR/local-${NETWORK}.json"
        LOCAL_ERROR="$VERIFY_DIR/local-${NETWORK}-error.txt"

        LOCAL_HTTP_CODE="$(
            curl -sS \
                --connect-timeout 5 \
                --max-time 10 \
                -o "$LOCAL_FILE" \
                -w "%{http_code}" \
                "${LOCAL_ROOT}/api/data/packages?network=${NETWORK}" \
                2>"$LOCAL_ERROR"
        )"

        LOCAL_STATUS=$?

        echo "HTTP status: $LOCAL_HTTP_CODE"
        echo "Response:"

        cat "$LOCAL_FILE" 2>/dev/null

        echo ""
        echo ""

        if [ "$LOCAL_STATUS" -ne 0 ]; then

            fail "Local $NETWORK endpoint could not be reached."
            cat "$LOCAL_ERROR" 2>/dev/null

        elif [ "$LOCAL_HTTP_CODE" = "200" ]; then

            if grep -q '"success":true' "$LOCAL_FILE" 2>/dev/null; then
                pass "Code Academy $NETWORK route returned success:true."
            else
                warn "Code Academy $NETWORK route did not return success:true."
            fi

            PACKAGE_COUNT="$(
                grep -o '"package_code"' "$LOCAL_FILE" 2>/dev/null |
                wc -l |
                tr -d ' '
            )"

            case "$NETWORK" in

                MTN)
                    LOCAL_MTN_COUNT="$PACKAGE_COUNT"
                    ;;

                TELECEL)
                    LOCAL_TELECEL_COUNT="$PACKAGE_COUNT"
                    ;;

                AIRTELTIGO)
                    LOCAL_AIRTELTIGO_COUNT="$PACKAGE_COUNT"
                    ;;

            esac

            if [ "$PACKAGE_COUNT" -gt 0 ]; then

                pass "Code Academy returned $PACKAGE_COUNT $NETWORK package(s)."

            else

                warn "Code Academy returned ZERO $NETWORK packages."

            fi

        else

            fail "Code Academy $NETWORK endpoint returned HTTP $LOCAL_HTTP_CODE."

        fi

    done

else

    warn "Local package tests skipped because server is unavailable."

fi

# ==========================================================
# 13. SUMMARY
# ==========================================================

section "13. PACKAGE COUNT SUMMARY"

echo ""
echo "DIRECT GETDATAGH"
echo "  MTN:        $MTN_COUNT"
echo "  TELECEL:    $TELECEL_COUNT"
echo "  AIRTELTIGO: $AIRTELTIGO_COUNT"

echo ""
echo "CODE ACADEMY BACKEND"
echo "  MTN:        $LOCAL_MTN_COUNT"
echo "  TELECEL:    $LOCAL_TELECEL_COUNT"
echo "  AIRTELTIGO: $LOCAL_AIRTELTIGO_COUNT"

DIRECT_TOTAL=$((MTN_COUNT + TELECEL_COUNT + AIRTELTIGO_COUNT))
LOCAL_TOTAL=$((LOCAL_MTN_COUNT + LOCAL_TELECEL_COUNT + LOCAL_AIRTELTIGO_COUNT))

echo ""
echo "Total direct GetDataGH packages: $DIRECT_TOTAL"
echo "Total local Code Academy packages: $LOCAL_TOTAL"

# ==========================================================
# 14. FINAL DIAGNOSIS
# ==========================================================

section "14. FINAL DIAGNOSIS"

echo ""

if [ "$DIRECT_TOTAL" -gt 0 ]; then

    echo "  RESULT: GETDATAGH HAS PACKAGE DATA."
    echo ""

    if [ "$LOCAL_TOTAL" -gt 0 ]; then

        echo "  RESULT: CODE ACADEMY IS RECEIVING PACKAGE DATA."
        echo ""
        echo "  The backend is ready for the frontend package interface."

    else

        echo "  RESULT: GETDATAGH HAS PACKAGES, BUT CODE ACADEMY"
        echo "          IS NOT RETURNING THEM."
        echo ""
        echo "  The backend needs further inspection."

    fi

else

    echo "  RESULT: GETDATAGH RETURNED ZERO PACKAGES."
    echo ""
    echo "  This is NOT evidence that your JavaScript is broken."
    echo ""
    echo "  The upstream GetDataGH account/API is reachable,"
    echo "  but its package endpoint currently contains no"
    echo "  detectable package inventory for this vendor."
    echo ""
    echo "  We should NOT invent package data in Code Academy."
    echo ""
    echo "  The next step is to configure/activate the packages"
    echo "  on the GetDataGH vendor side."

fi

# ==========================================================
# 15. IMPORTANT NVM NOTICE
# ==========================================================

section "15. TERMUX NODE NOTICE"

echo ""
echo "Your working Node installation is:"
echo "  /data/data/com.termux/files/usr/bin/node"
echo ""

if command -v node >/dev/null 2>&1; then

    CURRENT_NODE="$(command -v node)"

    if [ "$CURRENT_NODE" = "/data/data/com.termux/files/usr/bin/node" ]; then

        echo "  [OK] Termux-native Node.js is being used."

    else

        echo "  [NOTICE] Another Node installation is being used:"
        echo "          $CURRENT_NODE"

    fi

fi

echo ""
echo "The old NVM warning at Termux startup is separate from"
echo "the GetDataGH package problem."

# ==========================================================
# 16. OVERALL RESULT
# ==========================================================

section "16. OVERALL VERIFICATION RESULT"

echo ""
echo "PASS: $PASS_COUNT"
echo "WARN: $WARN_COUNT"
echo "FAIL: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then

    echo "=========================================================="
    echo "        VERIFICATION COMPLETED SUCCESSFULLY"
    echo "=========================================================="

else

    echo "=========================================================="
    echo "       VERIFICATION COMPLETED WITH ISSUES"
    echo "=========================================================="

fi

echo ""
echo "IMPORTANT:"
echo "Your GDGH_API_KEY was never printed."
echo ""
echo "Send the COMPLETE output above to ChatGPT."
echo "Do NOT paste the output back into Termux."
echo ""


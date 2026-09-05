#!/data/data/com.termux/files/usr/bin/bash

set +e

PROJECT="/storage/emulated/0/TebEdit/CodeAcademy"

echo ""
echo "=========================================================="
echo "       CODE ACADEMY - NODE.JS FULL REPAIR"
echo "=========================================================="
echo ""

cd "$PROJECT" || {
    echo "ERROR: Cannot enter Code Academy project."
    exit 1
}

echo "[1/12] Project location"
echo "$PROJECT"
echo ""

echo "[2/12] Saving project package information"

if [ -f package.json ]; then
    cp package.json package.json.backup-before-node-repair
    echo "✓ package.json backup created."
else
    echo "⚠ package.json not found."
fi

if [ -f package-lock.json ]; then
    cp package-lock.json package-lock.json.backup-before-node-repair
    echo "✓ package-lock.json backup created."
fi

echo ""
echo "[3/12] Checking current Node"

echo "Node command:"
command -v node 2>/dev/null

echo "Node version:"
node --version 2>&1

echo ""
echo "[4/12] Leaving broken NVM Node"

export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
    nvm deactivate >/dev/null 2>&1
    echo "✓ NVM deactivated for this shell."
else
    echo "NVM script not found. Continuing."
fi

unset NVM_BIN
unset NVM_INC

echo ""
echo "[5/12] Restoring normal Termux PREFIX"

export PREFIX="/data/data/com.termux/files/usr"

echo "PREFIX=$PREFIX"
echo ""

echo "[6/12] Installing Termux-native Node.js"

echo "Updating Termux package information..."
pkg update -y

echo ""
echo "Installing Node.js..."
pkg install nodejs -y

echo ""
echo "[7/12] Refreshing command paths"

hash -r

export PATH="/data/data/com.termux/files/usr/bin:$PATH"

echo ""
echo "Node path:"
command -v node 2>&1

echo ""
echo "npm path:"
command -v npm 2>&1

echo ""
echo "[8/12] Verifying Node.js"

NODE_VERSION="$(node --version 2>&1)"

echo "Node version:"
echo "$NODE_VERSION"

if [[ "$NODE_VERSION" == v* ]]; then
    echo "✓ Node.js is working."
else
    echo "✗ Node.js is still not working."
fi

echo ""
echo "npm version:"
npm --version 2>&1

echo ""
echo "[9/12] Checking JavaScript syntax"

if [ -f server.js ]; then

    echo ""
    echo "Checking server.js..."

    node --check server.js 2>&1

    if [ $? -eq 0 ]; then
        echo "✓ server.js syntax is valid."
    else
        echo "✗ server.js has a JavaScript syntax problem."
    fi

else
    echo "✗ server.js not found."
fi

if [ -f data/getdatagh.service.js ]; then

    echo ""
    echo "Checking data/getdatagh.service.js..."

    node --check data/getdatagh.service.js 2>&1

    if [ $? -eq 0 ]; then
        echo "✓ data/getdatagh.service.js syntax is valid."
    else
        echo "✗ data/getdatagh.service.js has a JavaScript syntax problem."
    fi

else
    echo "⚠ data/getdatagh.service.js not found."
fi

echo ""
echo "[10/12] Inspecting server.js API configuration"

if [ -f server.js ]; then

    echo ""
    echo "Relevant server.js lines:"
    echo "----------------------------------------------------------"

    grep -n -E \
    'require.*data|import.*data|dataRoutes|app\.use|api/data|express' \
    server.js 2>/dev/null

    echo "----------------------------------------------------------"

fi

echo ""
echo "[11/12] Inspecting data directory"

if [ -d data ]; then

    echo "Files inside data/:"
    echo "----------------------------------------------------------"

    find data -maxdepth 2 -type f -print 2>/dev/null

    echo "----------------------------------------------------------"

    echo ""
    echo "Searching for package routes:"
    echo "----------------------------------------------------------"

    grep -Rni -E \
    'packages|router\.get|router\.post|exports|module\.exports' \
    data \
    --include="*.js" \
    2>/dev/null

    echo "----------------------------------------------------------"

else

    echo "✗ data directory not found."

fi

echo ""
echo "[12/12] Checking port 3000"

echo ""
echo "Current response from:"
echo "http://127.0.0.1:3000/api/data/packages"
echo "----------------------------------------------------------"

curl -i --max-time 5 \
"http://127.0.0.1:3000/api/data/packages" \
2>&1

echo "----------------------------------------------------------"

echo ""
echo "=========================================================="
echo "                    REPAIR FINISHED"
echo "=========================================================="
echo ""

echo "FINAL NODE INFORMATION"
echo "----------------------------------------------------------"

echo "Node:"
command -v node 2>&1
node --version 2>&1

echo ""
echo "npm:"
command -v npm 2>&1
npm --version 2>&1

echo ""
echo "PREFIX:"
echo "${PREFIX:-<empty>}"

echo ""
echo "Project:"
pwd

echo ""
echo "=========================================================="
echo " IMPORTANT"
echo "=========================================================="
echo ""
echo "Your Code Academy source files were NOT automatically"
echo "rewritten by this repair."
echo ""
echo "The old NVM Node installation was NOT used anymore."
echo "Termux-native Node.js was installed instead."
echo ""
echo "If /api/data/packages still returns 404, the next"
echo "problem is inside the data router, and the inspection"
echo "above will show us its exact route definitions."
echo ""
echo "=========================================================="

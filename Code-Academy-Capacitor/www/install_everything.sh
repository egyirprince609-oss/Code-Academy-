#!/data/data/com.termux/files/usr/bin/bash

echo "====================================="
echo " Updating Termux"
echo "====================================="
pkg update -y
pkg upgrade -y

echo "====================================="
echo " Installing Core Packages"
echo "====================================="
pkg install -y \
nodejs \
git \
python \
php \
clang \
make \
cmake \
openssl \
curl \
wget \
zip \
unzip \
tar \
nano \
vim \
sqlite \
tsu

echo "====================================="
echo " Updating npm"
echo "====================================="
npm install -g npm@latest

echo "====================================="
echo " Installing Package Managers"
echo "====================================="
npm install -g \
yarn \
pnpm

echo "====================================="
echo " Installing TypeScript Tools"
echo "====================================="
npm install -g \
typescript \
ts-node

echo "====================================="
echo " Installing Development Utilities"
echo "====================================="
npm install -g \
nodemon \
eslint \
prettier \
serve \
http-server

echo "====================================="
echo " Installing Bundlers"
echo "====================================="
npm install -g \
vite \
webpack \
webpack-cli \
parcel

echo "====================================="
echo " Installing React Ecosystem"
echo "====================================="
npm install -g \
create-react-app

echo "====================================="
echo " Installing Next.js"
echo "====================================="
npm install -g \
create-next-app

echo "====================================="
echo " Installing Vue Ecosystem"
echo "====================================="
npm install -g \
@vue/cli

echo "====================================="
echo " Installing Angular"
echo "====================================="
npm install -g \
@angular/cli

echo "====================================="
echo " Installing Svelte"
echo "====================================="
npm install -g \
create-svelte

echo "====================================="
echo " Installing Backend Tools"
echo "====================================="
npm install -g \
express-generator \
fastify-cli \
nest

echo "====================================="
echo " Installing Database Tools"
echo "====================================="
npm install -g \
prisma

echo "====================================="
echo " Installing Firebase"
echo "====================================="
npm install -g \
firebase-tools

echo "====================================="
echo " Installing Deployment Tools"
echo "====================================="
npm install -g \
vercel \
netlify-cli

echo "====================================="
echo " Installing React Native Tools"
echo "====================================="
npm install -g \
expo-cli \
react-native-cli

echo "====================================="
echo " Installing AI / LLM Libraries"
echo "====================================="
npm install -g \
openai

echo "====================================="
echo " Installing Common Global Libraries"
echo "====================================="
npm install -g \
axios \
dotenv \
cors \
bcrypt \
jsonwebtoken \
socket.io \
mongoose

echo "====================================="
echo " Python Support"
echo "====================================="
pip install --upgrade pip

echo "====================================="
echo " Finished Successfully"
echo "====================================="
node -v
npm -v
python --version
php -v
git --version

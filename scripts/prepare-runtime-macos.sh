#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'This runtime build requires an Apple silicon Mac.' >&2
  exit 1
fi

# The upstream b10025 binary requires macOS 26. Build verified source for 13.
cache="$PWD/src-tauri/target/runtime-cache/macos-arm64"
archive="$cache/llama-b10025-source.tar.gz"
mkdir -p "$cache" src-tauri/runtime
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 3 \
    https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/b10025 \
    --output "$archive.partial"
  mv "$archive.partial" "$archive"
fi
echo "0c173562b6096f60fb8cc0b320d69e13ae27f4c31e34f9859d47658571e141b2  $archive" | shasum -a 256 -c -
tar -xzf "$archive" -C "$cache"
source_dir="$cache/llama.cpp-b10025"
build_dir="$cache/build"
cmake -S "$source_dir" -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
  -DBUILD_SHARED_LIBS=OFF -DGGML_BACKEND_DL=OFF -DGGML_NATIVE=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_BLAS=ON \
  -DGGML_OPENMP=OFF -DLLAMA_OPENSSL=OFF \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF
cmake --build "$build_dir" --config Release --target llama-server --parallel 3
# Static llama.cpp libraries and embedded Metal source avoid external dylibs.
install -m 755 "$build_dir/bin/llama-server" src-tauri/runtime/llama-server
cp "$source_dir/LICENSE" src-tauri/runtime/LICENSE-llama.cpp.txt
mkdir -p src-tauri/runtime/licenses
find "$source_dir/vendor" -type f \( -iname 'LICENSE*' -o -iname 'COPYING*' \) | while IFS= read -r license; do
  relative="${license#"$source_dir/vendor/"}"
  mkdir -p "src-tauri/runtime/licenses/$(dirname "$relative")"
  cp "$license" "src-tauri/runtime/licenses/$relative"
done
codesign --force --sign - src-tauri/runtime/llama-server
node scripts/verify-mac.mjs --runtime
echo 'Prepared verified llama.cpp b10025 ARM64 runtime with Metal (macOS 13 target).'

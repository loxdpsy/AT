# atlas-engine: the offline translation engine of Atlas Translation (see atlas-engine.cpp).
#
# It is built from bergamot-translator, the engine Firefox uses. bergamot-translator is not copied into this
# repository. CI checks out browsermt/bergamot-translator (tag v0.4.5, with its submodules) into bergamot/ next to this
# file. To build locally, do the same:
#   git clone --depth 1 --branch v0.4.5 --recurse-submodules https://github.com/browsermt/bergamot-translator tools/atlas-engine/bergamot
#   cmake -S tools/atlas-engine -B build/engine && cmake --build build/engine --config Release
cmake_minimum_required(VERSION 3.16)
project(atlas-engine LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/bergamot/CMakeLists.txt")
  message(FATAL_ERROR "bergamot-translator is missing in tools/atlas-engine/bergamot. See the comment at the top of this file.")
endif()

# The CPU build that Firefox uses for these models: no GPU, no MKL, intgemm for the int8 models, no tests.
set(COMPILE_CPU ON CACHE BOOL "" FORCE)
set(COMPILE_CUDA OFF CACHE BOOL "" FORCE)
set(USE_MKL OFF CACHE BOOL "" FORCE)
set(USE_INTGEMM ON CACHE BOOL "" FORCE)
set(USE_FBGEMM OFF CACHE BOOL "" FORCE)
set(USE_RUY OFF CACHE BOOL "" FORCE)
set(USE_SENTENCEPIECE ON CACHE BOOL "" FORCE)
set(USE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(COMPILE_TESTS OFF CACHE BOOL "" FORCE)
set(COMPILE_UNIT_TESTS OFF CACHE BOOL "" FORCE)
set(COMPILE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(COMPILE_SERVER OFF CACHE BOOL "" FORCE)
set(COMPILE_WASM OFF CACHE BOOL "" FORCE)
set(COMPILE_PYTHON OFF CACHE BOOL "" FORCE)
# SentencePiece (through ssplit) needs PCRE2. Let the build download and compile it, so every runner gets the same copy.
set(SSPLIT_USE_INTERNAL_PCRE2 ON CACHE BOOL "" FORCE)

# CMake 4 no longer accepts "cmake_minimum_required" below 3.5, and SentencePiece (inside marian-dev) declares an older
# minimum. This lets the vendored code configure with CMake 3.5 rules. CI also sets CMAKE_POLICY_VERSION_MINIMUM=3.5 in
# the environment, which the PCRE2 sub-build needs (see engine.yml).
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# intgemm (inside marian-dev) builds with -Werror. GCC 12 reports a false "maybe-uninitialized" warning inside its own
# AVX-512 headers, which then stops the build. Turn that one warning off for GCC; other warnings stay errors.
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  add_compile_options(-Wno-maybe-uninitialized)
endif()

# Compiler fixes for the bundled dependencies. None of these change the bergamot code; each one is needed by a CI runner.

# faiss (inside marian-dev) uses uint8_t without including <cstdint>. Newer GCC (Ubuntu 24.04) does not include it
# indirectly any more, so every C++ file gets it.
add_compile_options($<$<COMPILE_LANG_AND_ID:CXX,GNU,Clang,AppleClang>:-include;cstdint>)

if(APPLE)
  # zlib (inside marian-dev) defines fdopen as a macro. The current macOS SDK declares fdopen in stdio.h, and the
  # macro breaks that declaration. Including stdio.h first, before zlib's macro, avoids it.
  add_compile_options($<$<COMPILE_LANGUAGE:C>:-include;stdio.h>)
  # sentencepiece (inside marian-dev) converts -1 to an enum. Apple clang in Xcode 16.4 treats that as an error.
  add_compile_options($<$<COMPILE_LANG_AND_ID:CXX,AppleClang,Clang>:-Wno-enum-constexpr-conversion>)
endif()

if(MSVC)
  # protobuf-lite (inside sentencepiece) needs std::hash_compare, which current MSVC does not have. See the header.
  add_compile_options($<$<COMPILE_LANGUAGE:CXX>:/FI${CMAKE_CURRENT_SOURCE_DIR}/compat/msvc_hash_compare.h>)
endif()

add_subdirectory(bergamot)

add_executable(atlas-engine atlas-engine.cpp)
target_link_libraries(atlas-engine PRIVATE bergamot-translator marian)

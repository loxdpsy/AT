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
# SentencePiece (through ssplit) needs PCRE2. On Linux and macOS, let the build download and compile it, so every runner
# gets the same copy. On Windows the internal build leaves the static library as pcre2-8-static.lib, which the link does
# not find (ssplit expects pcre2-8.lib). There, PCRE2 comes from vcpkg instead: engine.yml installs it and sets
# CMAKE_PREFIX_PATH, and ssplit finds it with find_library.
if(WIN32)
  set(SSPLIT_USE_INTERNAL_PCRE2 OFF CACHE BOOL "" FORCE)
else()
  set(SSPLIT_USE_INTERNAL_PCRE2 ON CACHE BOOL "" FORCE)
endif()

# CMake 4 no longer accepts "cmake_minimum_required" below 3.5, and SentencePiece (inside marian-dev) declares an older
# minimum. This lets the vendored code configure with CMake 3.5 rules. CI also sets CMAKE_POLICY_VERSION_MINIMUM=3.5 in
# the environment, which the PCRE2 sub-build needs (see engine.yml).
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# intgemm (inside marian-dev) builds with -Werror. GCC 12 reports a false "maybe-uninitialized" warning inside its own
# AVX-512 headers, which then stops the build. Turn that one warning off for GCC; other warnings stay errors.
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  add_compile_options(-Wno-maybe-uninitialized)
endif()

# marian-dev also builds with -Werror, so every warning that a newer compiler adds becomes a build error. Turn off the
# warnings that the bundled code trips, one by one. Each is limited to the compiler that reports it.
# GCC 13 (Ubuntu 24.04): spdlog writes template-id constructors (Foo<T>::Foo<...>), which C++20 warns about.
add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,GNU>:-Wno-template-id-cdtor>")

# Compiler fixes for the bundled dependencies. None of these change the bergamot code; each one is needed by a CI runner.

# faiss (inside marian-dev) uses uint8_t without including <cstdint>. Newer GCC (Ubuntu 24.04) does not include it
# indirectly any more, so every C++ file gets it.
add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,GNU,Clang,AppleClang>:-include;cstdint>")

if(APPLE)
  # zlib (inside marian-dev) defines fdopen as a macro. The current macOS SDK declares fdopen in stdio.h, and the
  # macro breaks that declaration. Including stdio.h first, before zlib's macro, avoids it.
  add_compile_options("$<$<COMPILE_LANGUAGE:C>:-include;stdio.h>")
  # sentencepiece (inside marian-dev) converts -1 to an enum. Apple clang in Xcode 16.4 treats that as an error.
  add_compile_options("$<$<COMPILE_LANG_AND_ID:CXX,AppleClang,Clang>:-Wno-enum-constexpr-conversion>")
  # Apple clang's -Wunused-but-set-variable and -Wvla-cxx-extension warnings are errors in marian-dev (see the
  # tree loop after add_subdirectory(bergamot)).
endif()

if(MSVC)
  # protobuf-lite (inside sentencepiece) needs std::hash_compare, which current MSVC does not have. See the header.
  add_compile_options("$<$<COMPILE_LANGUAGE:CXX>:/FI${CMAKE_CURRENT_SOURCE_DIR}/compat/msvc_hash_compare.h>")
endif()

add_subdirectory(bergamot)

# marian-dev gives each of its own targets -Wall and -Wextra, and those come after the directory options added above.
# So a -Wno- option set at directory level does not reach them: -Wall turns the warning back on. Apple clang reports
# two warnings in marian-dev's code, and -Werror makes them errors (factored_vocab.cpp and shortlist.cpp have
# unused-but-set variables; ExceptionWithCallStack.cpp has variable-length arrays, which C++ does not allow).
# Those options are added to every target in the bergamot tree, after its own options.
function(atlas_add_options_to_tree dir)
  get_property(targets DIRECTORY "${dir}" PROPERTY BUILDSYSTEM_TARGETS)
  foreach(target IN LISTS targets)
    get_target_property(kind ${target} TYPE)
    if(kind MATCHES "^(EXECUTABLE|STATIC_LIBRARY|SHARED_LIBRARY|MODULE_LIBRARY|OBJECT_LIBRARY)$")
      target_compile_options(${target} PRIVATE ${ARGN})
    endif()
  endforeach()
  get_property(subdirs DIRECTORY "${dir}" PROPERTY SUBDIRECTORIES)
  foreach(sub IN LISTS subdirs)
    atlas_add_options_to_tree("${sub}" ${ARGN})
  endforeach()
endfunction()

if(APPLE)
  atlas_add_options_to_tree("${CMAKE_CURRENT_BINARY_DIR}/bergamot" -Wno-unused-but-set-variable -Wno-vla-cxx-extension)
endif()

add_executable(atlas-engine atlas-engine.cpp)
target_link_libraries(atlas-engine PRIVATE bergamot-translator marian)

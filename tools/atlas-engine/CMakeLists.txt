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

add_subdirectory(bergamot)

add_executable(atlas-engine atlas-engine.cpp)
target_link_libraries(atlas-engine PRIVATE bergamot-translator marian)

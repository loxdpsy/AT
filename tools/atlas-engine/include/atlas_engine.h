/* atlas_engine: the offline translation engine of Atlas Translation as a C library (see atlas_engine_lib.cpp).
 *
 * The helper loads the library in its own process (atlas_engine.dll, libatlas_engine.so or libatlas_engine.dylib) and
 * calls these functions. One handle holds one language pack (one direction, for example English to French). Text is
 * UTF-8 and may hold any byte, so it is passed with its length. Every function that fails writes a message to the
 * error buffer and does not throw across this boundary.
 *
 * Thread safety: a handle translates one text at a time (calls on the same handle are serialised). Different handles
 * can be used from different threads.
 */
#ifndef ATLAS_ENGINE_H
#define ATLAS_ENGINE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#  ifdef ATLAS_ENGINE_BUILD
#    define ATLAS_ENGINE_API __declspec(dllexport)
#  else
#    define ATLAS_ENGINE_API __declspec(dllimport)
#  endif
#else
#  define ATLAS_ENGINE_API __attribute__((visibility("default")))
#endif

/* The version of this interface. The helper refuses a library with another version. */
#define ATLAS_ENGINE_API_VERSION 1

typedef struct AtlasEngine AtlasEngine;

/* The interface version of the loaded library (ATLAS_ENGINE_API_VERSION). */
ATLAS_ENGINE_API int atlas_engine_api_version(void);

/* Loads the language pack in packDir. Returns NULL on failure, with the reason in errorText (errorSize bytes). */
ATLAS_ENGINE_API AtlasEngine *atlas_engine_open(const char *packDir, char *errorText, size_t errorSize);

/* Translates len bytes of text. On success returns 0 and sets *out to a new NUL-terminated buffer of *outLen bytes
 * (not counting the NUL). Free it with atlas_engine_free_text. On failure returns nonzero, with the reason in errorText. */
ATLAS_ENGINE_API int atlas_engine_translate(AtlasEngine *engine, const char *text, size_t len, char **out,
                                            size_t *outLen, char *errorText, size_t errorSize);

/* Frees a buffer returned by atlas_engine_translate. NULL is allowed. */
ATLAS_ENGINE_API void atlas_engine_free_text(char *text);

/* Frees a handle from atlas_engine_open. NULL is allowed. */
ATLAS_ENGINE_API void atlas_engine_close(AtlasEngine *engine);

#ifdef __cplusplus
}
#endif

#endif /* ATLAS_ENGINE_H */

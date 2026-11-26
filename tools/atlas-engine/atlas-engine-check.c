/* atlas-engine-check: loads a language pack with the atlas_engine library and translates one text. It is the test of
 * the library (scripts/engine-smoke.mjs runs it). Usage: atlas-engine-check <pack folder> <text> */
#include <stdio.h>
#include <string.h>

#include "atlas_engine.h"

int main(int argc, char **argv) {
  char error[512] = {0};
  if (argc != 3) {
    fprintf(stderr, "Usage: atlas-engine-check <language pack folder> <text>\n");
    return 2;
  }
  if (atlas_engine_api_version() != ATLAS_ENGINE_API_VERSION) {
    fprintf(stderr, "the library has interface %d, expected %d\n", atlas_engine_api_version(), ATLAS_ENGINE_API_VERSION);
    return 1;
  }
  AtlasEngine *engine = atlas_engine_open(argv[1], error, sizeof error);
  if (!engine) {
    fprintf(stderr, "open: %s\n", error);
    return 1;
  }
  char *out = NULL;
  size_t outLen = 0;
  if (atlas_engine_translate(engine, argv[2], strlen(argv[2]), &out, &outLen, error, sizeof error) != 0) {
    fprintf(stderr, "translate: %s\n", error);
    atlas_engine_close(engine);
    return 1;
  }
  fwrite(out, 1, outLen, stdout);
  fputc('\n', stdout);
  atlas_engine_free_text(out);
  atlas_engine_close(engine);
  return 0;
}

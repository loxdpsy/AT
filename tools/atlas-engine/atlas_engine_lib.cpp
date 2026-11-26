// atlas_engine_lib: the offline engine as a shared library, with the C interface of include/atlas_engine.h.
//
// It loads and translates exactly as atlas-engine.cpp does (the same pack configuration, from pack_config.h, and the
// same service settings), but in the calling process: no pipes, no base64. The engine's own output (the libraries'
// messages) goes to stderr, not stdout.
#include "atlas_engine.h"

#include <cstdlib>
#include <cstring>
#include <exception>
#include <future>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>

#include "translator/parser.h"
#include "translator/response.h"
#include "translator/response_options.h"
#include "translator/service.h"

#include "pack_config.h"

// The same names the program uses (atlas-engine.cpp).
using namespace marian::bergamot;

struct AtlasEngine {
  explicit AtlasEngine(const AsyncService::Config &config) : service(config) {}
  AsyncService service;
  std::shared_ptr<TranslationModel> model;
  std::mutex mutex;
};

namespace {

// Writes the message into the caller's buffer, cut to fit and always NUL-terminated.
void setError(char *buffer, size_t size, const std::string &message) {
  if (!buffer || size == 0) return;
  const size_t n = message.size() < size - 1 ? message.size() : size - 1;
  std::memcpy(buffer, message.data(), n);
  buffer[n] = '\0';
}

}  // namespace

extern "C" {

int atlas_engine_api_version(void) { return ATLAS_ENGINE_API_VERSION; }

AtlasEngine *atlas_engine_open(const char *packDir, char *errorText, size_t errorSize) {
  if (!packDir) {
    setError(errorText, errorSize, "no language pack folder was given");
    return nullptr;
  }
  try {
    AsyncService::Config serviceConfig;
    serviceConfig.numWorkers = 1;
    serviceConfig.cacheSize = 0;
    // The same log level as the program: warnings and fatal errors are printed, the rest is not.
    serviceConfig.logger.level = "warn";
    std::unique_ptr<AtlasEngine> engine(new AtlasEngine(serviceConfig));
    // Not validated, as in atlas-engine.cpp and Firefox's TranslationModel constructor.
    auto options = parseOptionsFromString(modelConfig(fs::path(packDir)), /*validate=*/false);
    engine->model = engine->service.createCompatibleModel(options);
    return engine.release();
  } catch (const std::exception &e) {
    setError(errorText, errorSize, std::string("the engine did not load the language pack: ") + e.what());
  } catch (...) {
    setError(errorText, errorSize, "the engine did not load the language pack");
  }
  return nullptr;
}

int atlas_engine_translate(AtlasEngine *engine, const char *text, size_t len, char **out, size_t *outLen,
                           char *errorText, size_t errorSize) {
  if (!engine || !out || !outLen) {
    setError(errorText, errorSize, "the engine handle or the output is missing");
    return 1;
  }
  *out = nullptr;
  *outLen = 0;
  try {
    std::string translated;
    const std::string source(text ? text : "", text ? len : 0);
    if (!source.empty()) {
      std::lock_guard<std::mutex> lock(engine->mutex);
      std::promise<Response> promise;
      std::future<Response> future = promise.get_future();
      ResponseOptions responseOptions;
      engine->service.translate(engine->model, std::string(source),
                                [&promise](Response &&response) { promise.set_value(std::move(response)); },
                                responseOptions);
      translated = future.get().target.text;
    }
    char *buffer = static_cast<char *>(std::malloc(translated.size() + 1));
    if (!buffer) {
      setError(errorText, errorSize, "out of memory");
      return 1;
    }
    std::memcpy(buffer, translated.data(), translated.size());
    buffer[translated.size()] = '\0';
    *out = buffer;
    *outLen = translated.size();
    return 0;
  } catch (const std::exception &e) {
    setError(errorText, errorSize, std::string("the translation failed: ") + e.what());
  } catch (...) {
    setError(errorText, errorSize, "the translation failed");
  }
  return 1;
}

void atlas_engine_free_text(char *text) { std::free(text); }

void atlas_engine_close(AtlasEngine *engine) { delete engine; }

}  // extern "C"

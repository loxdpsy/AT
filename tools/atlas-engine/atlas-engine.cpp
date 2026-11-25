// atlas-engine: the offline translation engine of Atlas Translation, built from bergamot-translator (see CMakeLists.txt).
//
// It translates one language pair per process. The helper starts it with the folder of the pair (the files of one
// language pack, as downloaded and checked by the helper):
//
//   atlas-engine <pair folder>
//
// The engine loads the model files of the folder as they are (the files are not compressed), then prints the line
// "ready". After that it reads one line per text and writes one line back. Each line is the text in base64, so a
// text can hold any character, including new lines. The reply to an empty line is an empty line.
//
// The protocol has its own file handle. Anything the libraries print to stdout goes to stderr, so it cannot corrupt
// the replies.
#include <algorithm>
#include <cstdio>
#include <exception>
#include <filesystem>
#include <fstream>
#include <future>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include "common/file_stream.h"
#include "translator/parser.h"
#include "translator/response.h"
#include "translator/response_options.h"
#include "translator/service.h"

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#define DUP _dup
#define DUP2 _dup2
#define FILENO _fileno
#define FDOPEN _fdopen
#else
#include <unistd.h>
#define DUP dup
#define DUP2 dup2
#define FILENO fileno
#define FDOPEN fdopen
#endif

namespace fs = std::filesystem;

static const char kAlphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string base64Encode(const std::string &in) {
  std::string out;
  out.reserve((in.size() + 2) / 3 * 4);
  size_t i = 0;
  for (; i + 2 < in.size(); i += 3) {
    unsigned v = (static_cast<unsigned char>(in[i]) << 16) | (static_cast<unsigned char>(in[i + 1]) << 8) |
                 static_cast<unsigned char>(in[i + 2]);
    out += kAlphabet[(v >> 18) & 63];
    out += kAlphabet[(v >> 12) & 63];
    out += kAlphabet[(v >> 6) & 63];
    out += kAlphabet[v & 63];
  }
  if (i + 1 == in.size()) {
    unsigned v = static_cast<unsigned char>(in[i]) << 16;
    out += kAlphabet[(v >> 18) & 63];
    out += kAlphabet[(v >> 12) & 63];
    out += "==";
  } else if (i + 2 == in.size()) {
    unsigned v = (static_cast<unsigned char>(in[i]) << 16) | (static_cast<unsigned char>(in[i + 1]) << 8);
    out += kAlphabet[(v >> 18) & 63];
    out += kAlphabet[(v >> 12) & 63];
    out += kAlphabet[(v >> 6) & 63];
    out += '=';
  }
  return out;
}

// Returns false when the input is not valid base64.
static bool base64Decode(const std::string &in, std::string &out) {
  out.clear();
  unsigned buffer = 0;
  int bits = 0;
  for (char c : in) {
    if (c == '\r' || c == '\n' || c == ' ') continue;
    if (c == '=') break;
    const char *p = nullptr;
    for (const char *a = kAlphabet; *a; ++a) {
      if (*a == c) {
        p = a;
        break;
      }
    }
    if (!p) return false;
    buffer = (buffer << 6) | static_cast<unsigned>(p - kAlphabet);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += static_cast<char>((buffer >> bits) & 0xFF);
    }
  }
  return true;
}

// The first file in the folder whose name starts with prefix and ends with suffix.
static std::string findModelFile(const fs::path &dir, const std::string &prefix, const std::string &suffix) {
  std::vector<std::string> matches;
  for (const auto &entry : fs::directory_iterator(dir)) {
    const std::string name = entry.path().filename().string();
    if (name.size() >= prefix.size() + suffix.size() && name.compare(0, prefix.size(), prefix) == 0 &&
        name.compare(name.size() - suffix.size(), suffix.size(), suffix) == 0) {
      matches.push_back(entry.path().string());
    }
  }
  if (matches.empty()) throw std::runtime_error("the language pack has no " + prefix + "*" + suffix + " file");
  std::sort(matches.begin(), matches.end());
  return matches.front();
}

static std::string yamlQuote(const std::string &s) {
  std::string out = "\"";
  for (char c : s) {
    if (c == '\\' || c == '"') out += '\\';
    out += c;
  }
  return out + "\"";
}

// Marian's configuration for the pack. The options are the ones Firefox's translation worker passes for these models
// (toolkit/components/translations/content/translations-engine.worker.js): no quality model, and the same beam,
// precision and alignment settings. One vocabulary file serves both languages, as Firefox passes it.
static std::string modelConfig(const fs::path &dir) {
  const std::string model = findModelFile(dir, "model.", ".intgemm.alphas.bin");
  const std::string vocab = findModelFile(dir, "vocab.", ".spm");
  const std::string lex = findModelFile(dir, "lex.50.50.", ".s2t.bin");
  std::string yaml;
  yaml += "models:\n  - " + yamlQuote(model) + "\n";
  yaml += "vocabs:\n  - " + yamlQuote(vocab) + "\n";
  // The second value is the shortlist's check flag (0 = off, as Firefox's check-bytearray default). It is read with
  // std::stoi, so it must be a number, not "false".
  yaml += "shortlist:\n  - " + yamlQuote(lex) + "\n  - 0\n";
  yaml += "beam-size: 1\nnormalize: 1.0\nword-penalty: 0\nmax-length-break: 128\nmax-length-factor: 2.0\n";
  // quiet is off: with it on, Marian's error messages are not printed, and a failed check only shows as an abort.
  yaml += "mini-batch-words: 1024\nworkspace: 128\ncpu-threads: 0\nskip-cost: true\nquiet: false\n";
  yaml += "quiet-translation: true\nalignment: soft\ngemm-precision: int8shiftAlphaAll\n";
  return yaml;
}

#ifdef _WIN32
static void setBinaryStdin() { _setmode(_fileno(stdin), _O_BINARY); }
#else
static void setBinaryStdin() {}
#endif

int main(int argc, char **argv) {
  if (argc != 2) {
    std::fprintf(stderr, "Usage: atlas-engine <language pack folder>\n");
    return 2;
  }

  // The protocol goes to a copy of stdout. Everything else written to stdout goes to stderr.
  const int protocolFd = DUP(FILENO(stdout));
  DUP2(FILENO(stderr), FILENO(stdout));
  FILE *protocol = FDOPEN(protocolFd, "w");
  if (!protocol) return 1;
  setBinaryStdin();

  using namespace marian::bergamot;
  try {
    AsyncService::Config serviceConfig;
    serviceConfig.numWorkers = 1;
    serviceConfig.cacheSize = 0;
    AsyncService service(serviceConfig);
    // Not validated, as Firefox's TranslationModel constructor does it. The validator aborts on configs that Firefox
    // accepts, and an abort prints nothing when quiet is on.
    auto options = parseOptionsFromString(modelConfig(fs::path(argv[1])), /*validate=*/false);
    std::shared_ptr<TranslationModel> model = service.createCompatibleModel(options);

    std::fprintf(protocol, "ready\n");
    std::fflush(protocol);

    ResponseOptions responseOptions;
    std::string line;
    while (std::getline(std::cin, line)) {
      if (!line.empty() && line.back() == '\r') line.pop_back();
      std::string text;
      if (!base64Decode(line, text)) {
        std::fprintf(protocol, "\n");
        std::fflush(protocol);
        continue;
      }
      std::string translated;
      if (!text.empty()) {
        std::promise<Response> promise;
        std::future<Response> future = promise.get_future();
        service.translate(model, std::move(text), [&promise](Response &&response) { promise.set_value(std::move(response)); },
                          responseOptions);
        translated = future.get().target.text;
      }
      const std::string reply = base64Encode(translated);
      std::fprintf(protocol, "%s\n", reply.c_str());
      std::fflush(protocol);
    }
  } catch (const std::exception &e) {
    std::fprintf(stderr, "atlas-engine: %s\n", e.what());
    return 1;
  }
  return 0;
}

// Force-included into the C++ files that MSVC builds (see CMakeLists.txt).
//
// protobuf-lite, which sentencepiece bundles, names std::hash_compare for MSVC. The current MSVC standard library no
// longer has it, so those files do not compile. This gives it the same shape: a hash functor and a less-than functor.
// protobuf-lite uses it for its own hash containers, which store their keys with std::hash-like hashing; for C strings
// the hash follows the contents (as MSVC's did), so equal strings hash the same.
#pragma once

#include <cstddef>
#include <functional>

inline std::size_t atlas_hash_value(const char* s) {
  std::size_t h = 2166136261u;
  while (*s) {
    h = (h ^ static_cast<unsigned char>(*s++)) * 16777619u;
  }
  return h;
}

namespace std {

template <class _Key, class _Less = std::less<_Key> >
class hash_compare {
 public:
  static const size_t bucket_size = 4;
  static const size_t min_buckets = 8;

  size_t operator()(const _Key& key) const { return atlas_hash_value_of(key); }
  bool operator()(const _Key& a, const _Key& b) const { return _Less()(a, b); }

 private:
  template <class K>
  static size_t atlas_hash_value_of(const K& key) {
    return std::hash<K>()(key);
  }
  static size_t atlas_hash_value_of(const char* key) { return ::atlas_hash_value(key); }
};

}  // namespace std

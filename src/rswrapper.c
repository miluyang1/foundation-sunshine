/**
 * @file src/rswrapper.c
 * @brief Wrappers for nanors vectorization
 */

// _FORTIY_SOURCE can cause some versions of GCC to try to inline
// memset() with incompatible target options when compiling rs.c
#ifdef _FORTIFY_SOURCE
  #undef _FORTIFY_SOURCE
#endif

// The assert() function is decorated with __cold on macOS which
// is incompatible with Clang's target multiversioning feature
#ifndef NDEBUG
  #define NDEBUG
#endif

#define DECORATE_FUNC_I(a, b) a##b
#define DECORATE_FUNC(a, b) DECORATE_FUNC_I(a, b)

// Append a suffix to the public RS API. Modern nanors does its own runtime
// SIMD dispatch via oblas_get_impl(), so Sunshine only needs one compiled copy.
#define reed_solomon_init DECORATE_FUNC(reed_solomon_init, ISA_SUFFIX)
#define reed_solomon_new DECORATE_FUNC(reed_solomon_new, ISA_SUFFIX)
#define reed_solomon_new_static DECORATE_FUNC(reed_solomon_new_static, ISA_SUFFIX)
#define reed_solomon_release DECORATE_FUNC(reed_solomon_release, ISA_SUFFIX)
#define reed_solomon_decode DECORATE_FUNC(reed_solomon_decode, ISA_SUFFIX)
#define reed_solomon_encode DECORATE_FUNC(reed_solomon_encode, ISA_SUFFIX)

// Compile a default variant
#define ISA_SUFFIX _def
#include "../third-party/nanors/rs.c"
#undef ISA_SUFFIX

#undef reed_solomon_init
#undef reed_solomon_new
#undef reed_solomon_new_static
#undef reed_solomon_release
#undef reed_solomon_decode
#undef reed_solomon_encode

#include "rswrapper.h"

reed_solomon_new_t reed_solomon_new_fn;
reed_solomon_release_t reed_solomon_release_fn;
reed_solomon_encode_t reed_solomon_encode_fn;
reed_solomon_decode_t reed_solomon_decode_fn;

/**
 * @brief This initializes the RS function pointers to the best vectorized version available.
 * @details The streaming code will directly invoke these function pointers during encoding.
 */
void
reed_solomon_init(void) {
  reed_solomon_new_fn = reed_solomon_new_def;
  reed_solomon_release_fn = reed_solomon_release_def;
  reed_solomon_encode_fn = reed_solomon_encode_def;
  reed_solomon_decode_fn = reed_solomon_decode_def;
  reed_solomon_init_def();
}

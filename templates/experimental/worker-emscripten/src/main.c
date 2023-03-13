#include <stdio.h>
#include <emscripten.h>

// Minimize the dependencies of the STB image library.
#define STBI_NO_LINEAR
#define STBI_NO_HDR
#define STBI_ASSERT(x)
#define STBIR_ASSERT(x)
#define STBIW_ASSERT(x)

// Pull in the entire library.
#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb/stb_image_resize.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb/stb_image_write.h"

// Basic types and decls.
typedef   signed char        int8_t;
typedef unsigned char       uint8_t;
typedef          short      int16_t;
typedef unsigned short     uint16_t;
typedef          int        int32_t;
typedef unsigned int       uint32_t;
typedef          long long  int64_t;
typedef unsigned long long uint64_t;

typedef unsigned long size_t;
typedef unsigned char byte;
typedef unsigned int uint;

#define NULL ((void*)0)

// Location of the image file, allocated by init().
byte* image_buffer;

// init() is called from JS to allocate space for the image file.
byte* EMSCRIPTEN_KEEPALIVE init(size_t image_size) {
  // Allocate space for the image file.
  image_buffer = malloc(image_size);

  // Return the pointer to JavaScript so that it can fill in the image.
  return image_buffer;
}

// Hacky callback function needed by our image encoding library.
size_t write_off;
void write_to_buffer(void* context, void* data, int n) {
  memcpy(image_buffer + write_off, data, n);
  write_off += n;
}

// resize() is called from JS once the image file has been copied into
// WASM memory. It resizes the image to be target_width pixels wide.
size_t EMSCRIPTEN_KEEPALIVE resize(size_t filesize, size_t target_width) {
  // Decode the image.
  int width, height, channels;
  unsigned char* pixels = stbi_load_from_memory(
      image_buffer, filesize, &width, &height, &channels, 0);

  if (pixels == NULL) {
    // Image not recognized, so just pass it through.
    return 0;
  }

  if (width <= target_width) {
    // Target width is larger than actual. We only want to make
    // things smaller, so return the original image.
    return 0;
  }

  // Calculate the desired height to maintain aspect ratio.
  size_t target_height = height * target_width / width;

  // HACK: We write the output to the same buffer as the input. This works
  //   because the resize function process scan lines in order and we're
  //   strictly shrinking the image, so by the time a pixel is overwritten
  //   it is no longer needed anyway.
  stbir_resize_uint8(pixels, width, height, 0,
                     pixels, target_width, target_height, 0, channels);

  // HACK: We write the output file directly over the original file. This
  //   is mainly to avoid the need to pass a pointer back to the caller.
  write_off = 0;
  stbi_write_jpg_to_func(&write_to_buffer, NULL,
      target_width, target_height, channels, pixels, 90);

  return write_off;
}

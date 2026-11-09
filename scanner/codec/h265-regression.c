/* KindPath regression for CVE-2025-3887. Synthetic slice headers only;
 * counts never exceed the original 16-element arrays, so the negative
 * control demonstrates the missing bound check without overflowing them. */
#define GST_USE_UNSTABLE_API
#include <gst/codecparsers/gsth265parser.h>
#include <stdio.h>
#include <string.h>

static guint8 bytes[128];
static guint bit;
static void put(guint value, guint width) {
  while (width) {
    --width;
    bytes[bit / 8] |= ((value >> width) & 1) << (7 - bit % 8);
    ++bit;
  }
}
static void ue(guint value) {
  guint width = 0, encoded = value + 1;
  for (guint n = encoded; n; n >>= 1) ++width;
  put(0, width - 1); put(encoded, width);
}
static gboolean check(guint count, guint short_refs, GstH265ParserResult expected) {
  GstH265Parser *parser = gst_h265_parser_new();
  GstH265SliceHdr slice;
  memset(bytes, 0, sizeof(bytes)); bit = 0;
  parser->vps[0].valid = TRUE;
  parser->sps[0].valid = TRUE;
  parser->sps[0].pic_width_in_luma_samples = 64;
  parser->sps[0].pic_height_in_luma_samples = 64;
  parser->sps[0].num_short_term_ref_pic_sets = 1;
  parser->sps[0].short_term_ref_pic_set[0].NumNegativePics = short_refs;
  parser->sps[0].long_term_ref_pics_present_flag = 1;
  parser->pps[0].valid = TRUE;
  put(1, 1); ue(0); ue(2); /* First slice, PPS 0, I slice. */
  put(0, 4); put(1, 1);   /* POC, use SPS short-term set 0. */
  ue(count);
  for (guint i = 0; i < count; ++i) put(0, 6); /* POC, used, delta. */
  ue(0); put(1, 1); /* QP delta and alignment. */
  GstH265NalUnit nalu = { .data = bytes, .size = (bit + 7) / 8,
    .type = GST_H265_NAL_SLICE_TRAIL_R, .temporal_id_plus1 = 1 };
  GstH265ParserResult actual = gst_h265_parser_parse_slice_hdr(parser, &nalu, &slice);
  if (actual == GST_H265_PARSER_OK) gst_h265_slice_hdr_free(&slice);
  gst_h265_parser_free(parser);
  if (actual != expected) {
    fprintf(stderr, "H265 bound check failed: long=%u short=%u result=%d expected=%d\n",
      count, short_refs, actual, expected);
    return FALSE;
  }
  return TRUE;
}
int main(int argc, char **argv) {
  gboolean original = argc == 2 && strcmp(argv[1], "--original") == 0;
  gst_init(NULL, NULL);
  if (!check(15, 0, GST_H265_PARSER_OK) ||
      !check(16, 0, original ? GST_H265_PARSER_OK : GST_H265_PARSER_ERROR) ||
      !check(12, 3, GST_H265_PARSER_OK) ||
      !check(13, 3, original ? GST_H265_PARSER_OK : GST_H265_PARSER_ERROR)) return 1;
  puts(original ? "Original H265 library: missing checks reproduced" : "Patched H265 reference-picture bounds: passed");
  return 0;
}

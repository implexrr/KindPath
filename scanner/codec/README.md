# GStreamer H.265 backport patches

These unmodified upstream patches are used only by the browser QA image's existing
GStreamer backport. Keeping them here avoids a GitHub download during each build.
The Dockerfile verifies both SHA-256 hashes before applying them with zero fuzz.
Original authorship and upstream references remain in the patch headers.

| File | Upstream commit | SHA-256 |
| --- | --- | --- |
| `gstreamer-h265-prerequisite.patch` | [e4351ef](https://github.com/GStreamer/gstreamer/commit/e4351ef03f1331410b0c1216a6178d885f37e495) | `67657bfba83291e4be2b7acbe0f481858270f26570a45fea7a2de78aaf432164` |
| `gstreamer-h265-fix.patch` | [ed4c2ce](https://github.com/GStreamer/gstreamer/commit/ed4c2ce380f7168bd4a3423f4398eb341cb931c7) | `1893a2d4dfdb1f57915616cd759415d5f403b62545ee2f79377813684b7bf7f7` |

The affected GStreamer source is licensed under LGPL-2.1-or-later; its license
text is included as `COPYING.LGPL-2.1`. This notice applies to this third-party
backport, not to the rest of KindPath. The existing parser tests, targeted
regression and exported-symbol comparison remain part of the image build.

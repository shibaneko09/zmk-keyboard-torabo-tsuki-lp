/* SPDX-License-Identifier: MIT */
#include <torabo/pointing_router.h>

/* Phase 1 configuration resolver; Phase 0 uses the static Layer 6 DT node. */
enum torabo_pointing_mode torabo_pointing_resolve_mode(
	const uint8_t *active_layers, size_t active_count,
	const struct torabo_layer_pointing_mode *modes, size_t mode_count,
	enum torabo_pointing_mode fallback) {
	if (!active_layers || !modes) return fallback;
	for (size_t i = active_count; i > 0; --i)
		for (size_t j = 0; j < mode_count; ++j)
			if (modes[j].layer_id == active_layers[i - 1] && modes[j].mode != TORABO_POINTING_INHERIT)
				return modes[j].mode;
	return fallback;
}

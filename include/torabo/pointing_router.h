/* SPDX-License-Identifier: MIT */
#ifndef TORABO_POINTING_ROUTER_H
#define TORABO_POINTING_ROUTER_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum torabo_pointing_mode {
	TORABO_POINTING_INHERIT = 0,
	TORABO_POINTING_CURSOR,
	TORABO_POINTING_SCROLL,
	TORABO_POINTING_GESTURE,
	TORABO_POINTING_DISABLED,
};

struct torabo_layer_pointing_mode {
	uint8_t layer_id;
	enum torabo_pointing_mode mode;
};

/* modes are ordered from lowest to highest active layer */
/* Reserved for Phase 1 runtime layer configuration; unused by Phase 0. */
enum torabo_pointing_mode torabo_pointing_resolve_mode(
	const uint8_t *active_layers, size_t active_count,
	const struct torabo_layer_pointing_mode *modes, size_t mode_count,
	enum torabo_pointing_mode fallback);

enum torabo_gesture_direction {
	TORABO_GESTURE_NONE = 0,
	TORABO_GESTURE_UP,
	TORABO_GESTURE_DOWN,
	TORABO_GESTURE_LEFT,
	TORABO_GESTURE_RIGHT,
};

struct torabo_gesture_config {
	int16_t deadzone;
	int16_t threshold;
	uint8_t dominance_percent;
};

struct torabo_gesture {
	int32_t x;
	int32_t y;
	int32_t report_x;
	int32_t report_y;
	bool triggered;
};

void torabo_gesture_reset(struct torabo_gesture *gesture);
enum torabo_gesture_direction torabo_gesture_update(
	struct torabo_gesture *gesture, const struct torabo_gesture_config *config,
	int16_t dx, int16_t dy);

/* Add one event to the report accumulator. Direction is returned only at sync. */
enum torabo_gesture_direction torabo_gesture_accumulate(
	struct torabo_gesture *gesture, const struct torabo_gesture_config *config,
	int32_t dx, int32_t dy, bool sync, bool *shared_latch);

#endif

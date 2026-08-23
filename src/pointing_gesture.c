/* SPDX-License-Identifier: MIT */
#include <torabo/pointing_router.h>

static int32_t abs32(int32_t value) { return value == INT32_MIN ? INT32_MAX : value < 0 ? -value : value; }
static int32_t sat_add(int32_t a, int32_t b) {
	if (b > 0 && a > INT32_MAX - b) return INT32_MAX;
	if (b < 0 && a < INT32_MIN - b) return INT32_MIN;
	return a + b;
}

void torabo_gesture_reset(struct torabo_gesture *gesture) {
	if (gesture) {
		gesture->x = 0;
		gesture->y = 0;
		gesture->report_x = 0;
		gesture->report_y = 0;
		gesture->triggered = false;
	}
}

enum torabo_gesture_direction torabo_gesture_update(
	struct torabo_gesture *gesture, const struct torabo_gesture_config *config,
	int16_t dx, int16_t dy) {
	if (!gesture || !config || gesture->triggered) return TORABO_GESTURE_NONE;
	gesture->x = sat_add(gesture->x, dx);
	gesture->y = sat_add(gesture->y, dy);
	int32_t ax = abs32(gesture->x), ay = abs32(gesture->y);
	int32_t distance = ax > ay ? ax : ay;
	if (distance < config->threshold || distance <= config->deadzone) return TORABO_GESTURE_NONE;
	uint8_t dominance = config->dominance_percent < 50 ? 50 : config->dominance_percent;
	if (((int64_t)ax * 100) < ((int64_t)ay * dominance) && ((int64_t)ay * 100) < ((int64_t)ax * dominance)) return TORABO_GESTURE_NONE;
	gesture->triggered = true;
	if (ax >= ay) return gesture->x >= 0 ? TORABO_GESTURE_RIGHT : TORABO_GESTURE_LEFT;
	return gesture->y >= 0 ? TORABO_GESTURE_DOWN : TORABO_GESTURE_UP;
}

enum torabo_gesture_direction torabo_gesture_accumulate(
	struct torabo_gesture *gesture, const struct torabo_gesture_config *config,
	int32_t dx, int32_t dy, bool sync, bool *shared_latch) {
	if (!gesture || !config) return TORABO_GESTURE_NONE;
	if (gesture->triggered || (shared_latch && *shared_latch)) return TORABO_GESTURE_NONE;
	gesture->report_x = sat_add(gesture->report_x, dx);
	gesture->report_y = sat_add(gesture->report_y, dy);
	if (!sync) return TORABO_GESTURE_NONE;
	int32_t report_x = gesture->report_x, report_y = gesture->report_y;
	int32_t rx = abs32(report_x), ry = abs32(report_y);
	gesture->report_x = gesture->report_y = 0;
	if (rx <= config->deadzone && ry <= config->deadzone) return TORABO_GESTURE_NONE;
	gesture->x = sat_add(gesture->x, report_x);
	gesture->y = sat_add(gesture->y, report_y);
	enum torabo_gesture_direction direction = torabo_gesture_update(gesture, config, 0, 0);
	if (direction != TORABO_GESTURE_NONE && shared_latch) *shared_latch = true;
	return direction;
}

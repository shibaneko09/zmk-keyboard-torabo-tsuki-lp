/* SPDX-License-Identifier: MIT */
#include <assert.h>
#include <torabo/pointing_router.h>

static void test_modes(void) {
	const uint8_t active[] = {0, 4, 5};
	const struct torabo_layer_pointing_mode modes[] = {
		{0, TORABO_POINTING_CURSOR}, {4, TORABO_POINTING_INHERIT},
		{5, TORABO_POINTING_SCROLL},
	};
	assert(torabo_pointing_resolve_mode(active, 3, modes, 3,
	                                    TORABO_POINTING_CURSOR) == TORABO_POINTING_SCROLL);
	assert(torabo_pointing_resolve_mode(active, 2, modes, 3,
	                                    TORABO_POINTING_CURSOR) == TORABO_POINTING_CURSOR);
}

static void test_gesture(void) {
	struct torabo_gesture g;
	const struct torabo_gesture_config c = {.deadzone = 2, .threshold = 10,
	                                        .dominance_percent = 150};
	torabo_gesture_reset(&g);
	bool latch = false;
	assert(torabo_gesture_accumulate(&g, &c, 1, 1, false, &latch) == TORABO_GESTURE_NONE);
	assert(torabo_gesture_accumulate(&g, &c, 12, 1, true, &latch) == TORABO_GESTURE_RIGHT);
	assert(torabo_gesture_accumulate(&g, &c, -20, 0, true, &latch) == TORABO_GESTURE_NONE);
	torabo_gesture_reset(&g);
	latch = false;
	assert(torabo_gesture_accumulate(&g, &c, 0, -20, true, &latch) == TORABO_GESTURE_UP);
	torabo_gesture_reset(&g);
	latch = false;
	assert(torabo_gesture_accumulate(&g, &c, 10, 10, true, &latch) == TORABO_GESTURE_NONE);
}

static void test_all_directions_and_sync(void) {
	const struct torabo_gesture_config c = {.deadzone = 2, .threshold = 10,
	                                        .dominance_percent = 150};
	const int16_t vectors[][2] = {{0, 12}, {0, -12}, {-12, 0}, {12, 0}};
	const enum torabo_gesture_direction expected[] = {TORABO_GESTURE_DOWN,
		TORABO_GESTURE_UP, TORABO_GESTURE_LEFT, TORABO_GESTURE_RIGHT};
	for (size_t i = 0; i < 4; ++i) {
		struct torabo_gesture g;
		bool latch = false;
		torabo_gesture_reset(&g);
		assert(torabo_gesture_accumulate(&g, &c, vectors[i][0], vectors[i][1], false,
		                                 &latch) == TORABO_GESTURE_NONE);
		assert(torabo_gesture_accumulate(&g, &c, 0, 0, true, &latch) == expected[i]);
	}
	struct torabo_gesture g;
	bool latch = false;
	torabo_gesture_reset(&g);
	assert(torabo_gesture_accumulate(&g, &c, 9, 0, true, &latch) == TORABO_GESTURE_NONE);
	assert(torabo_gesture_accumulate(&g, &c, 20, 0, false, &latch) == TORABO_GESTURE_NONE);
	assert(torabo_gesture_accumulate(&g, &c, 0, 20, true, &latch) == TORABO_GESTURE_NONE);
	/* Same activation is latched; reset models layer deactivation. */
	assert(torabo_gesture_accumulate(&g, &c, 0, 0, true, &latch) == TORABO_GESTURE_NONE);
	torabo_gesture_reset(&g); latch = false;
	assert(torabo_gesture_accumulate(&g, &c, 12, 0, true, &latch) == TORABO_GESTURE_RIGHT);
	int32_t held_x = g.x, held_y = g.y, held_rx = g.report_x, held_ry = g.report_y;
	assert(torabo_gesture_accumulate(&g, &c, 40, 40, true, &latch) == TORABO_GESTURE_NONE);
	assert(g.x == held_x && g.y == held_y && g.report_x == held_rx && g.report_y == held_ry);
	torabo_gesture_reset(&g);
	latch = false;
	assert(torabo_gesture_accumulate(&g, &c, -12, 0, true, &latch) == TORABO_GESTURE_LEFT);
}

static void test_shared_latch_and_modes(void) {
	const struct torabo_gesture_config c = {.deadzone = 0, .threshold = 5,
	                                        .dominance_percent = 150};
	struct torabo_gesture a, b;
	bool latch = false;
	torabo_gesture_reset(&a); torabo_gesture_reset(&b);
	assert(torabo_gesture_accumulate(&a, &c, 8, 0, true, &latch) == TORABO_GESTURE_RIGHT);
	int32_t ax = a.x, ay = a.y, arx = a.report_x, ary = a.report_y;
	assert(torabo_gesture_accumulate(&b, &c, -8, 0, true, &latch) == TORABO_GESTURE_NONE);
	assert(a.x == ax && a.y == ay && a.report_x == arx && a.report_y == ary);
	const uint8_t active[] = {0, 4, 5};
	const struct torabo_layer_pointing_mode modes[] = {{0, TORABO_POINTING_CURSOR},
		{4, TORABO_POINTING_INHERIT}, {5, TORABO_POINTING_SCROLL}};
	assert(torabo_pointing_resolve_mode(active, 3, modes, 3, TORABO_POINTING_DISABLED) == TORABO_POINTING_SCROLL);
	assert(torabo_pointing_resolve_mode(active, 2, modes, 3, TORABO_POINTING_DISABLED) == TORABO_POINTING_CURSOR);
	assert(torabo_pointing_resolve_mode((const uint8_t[]){9}, 1, modes, 3, TORABO_POINTING_DISABLED) == TORABO_POINTING_DISABLED);
	struct torabo_gesture sat = {.x = INT32_MAX - 1, .y = INT32_MIN + 1};
	latch = false;
	assert(torabo_gesture_accumulate(&sat, &c, 10, -10, false, &latch) == TORABO_GESTURE_NONE);
	assert(sat.report_x == 10 && sat.report_y == -10);
	assert(torabo_gesture_accumulate(&sat, &c, 10, -10, true, &latch) == TORABO_GESTURE_NONE);
	assert(!latch);
	assert(sat.x == INT32_MAX && sat.y == INT32_MIN);
}

static void test_boundaries(void) {
	const struct torabo_gesture_config c = {.deadzone = 2, .threshold = 10,
	                                        .dominance_percent = 150};
	struct torabo_gesture g;
	bool latch = false;
	torabo_gesture_reset(&g);
	assert(torabo_gesture_accumulate(&g, &c, 10, 0, true, &latch) == TORABO_GESTURE_RIGHT);
	torabo_gesture_reset(&g); latch = false;
	assert(torabo_gesture_accumulate(&g, &c, 2, 0, true, &latch) == TORABO_GESTURE_NONE);
	assert(torabo_gesture_accumulate(&g, &c, 3, 0, true, &latch) == TORABO_GESTURE_NONE);
	torabo_gesture_reset(&g); latch = false;
	/* 150% dominance boundary is accepted as a cardinal direction. */
	assert(torabo_gesture_accumulate(&g, &c, 15, 10, true, &latch) == TORABO_GESTURE_RIGHT);
}

int main(void) { test_modes(); test_gesture(); test_all_directions_and_sync(); test_shared_latch_and_modes(); test_boundaries(); return 0; }

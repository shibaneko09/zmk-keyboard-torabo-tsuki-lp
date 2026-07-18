/*
 * Copyright (c) 2026 shibaneko09
 *
 * SPDX-License-Identifier: MIT
 */

#pragma once

#include <stdbool.h>
#include <stdint.h>

#define TORABO_CURSOR_SCALE_MIN_MILLI 250
#define TORABO_CURSOR_SCALE_MAX_MILLI 2000
#define TORABO_SCROLL_SCALE_MIN_MILLI 100
#define TORABO_SCROLL_SCALE_MAX_MILLI 2000

struct torabo_pointing_settings {
    uint16_t cursor_scale_milli;
    uint16_t scroll_scale_milli;
    bool invert_scroll_x;
    bool invert_scroll_y;
};

void torabo_pointing_settings_get(struct torabo_pointing_settings *settings);
int torabo_pointing_settings_set_and_save(const struct torabo_pointing_settings *settings);

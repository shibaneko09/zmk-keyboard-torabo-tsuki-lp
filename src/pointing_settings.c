/*
 * Copyright (c) 2026 shibaneko09
 *
 * SPDX-License-Identifier: MIT
 */

#define DT_DRV_COMPAT torabo_input_processor_pointing_settings

#include <errno.h>
#include <stddef.h>

#include <zephyr/device.h>
#include <zephyr/input/input.h>
#include <zephyr/settings/settings.h>
#include <zephyr/sys/atomic.h>

#include <drivers/input_processor.h>

#include <torabo/pointing_settings.h>

#define POINTING_SETTINGS_KEY "torabo/pointing/settings"
#define POINTING_MODE_CURSOR 0
#define POINTING_MODE_SCROLL 1
#define POINTING_FLAG_INVERT_SCROLL_X BIT(0)
#define POINTING_FLAG_INVERT_SCROLL_Y BIT(1)
#define SCALE_DENOMINATOR 1000

struct persisted_pointing_settings {
    uint16_t cursor_scale_milli;
    uint16_t scroll_scale_milli;
    uint8_t flags;
} __packed;

static atomic_t cursor_scale_milli = ATOMIC_INIT(1000);
static atomic_t scroll_scale_milli = ATOMIC_INIT(333);
static atomic_t scroll_flags = ATOMIC_INIT(POINTING_FLAG_INVERT_SCROLL_X);

static bool settings_valid(const struct torabo_pointing_settings *settings) {
    return settings->cursor_scale_milli >= TORABO_CURSOR_SCALE_MIN_MILLI &&
           settings->cursor_scale_milli <= TORABO_CURSOR_SCALE_MAX_MILLI &&
           settings->scroll_scale_milli >= TORABO_SCROLL_SCALE_MIN_MILLI &&
           settings->scroll_scale_milli <= TORABO_SCROLL_SCALE_MAX_MILLI;
}

static void apply_settings(const struct torabo_pointing_settings *settings) {
    atomic_set(&cursor_scale_milli, settings->cursor_scale_milli);
    atomic_set(&scroll_scale_milli, settings->scroll_scale_milli);
    atomic_set(&scroll_flags,
               (settings->invert_scroll_x ? POINTING_FLAG_INVERT_SCROLL_X : 0) |
                   (settings->invert_scroll_y ? POINTING_FLAG_INVERT_SCROLL_Y : 0));
}

void torabo_pointing_settings_get(struct torabo_pointing_settings *settings) {
    atomic_val_t flags = atomic_get(&scroll_flags);

    settings->cursor_scale_milli = atomic_get(&cursor_scale_milli);
    settings->scroll_scale_milli = atomic_get(&scroll_scale_milli);
    settings->invert_scroll_x = (flags & POINTING_FLAG_INVERT_SCROLL_X) != 0;
    settings->invert_scroll_y = (flags & POINTING_FLAG_INVERT_SCROLL_Y) != 0;
}

int torabo_pointing_settings_set_and_save(const struct torabo_pointing_settings *settings) {
    if (!settings_valid(settings)) {
        return -EINVAL;
    }

    struct torabo_pointing_settings previous;
    torabo_pointing_settings_get(&previous);
    apply_settings(settings);

    struct persisted_pointing_settings persisted = {
        .cursor_scale_milli = settings->cursor_scale_milli,
        .scroll_scale_milli = settings->scroll_scale_milli,
        .flags = (settings->invert_scroll_x ? POINTING_FLAG_INVERT_SCROLL_X : 0) |
                 (settings->invert_scroll_y ? POINTING_FLAG_INVERT_SCROLL_Y : 0),
    };

    int ret = settings_save_one(POINTING_SETTINGS_KEY, &persisted, sizeof(persisted));
    if (ret < 0) {
        apply_settings(&previous);
    }

    return ret;
}

static int pointing_settings_load(const char *name, size_t len, settings_read_cb read_cb,
                                  void *cb_arg) {
    if (!settings_name_steq(name, "settings", NULL)) {
        return -ENOENT;
    }

    if (len != sizeof(struct persisted_pointing_settings)) {
        return -EINVAL;
    }

    struct persisted_pointing_settings persisted;
    int ret = read_cb(cb_arg, &persisted, sizeof(persisted));
    if (ret < 0) {
        return ret;
    }

    struct torabo_pointing_settings settings = {
        .cursor_scale_milli = persisted.cursor_scale_milli,
        .scroll_scale_milli = persisted.scroll_scale_milli,
        .invert_scroll_x = (persisted.flags & POINTING_FLAG_INVERT_SCROLL_X) != 0,
        .invert_scroll_y = (persisted.flags & POINTING_FLAG_INVERT_SCROLL_Y) != 0,
    };

    if (!settings_valid(&settings)) {
        return -EINVAL;
    }

    apply_settings(&settings);
    return 0;
}

SETTINGS_STATIC_HANDLER_DEFINE(torabo_pointing, "torabo/pointing", NULL, pointing_settings_load,
                               NULL, NULL);

static int scale_event(struct input_event *event, uint16_t scale_milli, bool invert,
                       struct zmk_input_processor_state *state) {
    int32_t scaled_input = event->value * (int32_t)scale_milli;
    if (invert) {
        scaled_input = -scaled_input;
    }
    if (state && state->remainder) {
        scaled_input += *state->remainder;
    }

    int32_t scaled = scaled_input / SCALE_DENOMINATOR;
    if (state && state->remainder) {
        *state->remainder = scaled_input - (scaled * SCALE_DENOMINATOR);
    }
    event->value = scaled;

    return ZMK_INPUT_PROC_CONTINUE;
}

static int pointing_settings_handle_event(const struct device *dev, struct input_event *event,
                                          uint32_t param1, uint32_t param2,
                                          struct zmk_input_processor_state *state) {
    ARG_UNUSED(dev);
    ARG_UNUSED(param2);

    if (event->type != INPUT_EV_REL) {
        return ZMK_INPUT_PROC_CONTINUE;
    }

    if (param1 == POINTING_MODE_CURSOR &&
        (event->code == INPUT_REL_X || event->code == INPUT_REL_Y)) {
        return scale_event(event, atomic_get(&cursor_scale_milli), false, state);
    }

    if (param1 == POINTING_MODE_SCROLL &&
        (event->code == INPUT_REL_HWHEEL || event->code == INPUT_REL_WHEEL)) {
        atomic_val_t flags = atomic_get(&scroll_flags);
        bool invert = event->code == INPUT_REL_HWHEEL
                          ? (flags & POINTING_FLAG_INVERT_SCROLL_X) != 0
                          : (flags & POINTING_FLAG_INVERT_SCROLL_Y) != 0;
        return scale_event(event, atomic_get(&scroll_scale_milli), invert, state);
    }

    return ZMK_INPUT_PROC_CONTINUE;
}

static const struct zmk_input_processor_driver_api pointing_settings_driver_api = {
    .handle_event = pointing_settings_handle_event,
};

#define POINTING_SETTINGS_INST(n)                                                                  \
    DEVICE_DT_INST_DEFINE(n, NULL, NULL, NULL, NULL, POST_KERNEL,                                 \
                          CONFIG_KERNEL_INIT_PRIORITY_DEFAULT, &pointing_settings_driver_api);

DT_INST_FOREACH_STATUS_OKAY(POINTING_SETTINGS_INST)

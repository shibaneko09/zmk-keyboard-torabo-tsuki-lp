/*
 * Copyright (c) 2026 shibaneko09
 *
 * SPDX-License-Identifier: MIT
 */

#include <zephyr/logging/log.h>

#include <zmk/studio/rpc.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

ZMK_RPC_SUBSYSTEM(pointing)

static zmk_studio_Response get_settings(const zmk_studio_Request *req) {
    ARG_UNUSED(req);

    zmk_pointing_Settings settings = zmk_pointing_Settings_init_zero;
    settings.cursor_scale_milli = 1000;
    settings.scroll_scale_milli = 333;
    settings.invert_scroll_x = true;
    settings.invert_scroll_y = false;

    return ZMK_RPC_RESPONSE(pointing, get_settings, settings);
}

ZMK_RPC_SUBSYSTEM_HANDLER(pointing, get_settings, ZMK_STUDIO_RPC_HANDLER_UNSECURED);

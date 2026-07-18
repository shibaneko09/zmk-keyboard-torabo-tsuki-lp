/*
 * Copyright (c) 2026 shibaneko09
 *
 * SPDX-License-Identifier: MIT
 */

#include <zephyr/logging/log.h>

#include <zmk/studio/rpc.h>

#include <torabo/pointing_settings.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

static zmk_studio_Response pointing_subsystem_handler(const struct zmk_rpc_subsystem *subsys,
                                                      const zmk_studio_Request *req) {
    uint8_t which_req = req->subsystem.pointing.which_request_type;

    return zmk_rpc_subsystem_delegate_to_subs(subsys, req, which_req);
}

STRUCT_SECTION_ITERABLE(zmk_rpc_subsystem, pointing_subsystem) = {
    .func = pointing_subsystem_handler,
    .subsystem_choice = zmk_studio_Request_pointing_tag,
};

static zmk_studio_PointingSettings encode_settings(void) {
    struct torabo_pointing_settings current;
    torabo_pointing_settings_get(&current);

    zmk_studio_PointingSettings settings = zmk_studio_PointingSettings_init_zero;
    settings.cursor_scale_milli = current.cursor_scale_milli;
    settings.scroll_scale_milli = current.scroll_scale_milli;
    settings.invert_scroll_x = current.invert_scroll_x;
    settings.invert_scroll_y = current.invert_scroll_y;

    return settings;
}

static zmk_studio_Response settings_response(const zmk_studio_Request *req, uint8_t response_tag,
                                             zmk_studio_PointingSettings settings) {
    zmk_studio_Response response = zmk_studio_Response_init_zero;
    response.which_type = zmk_studio_Response_request_response_tag;
    response.type.request_response.request_id = req->request_id;
    response.type.request_response.which_subsystem = zmk_studio_RequestResponse_pointing_tag;
    response.type.request_response.subsystem.pointing.which_response_type = response_tag;

    if (response_tag == zmk_studio_PointingResponse_get_settings_tag) {
        response.type.request_response.subsystem.pointing.response_type.get_settings = settings;
    } else {
        response.type.request_response.subsystem.pointing.response_type.set_settings = settings;
    }

    return response;
}

static zmk_studio_Response get_settings(const zmk_studio_Request *req) {
    return settings_response(req, zmk_studio_PointingResponse_get_settings_tag, encode_settings());
}

static zmk_studio_Response set_settings(const zmk_studio_Request *req) {
    const zmk_studio_PointingSettings *requested =
        &req->subsystem.pointing.request_type.set_settings;
    struct torabo_pointing_settings settings = {
        .cursor_scale_milli = requested->cursor_scale_milli,
        .scroll_scale_milli = requested->scroll_scale_milli,
        .invert_scroll_x = requested->invert_scroll_x,
        .invert_scroll_y = requested->invert_scroll_y,
    };

    if (torabo_pointing_settings_set_and_save(&settings) < 0) {
        return ZMK_RPC_SIMPLE_ERR(GENERIC);
    }

    return settings_response(req, zmk_studio_PointingResponse_set_settings_tag, encode_settings());
}

STRUCT_SECTION_ITERABLE(zmk_rpc_subsystem_handler, pointing_subsystem_get_settings_handler) = {
    .func = get_settings,
    .subsystem_choice = zmk_studio_Request_pointing_tag,
    .request_choice = zmk_studio_PointingRequest_get_settings_tag,
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

STRUCT_SECTION_ITERABLE(zmk_rpc_subsystem_handler, pointing_subsystem_set_settings_handler) = {
    .func = set_settings,
    .subsystem_choice = zmk_studio_Request_pointing_tag,
    .request_choice = zmk_studio_PointingRequest_set_settings_tag,
    .security = ZMK_STUDIO_RPC_HANDLER_SECURED,
};

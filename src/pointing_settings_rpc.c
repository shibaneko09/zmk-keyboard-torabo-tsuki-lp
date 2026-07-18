/*
 * Copyright (c) 2026 shibaneko09
 *
 * SPDX-License-Identifier: MIT
 */

#include <zephyr/logging/log.h>

#include <zmk/studio/rpc.h>

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

static zmk_studio_Response get_settings(const zmk_studio_Request *req) {
    ARG_UNUSED(req);

    zmk_studio_PointingSettings settings = zmk_studio_PointingSettings_init_zero;
    settings.cursor_scale_milli = 1000;
    settings.scroll_scale_milli = 333;
    settings.invert_scroll_x = true;
    settings.invert_scroll_y = false;

    zmk_studio_Response response = zmk_studio_Response_init_zero;
    response.which_type = zmk_studio_Response_request_response_tag;
    response.type.request_response.which_subsystem = zmk_studio_RequestResponse_pointing_tag;
    response.type.request_response.subsystem.pointing.which_response_type =
        zmk_studio_PointingResponse_get_settings_tag;
    response.type.request_response.subsystem.pointing.response_type.get_settings = settings;

    return response;
}

STRUCT_SECTION_ITERABLE(zmk_rpc_subsystem_handler, pointing_subsystem_get_settings_handler) = {
    .func = get_settings,
    .subsystem_choice = zmk_studio_Request_pointing_tag,
    .request_choice = zmk_studio_PointingRequest_get_settings_tag,
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

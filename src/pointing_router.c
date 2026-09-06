/* SPDX-License-Identifier: MIT */
#define DT_DRV_COMPAT torabo_input_processor_pointing_router

#include <zephyr/devicetree.h>

#if DT_HAS_COMPAT_STATUS_OKAY(DT_DRV_COMPAT)

#include <zephyr/device.h>
#include <zephyr/input/input.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/util.h>
#include <zephyr/dt-bindings/input/input-event-codes.h>
#include <drivers/input_processor.h>
#include <zmk/behavior.h>
#include <zmk/keymap.h>
#include <zmk/input_listeners.h>
#include <zmk/virtual_key_position.h>
#include <zmk/events/layer_state_changed.h>
#include <zmk/event_manager.h>
#include <torabo/pointing_router.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

struct router_config {
	uint8_t layer;
	int16_t threshold;
	int16_t deadzone;
	uint8_t dominance;
	const struct zmk_behavior_binding *bindings;
};

enum router_gesture_phase {
	ROUTER_GESTURE_PRESS,
	ROUTER_GESTURE_RELEASE,
};

struct router_state {
	struct torabo_gesture gesture[ZMK_INPUT_LISTENERS_LEN];
	bool shared_latch;
	uint8_t layer;
	struct k_spinlock lock;
	struct k_work_delayable gesture_work;
	bool gesture_busy;
	enum router_gesture_phase gesture_phase;
	struct zmk_behavior_binding_event gesture_event;
	struct zmk_behavior_binding gesture_binding;
};
static struct router_state *router_states[DT_NUM_INST_STATUS_OKAY(DT_DRV_COMPAT)];


static bool router_layer_active(const struct router_config *cfg) {
	return zmk_keymap_layer_active(cfg->layer);
}

static void router_gesture_work(struct k_work *work) {
	struct k_work_delayable *dwork = k_work_delayable_from_work(work);
	struct router_state *state = CONTAINER_OF(dwork, struct router_state, gesture_work);
	struct zmk_behavior_binding_event event;
	struct zmk_behavior_binding binding;
	enum router_gesture_phase phase;
	k_spinlock_key_t key = k_spin_lock(&state->lock);
	if (!state->gesture_busy) {
		k_spin_unlock(&state->lock, key);
		return;
	}
	event = state->gesture_event;
	binding = state->gesture_binding;
	phase = state->gesture_phase;
	k_spin_unlock(&state->lock, key);

	event.timestamp = k_uptime_get();
	if (phase == ROUTER_GESTURE_PRESS) {
		int invoke = zmk_behavior_invoke_binding(&binding, event, true);
		if (invoke < 0) {
			LOG_ERR("gesture press invoke failed (%d)", invoke);
		}

		key = k_spin_lock(&state->lock);
		if (!state->gesture_busy) {
			k_spin_unlock(&state->lock, key);
			return;
		}
		state->gesture_phase = ROUTER_GESTURE_RELEASE;
		int reschedule = k_work_reschedule(&state->gesture_work, K_MSEC(30));
		if (reschedule < 0) {
			k_spin_unlock(&state->lock, key);
			LOG_ERR("failed to schedule gesture release (%d)", reschedule);
			event.timestamp = k_uptime_get();
			invoke = zmk_behavior_invoke_binding(&binding, event, false);
			if (invoke < 0) {
				LOG_ERR("gesture release invoke failed (%d)", invoke);
			}
			key = k_spin_lock(&state->lock);
			state->gesture_busy = false;
			k_spin_unlock(&state->lock, key);
			return;
		}
		k_spin_unlock(&state->lock, key);
		return;
	}

	int invoke = zmk_behavior_invoke_binding(&binding, event, false);
	if (invoke < 0) {
		LOG_ERR("gesture release invoke failed (%d)", invoke);
	}
	key = k_spin_lock(&state->lock);
	state->gesture_busy = false;
	k_spin_unlock(&state->lock, key);
}

static int router_handle(const struct device *dev, struct input_event *event,
			uint32_t param1, uint32_t param2,
			struct zmk_input_processor_state *input_state) {
	ARG_UNUSED(param1); ARG_UNUSED(param2);
	const struct router_config *cfg = dev->config;
	struct router_state *state = dev->data;
	uint8_t source = input_state ? input_state->input_device_index : 0;
	if (source >= ARRAY_SIZE(state->gesture) || !router_layer_active(cfg)) {
		return ZMK_INPUT_PROC_CONTINUE;
	}
	/* Every relative XY event is consumed while gesture mode is active. */
	if (event->type != INPUT_EV_REL || (event->code != INPUT_REL_X && event->code != INPUT_REL_Y)) {
		return ZMK_INPUT_PROC_CONTINUE;
	}
	int32_t dx = event->code == INPUT_REL_X ? event->value : 0;
	int32_t dy = event->code == INPUT_REL_Y ? event->value : 0;
	struct torabo_gesture_config gesture_cfg = {
		.deadzone = cfg->deadzone, .threshold = cfg->threshold,
		.dominance_percent = cfg->dominance,
	};
	k_spinlock_key_t key = k_spin_lock(&state->lock);
	enum torabo_gesture_direction direction = torabo_gesture_accumulate(
		&state->gesture[source], &gesture_cfg, dx, dy, event->sync, &state->shared_latch);
	k_spin_unlock(&state->lock, key);
	if (direction != TORABO_GESTURE_NONE) {
		int submit = 0;
		key = k_spin_lock(&state->lock);
		if (!state->gesture_busy) {
			state->gesture_event = (struct zmk_behavior_binding_event){
				.position = ZMK_VIRTUAL_KEY_POSITION_BEHAVIOR_INPUT_PROCESSOR(source, 0),
				.timestamp = k_uptime_get(),
#if IS_ENABLED(CONFIG_ZMK_SPLIT)
				.source = ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL,
#endif
			};
			state->gesture_binding = cfg->bindings[direction - TORABO_GESTURE_UP];
			state->gesture_busy = true;
			state->gesture_phase = ROUTER_GESTURE_PRESS;
			submit = k_work_reschedule(&state->gesture_work, K_NO_WAIT);
			if (submit < 0) {
				state->gesture_busy = false;
			}
		}
		k_spin_unlock(&state->lock, key);
		if (submit < 0) {
			LOG_ERR("failed to submit gesture work (%d)", submit);
		}
	}
	event->value = 0;
	return ZMK_INPUT_PROC_CONTINUE;
}

static int router_layer_changed(const zmk_event_t *event) {
	const struct zmk_layer_state_changed *changed = as_zmk_layer_state_changed(event);
	if (!changed) return ZMK_EV_EVENT_BUBBLE;
	for (size_t i = 0; i < ARRAY_SIZE(router_states); ++i) {
		if (router_states[i] && changed->layer == router_states[i]->layer) {
			k_spinlock_key_t key = k_spin_lock(&router_states[i]->lock);
			router_states[i]->shared_latch = false;
			for (size_t s = 0; s < ARRAY_SIZE(router_states[i]->gesture); ++s)
				torabo_gesture_reset(&router_states[i]->gesture[s]);
			k_spin_unlock(&router_states[i]->lock, key);
		}
	}
	return ZMK_EV_EVENT_BUBBLE;
}
ZMK_LISTENER(torabo_pointing_router, router_layer_changed);
ZMK_SUBSCRIPTION(torabo_pointing_router, zmk_layer_state_changed);

static const struct zmk_input_processor_driver_api router_api = {.handle_event = router_handle};

#define ROUTER_INST(n) \
	BUILD_ASSERT(DT_INST_PROP_LEN(n, bindings) == 4, "pointing router requires four bindings"); \
	BUILD_ASSERT(DT_INST_PROP(n, threshold) > 0 && DT_INST_PROP(n, threshold) <= INT16_MAX, "invalid threshold"); \
	BUILD_ASSERT(DT_INST_PROP(n, deadzone) >= 0 && DT_INST_PROP(n, deadzone) <= DT_INST_PROP(n, threshold), "invalid deadzone"); \
	BUILD_ASSERT(DT_INST_PROP(n, dominance_percent) >= 100 && DT_INST_PROP(n, dominance_percent) <= 255, "invalid dominance"); \
	BUILD_ASSERT(DT_INST_PROP(n, gesture_layer) < ZMK_KEYMAP_LAYERS_LEN, "invalid gesture layer"); \
	static const struct zmk_behavior_binding router_bindings_##n[] = { \
		LISTIFY(DT_INST_PROP_LEN(n, bindings), ZMK_KEYMAP_EXTRACT_BINDING, (, ), DT_DRV_INST(n))}; \
	static const struct router_config router_cfg_##n = { \
		.layer = DT_INST_PROP(n, gesture_layer), .threshold = DT_INST_PROP(n, threshold), \
		.deadzone = DT_INST_PROP(n, deadzone), .dominance = DT_INST_PROP(n, dominance_percent), \
		.bindings = router_bindings_##n}; \
	static struct router_state router_data_##n = {.layer = DT_INST_PROP(n, gesture_layer)}; \
	static int router_init_##n(const struct device *dev) { \
		struct router_state *state = dev->data; \
		k_work_init_delayable(&state->gesture_work, router_gesture_work); \
		router_states[n] = state; return 0; } \
	DEVICE_DT_INST_DEFINE(n, router_init_##n, NULL, &router_data_##n, &router_cfg_##n, POST_KERNEL, \
		CONFIG_KERNEL_INIT_PRIORITY_DEFAULT, &router_api);
DT_INST_FOREACH_STATUS_OKAY(ROUTER_INST)

#endif

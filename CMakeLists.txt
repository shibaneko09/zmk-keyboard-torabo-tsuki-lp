if(CONFIG_SHIELD_TORABO_TSUKI_LP_LEFT OR CONFIG_SHIELD_TORABO_TSUKI_LP_RIGHT)
  zephyr_library()
  zephyr_include_directories(${APPLICATION_SOURCE_DIR}/include)
  zephyr_library_sources(src/board.c src/mini_trackpad_init_reg.c)
endif()

if(CONFIG_TORABO_POINTING_SETTINGS_RPC)
  target_sources(app PRIVATE src/pointing_settings_rpc.c)
endif()

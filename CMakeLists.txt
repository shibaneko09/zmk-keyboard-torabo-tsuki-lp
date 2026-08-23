if(CONFIG_SHIELD_TORABO_TSUKI_LP_LEFT OR CONFIG_SHIELD_TORABO_TSUKI_LP_RIGHT)
  target_include_directories(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_sources(app PRIVATE src/board.c src/mini_trackpad_init_reg.c src/pointing_settings.c
                            src/pointing_router.c src/pointing_gesture.c src/pointing_core.c)
endif()

if(CONFIG_TORABO_POINTING_SETTINGS_RPC)
  target_include_directories(app PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
  target_sources(app PRIVATE src/pointing_settings_rpc.c)
endif()

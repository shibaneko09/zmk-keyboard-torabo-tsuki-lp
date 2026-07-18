if(CONFIG_SHIELD_TORABO_TSUKI_LP_LEFT OR CONFIG_SHIELD_TORABO_TSUKI_LP_RIGHT)
  zephyr_library()
  zephyr_include_directories(${APPLICATION_SOURCE_DIR}/include)
  zephyr_library_sources(src/board.c src/mini_trackpad_init_reg.c)
endif()

if(CONFIG_TORABO_POINTING_SETTINGS_RPC)
  list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
  include(nanopb)
  set(NANOPB_GENERATE_CPP_STANDALONE OFF)

  nanopb_generate_cpp(pointing_proto_srcs pointing_proto_hdrs
    RELPATH ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/proto/zmk/pointing.proto
  )

  target_include_directories(app PUBLIC ${CMAKE_CURRENT_BINARY_DIR})
  target_sources(app PRIVATE
    ${pointing_proto_srcs}
    ${pointing_proto_hdrs}
    src/pointing_settings_rpc.c
  )
endif()

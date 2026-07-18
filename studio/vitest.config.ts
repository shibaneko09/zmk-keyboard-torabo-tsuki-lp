import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "protobufjs/minimal": "protobufjs/minimal.js",
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    server: {
      deps: {
        inline: ["@zmkfirmware/zmk-studio-ts-client"],
      },
    },
  },
});

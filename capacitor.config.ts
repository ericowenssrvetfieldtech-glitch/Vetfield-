import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vetfield.smartcart",
  appName: "VetField SmartCart",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    backgroundColor: "#050E1A",
  },
  ios: {
    backgroundColor: "#050E1A",
    contentInset: "always",
  },
};

export default config;

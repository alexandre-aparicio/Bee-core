const path = require("node:path");

const federationConfigPath = require.resolve("@angular-architects/native-federation/config", {
  paths: [path.resolve(__dirname, "../../../apps/web")]
});
const { withNativeFederation, shareAll } = require(federationConfigPath);

module.exports = withNativeFederation({
  name: "connectedDevices",
  exposes: {
    "./Component": "../../plugins/connected-devices/frontend/src/plugin.component.ts"
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: "auto" })
  },
  skip: [
    "rxjs/ajax",
    "rxjs/fetch",
    "rxjs/testing",
    "rxjs/webSocket"
  ]
});

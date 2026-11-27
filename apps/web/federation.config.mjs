import {
  withNativeFederation,
  shareAll
} from "@angular-architects/native-federation/config";

const angularShared = {
  singleton: true,
  strictVersion: true,
  requiredVersion: "auto",
  includeSecondaries: { keepAll: true }
};

export default withNativeFederation({
  name: "bee-core-host",
  shared: {
    ...shareAll(
      {
        singleton: true,
        strictVersion: true,
        requiredVersion: "auto"
      },
      {
        overrides: {
          "@angular/common": angularShared,
          "@angular/core": angularShared,
          "@angular/forms": angularShared,
          "@angular/platform-browser": angularShared
        }
      }
    )
  },
  skip: [
    "rxjs/ajax",
    "rxjs/fetch",
    "rxjs/testing",
    "rxjs/webSocket"
  ],
  features: {
    denseChunking: true,
    denseExternals: true
  }
});

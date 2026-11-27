import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const hostRequire = createRequire(
  new URL("../../../apps/web/package.json", import.meta.url)
);

const federationConfigUrl = pathToFileURL(
  hostRequire.resolve("@angular-architects/native-federation/config")
);

const {
  withNativeFederation,
  shareAll
} = await import(federationConfigUrl.href);

const angularShared = {
  singleton: true,
  strictVersion: true,
  requiredVersion: "auto",
  includeSecondaries: { keepAll: true }
};

const allShared = shareAll(
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
);

// Control Horario no utiliza CDK. Evitamos incluir también schematics,
// que arrastra módulos exclusivos de Node.js al bundle de navegador.
const sharedDependencies = Object.fromEntries(
  Object.entries(allShared).filter(
    ([name]) => !name.startsWith("@angular/cdk")
  )
);

export default withNativeFederation({
  name: "timeTracking",
  exposes: {
    "./Component": "../../plugins/time-tracking/frontend/src/plugin.component.ts"
  },
  shared: sharedDependencies,
  skip: [
    "rxjs/ajax",
    "rxjs/fetch",
    "rxjs/testing",
    "rxjs/webSocket"
  ],
  features: {
    ignoreUnusedDeps: false,
    denseChunking: true,
    denseExternals: true
  }
});

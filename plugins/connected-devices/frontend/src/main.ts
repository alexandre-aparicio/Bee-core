import { initFederation } from "@angular-architects/native-federation";

initFederation({})
  .then(() => import("./bootstrap"))
  .catch(error =>
    console.error(
      "Connected Devices remote federation initialisation failed",
      error
    )
  );

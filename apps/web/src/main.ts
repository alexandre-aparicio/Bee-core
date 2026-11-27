// Keep the federation bootstrap compatible with the classic script tag emitted by
// the Native Federation builder. Dynamic import() is valid in classic scripts;
// a static import would fail before the application can initialise.
void import("@angular-architects/native-federation")
  .then(({ initFederation }) => initFederation({}))
  .then(() => import("./bootstrap"))
  .catch(error => console.error("Bee Core federation initialisation failed", error));

# Control Horario: backend package and VPS signing

Control Horario is an independently installable business plugin. It depends on the Core runtime services `auth` and `organizations`; it does not depend on Files or Marketplace. Its tenant-owned sessions, schedules, corrections and membership reads are isolated through the plugin repository.

## VPS package publication

Package creation remains a local VPS operation. GitHub Actions is not part of package publication or signing.

Run the existing npm command from the Bee-Core checkout after dependencies are installed:

```bash
npm run build:plugin-packages
```

The process requires these environment variables to be supplied by the VPS secret/environment configuration:

- `BEE_PLUGIN_PUBLISHER_PRIVATE_KEY`: Ed25519 PKCS#8 PEM private key. Used only to sign.
- `BEE_PLUGIN_PUBLISHER_PUBLIC_KEY`: matching Ed25519 SPKI PEM public key. Used to validate the key pair and verify the signature immediately after signing.

The publisher refuses to generate packages when either key is absent, malformed, not Ed25519, or does not match the other. Each signature is verified before the ZIP is written. The public and private key material are not package assets and must never be copied into a ZIP or committed to the repository. Bee-Core installation/startup continues to verify the signature with the public key configured on the server.

## Control Horario package contents

The `time-tracking-0.2.0.zip` package includes:

- The compiled backend entrypoint and its complete relative-import module graph.
- The exact `src/plugins/time-tracking/frontend/index.html` and `main.js` files, copied into `frontend/` without rewriting.
- The signed `bee-plugin.json`, including `auth` and `organizations` dependencies, `/time-tracking` API prefix and install migration declaration.
- A README.

The package test installs the generated ZIP through the same signed ZIP installer used by Bee-Core, checks the runtime export and migration metadata, compares the packaged frontend byte-for-byte with its source files, and rejects a mismatched publisher key pair. It also checks the existing frontend flows: clock-in/out, breaks, current status, history, corrections, personal/team schedules and team correction review.

## Verification boundary

Repository tests and CI can validate package construction logic using ephemeral test keys. They cannot prove that the VPS secrets are configured correctly or that a ZIP has actually been produced and installed on the VPS. That final check must be performed on the VPS without printing either key.

# Template core

The core owns lifecycle, registry, tenant selection, shared Light/Dark behavior and plugin-slot integration. It does not own a template's layout or palette. Each package imports the shared appearance contract while maintaining its own layout component, CSS, tokens and assets.

Template packages are trusted Angular components compiled with the application. Server-side installation controls availability for a tenant; it does not dynamically execute uploaded code.

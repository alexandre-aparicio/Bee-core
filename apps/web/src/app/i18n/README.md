# Bee-Core internationalization

Bee-Core uses a namespace-based translation engine. Translation catalogs are independent of components and are resolved by the active language with English as the final fallback.

## Language resolution

1. A saved user language preference (`users.locale`) wins.
2. Otherwise, the active company's default (`tenants.settings.defaultLanguage`) is used.
3. If neither is configured, English (`en`) is used.

The first supported language packs are English (`en`) and Spanish (`es`). Team owners and administrators can change the company default in **Settings → Localization**. Every user can choose a personal language or select **Use team default**.

## Module catalogs

Each module owns a separate catalog in `catalogs/modules/<module>.catalog.ts`. Export an English and Spanish dictionary. The namespace must match the module/plugin ID.

For a frontend plugin registered in `BeePluginFrontendRegistry`, attach its packs to the registration:

```ts
translations: { en: MODULE_EN, es: MODULE_ES }
```

The plugin outlet registers those catalogs when the installed module is mounted. The installed-module list controls which namespaces are active, so an installed module becomes translatable without changing the core engine.

Use the standalone `beeT` pipe in templates:

```html
<h2>{{ 'notes:title' | beeT }}</h2>
```

Or inject `BeeI18nService` and call `t('notes:title')` from TypeScript. Core keys use the `core` namespace; settings keys use `settings:key`.

Missing keys fall back to English, then to the key itself. Catalogs should use stable semantic keys rather than translated text as identifiers.
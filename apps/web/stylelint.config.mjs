/**
 * CSS guardrails for application stylesheets and the shared template foundation.
 * Inline Angular component styles remain covered by audit:styles and the
 * template-token checker; Stylelint scans standalone application CSS files and the global stylesheet.
 */
export default {
  rules: {
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "declaration-no-important": true,
    "function-no-unknown": true,
    "property-no-unknown": true
  }
};

/**
 * CSS guardrails for the six template packages and shared template foundation.
 * Inline Angular component styles remain covered by audit:styles and the
 * template-token checker; Stylelint scans standalone template CSS files.
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

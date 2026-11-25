/**
 * CSS guardrails for standalone application stylesheets.
 * Inline Angular styles and templates are covered by audit-styles --strict.
 */
const namedColors = /\\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\\b/i;
export default {
  rules: {
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "color-no-hex": true,
    "declaration-no-important": true,
    "declaration-property-value-disallowed-list": {
      "/^(?:color|background(?:-color)?|border(?:-[a-z-]+)?-color|outline(?:-color)?|text-decoration-color|fill|stroke|caret-color)$/i": [namedColors]
    },
    "function-disallowed-list": ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
    "function-no-unknown": true,
    "property-no-unknown": true
  },
  overrides: [{
    files: ["src/app/templates/packages/*/tokens.css", "src/app/templates/base/tokens.contract.css", "src/assets/device-simulator/**/*.css"],
    rules: {
      "color-no-hex": null,
      "declaration-property-value-disallowed-list": null,
      "function-disallowed-list": null
    }
  }]
};

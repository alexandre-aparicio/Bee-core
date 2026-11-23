/** Pure validation/normalization rules owned by the Documents module. */
export const MAX_FOLDER_DEPTH=32;
export const sanitizeText=(value:unknown,max=160):string=>typeof value==="string"?value.trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max):"";
export const isValidPublicId=(value:unknown):string=>typeof value==="string"&&/^[A-Za-z0-9_-]{40,100}$/.test(value)?value:"";
export const normalizeTags=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.map((item:unknown)=>sanitizeText(item,40)).filter(Boolean))].slice(0,20):[];

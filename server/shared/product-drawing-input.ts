// Shared by the upload form and API; allow readable drawing labels, never controls or path separators.
export const DRAWING_NUMBER_PATTERN = /^[\p{L}\p{N} ._()（）·-]{1,100}$/u;

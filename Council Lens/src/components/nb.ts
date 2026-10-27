/** Joins a formatted date with no-break spaces, so "October 7, 2026" never splits across lines. */
export const nb = (text: string): string => text.replace(/ /g, '\u00a0');

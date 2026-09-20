/**
 * Prefix for anything served out of public/.
 *
 * Next applies basePath to its own routes and to /_next assets, but a literal
 * "/media/leaf.webp" in a src attribute or a fetch() is just a string and it
 * would resolve against the domain root. On GitHub Pages that is a 404, so
 * every such path goes through here.
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const asset = (path: string) => `${BASE}${path}`;

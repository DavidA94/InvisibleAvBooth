/**
 * Username as shown in the title bar: first letter capitalized, the rest as stored
 * (livestream-control-system spec Req 5c.6). Display only; never send this back to the server.
 *
 * JavaScript rather than CSS `text-transform: capitalize`, which capitalizes every word and treats
 * hyphens differently across browsers ("test-volunteer" must read "Test-volunteer").
 */
export function capitalizeFirst(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// A label that agrees with its number: plural(1, "City", "Cities") is "City",
// plural(2, "City", "Cities") is "Cities". The plural defaults to adding "s".
// English only, like the rest of the app's copy.
export function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many;
}

// The number and its label: count(1, "show") is "1 show".
export function count(n: number, one: string, many?: string) {
  return `${n} ${plural(n, one, many)}`;
}

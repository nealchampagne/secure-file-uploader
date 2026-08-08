const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

/**
 * Sorts an array of objects with a `name` property using natural order.
 * @param {Array<{ name: string }>} items
 * @returns {Array<{ name: string }>}
 */
const naturalSortByName = (items) => {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

module.exports = { naturalSortByName };
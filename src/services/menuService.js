const config = require('../config');
const { menuRepo, tableRepo } = require('../data/repositories');
const { toMenuItemDto } = require('../models');

async function getMenu() {
  const [categories, items, tables] = await Promise.all([menuRepo.listCategories(), menuRepo.listAvailableItems(), tableRepo.list()]);
  return {
    restaurant: { name: config.restaurant.name, tagline: 'Mediterranean kitchen (demo restaurant)', taxRate: config.restaurant.taxRate },
    tables: tables.map(t => t.number),
    categories, items: items.map(toMenuItemDto),
  };
}

module.exports = { getMenu };

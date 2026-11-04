// Idempotent seed: sample (fictional) restaurant menu and 12 tables. Safe to run repeatedly.
const db = require('./db');

const CATEGORIES = [['starters', 'Starters'], ['mains', 'Mains'], ['pizza', 'Flatbreads'], ['desserts', 'Desserts'], ['drinks', 'Drinks']];

const g = (name, type, required, choices) => ({ name, type, required, choices: choices.map(([n, cents]) => ({ n, cents })) });
// [id, category, name, description, price_cents, emoji, hue, tags, options]
const ITEMS = [
  ['s1', 'starters', 'Whipped Feta & Honey', 'Warm pita, thyme, chili honey drizzle.', 950, '🧆', 38, ['V']],
  ['s2', 'starters', 'Charred Octopus', 'Smoked paprika, lemon potatoes, salsa verde.', 1500, '🐙', 12, ['GF']],
  ['s3', 'starters', 'Roasted Beet Salad', 'Goat cheese, pistachio, orange vinaigrette.', 1100, '🥗', 330, ['V', 'GF']],
  ['m1', 'mains', 'Lamb Kofta Plate', 'Grilled skewers, saffron rice, tzatziki.', 2100, '🍢', 20, [], [g('Spice level', 'single', true, [['Mild', 0], ['Medium', 0], ['Hot', 0]])]],
  ['m2', 'mains', 'Herb-Crusted Salmon', 'Fennel puree, charred broccolini, caper butter.', 2400, '🐟', 190, ['GF']],
  ['m3', 'mains', 'Wild Mushroom Risotto', 'Arborio, parmesan, truffle oil.', 1800, '🍄', 90, ['V'], [g('Add-ons', 'multi', false, [['Grilled chicken', 500], ['Extra parmesan', 150]])]],
  ['m4', 'mains', 'Ember Burger', 'Dry-aged beef, caramelized onion, aioli, fries.', 1900, '🍔', 28, [],
    [g('Doneness', 'single', true, [['Medium rare', 0], ['Medium', 0], ['Well done', 0]]), g('Add-ons', 'multi', false, [['Bacon', 250], ['Cheddar', 150], ['Fried egg', 150]])]],
  ['p1', 'pizza', 'Margherita Flatbread', 'San Marzano tomato, mozzarella, basil.', 1400, '🍕', 8, ['V']],
  ['p2', 'pizza', 'Spicy Soppressata', 'Calabrian chili, hot honey, fior di latte.', 1650, '🌶️', 0, []],
  ['p3', 'pizza', 'Zucchini & Ricotta', 'Lemon zest, mint, toasted almonds.', 1500, '🥒', 120, ['V']],
  ['d1', 'desserts', 'Baklava Cheesecake', 'Phyllo crumble, pistachio, rose syrup.', 900, '🍰', 45, ['V']],
  ['d2', 'desserts', 'Dark Chocolate Pot', 'Olive oil, sea salt, whipped cream.', 800, '🍫', 25, ['V', 'GF']],
  ['k1', 'drinks', 'Fresh Mint Lemonade', 'House-pressed, lightly sweet.', 500, '🍋', 70, ['V', 'GF'], [g('Size', 'single', true, [['Regular', 0], ['Large', 150]])]],
  ['k2', 'drinks', 'Turkish Coffee', 'Cardamom, served with a sweet.', 400, '☕', 30, ['V']],
  ['k3', 'drinks', 'Sparkling Water', '750 ml bottle.', 450, '🫧', 200, ['V', 'GF']],
];

async function seed(log = console.log) {
  await db.withTransaction(async c => {
    for (const [i, [id, name]] of CATEGORIES.entries())
      await c.query(`INSERT INTO categories (id, name, sort_order) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order`, [id, name, i]);
    for (const [i, [id, cat, name, desc, cents, emoji, hue, tags, options]] of ITEMS.entries())
      await c.query(
        `INSERT INTO menu_items (id, category_id, name, description, price_cents, emoji, hue, tags, options, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET category_id=$2, name=$3, description=$4, price_cents=$5, emoji=$6, hue=$7, tags=$8, options=$9, sort_order=$10`,
        [id, cat, name, desc, cents, emoji, hue, tags, JSON.stringify(options || []), i]);
    for (let n = 1; n <= 12; n++) await c.query('INSERT INTO restaurant_tables (number) VALUES ($1) ON CONFLICT (number) DO NOTHING', [n]);
  });
  log(`[seed] ${CATEGORIES.length} categories, ${ITEMS.length} menu items, 12 tables`);
}

module.exports = { seed };

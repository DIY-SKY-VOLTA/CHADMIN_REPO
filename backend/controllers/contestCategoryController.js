/**
 * Contest Category Controller (admin-dashboard)
 * Direct-DB admin CRUD for the ContestCategory collection — mirrors the main
 * backend module (Phase2/backend/src/modules/contests/contestCategory.controller.js).
 *
 * DELETE is a soft "archive" (isActive: false): contests keep their category
 * string and old filter links stay valid; the category just drops out of the
 * public filter. Re-activate via the edit drawer.
 */

const ContestCategory = require('../models/ContestCategory');
const Contest = require('../models/Contests');

// CH Taxonomy v2 (2026-09) — matches Phase2 backend tagNormalizer CANONICAL_CATEGORY_LIST.
// Seeds only run when the collection is EMPTY; existing rows (with frozen slugs) are untouched.
const DEFAULT_CATEGORIES = [
  { name: 'Creative Arts & Design', color: '#ec4899', description: 'Visual arts, graphic design, UI/UX, photography, animation, fashion, architecture', sortOrder: 0 },
  { name: 'AI & Technology', color: '#8b5cf6', description: 'Software, AI, computing, data, cybersecurity, digital technologies', sortOrder: 1 },
  { name: 'Engineering & Innovation', color: '#94a3b8', description: 'Physical systems, hardware, robotics, aerospace, vehicles, prototypes, deep-tech', sortOrder: 2, isActive: false },
  { name: 'Science & Research', color: '#06b6d4', description: 'Scientific discovery, experiments, biology, chemistry, physics, medical/scientific research', sortOrder: 3 },
  { name: 'Business & Entrepreneurship', color: '#f59e0b', description: 'Startups, business strategy, finance, marketing, consulting, product/business challenges', sortOrder: 4 },
  { name: 'Writing & Media', color: '#f97316', description: 'Writing, journalism, literature, storytelling, filmmaking, podcasting, content and media', sortOrder: 5 },
  { name: 'Environment & Sustainability', color: '#22c55e', description: 'Climate, conservation, waste, water, renewable energy, agriculture sustainability, biodiversity', sortOrder: 6 },
  { name: 'Education & Learning', color: '#3b82f6', description: 'Education, teaching, EdTech, academic competitions, Olympiads, skill development', sortOrder: 7 },
  { name: 'Social Impact & Leadership', color: '#14b8a6', description: 'Community problems, social innovation, leadership, inclusion, civic engagement, governance', sortOrder: 8 },
  { name: 'Open & Multidisciplinary', color: '#78716c', description: 'Open-subject, cross-domain and unclassifiable-primary-activity contests (honest fallback)', sortOrder: 9 },
];

const seedDefaults = async () => {
  const count = await ContestCategory.countDocuments();
  if (count === 0) {
    await ContestCategory.insertMany(
      DEFAULT_CATEGORIES.map((c) => ({ ...c, slug: ContestCategory.slugifyCategory(c.name) }))
    );
  }
};

exports.adminListCategories = async (req, res) => {
  try {
    await seedDefaults();
    const categories = await ContestCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
    const enriched = await Promise.all(
      categories.map(async (cat) => ({
        ...cat,
        contestCount: await Contest.countDocuments({ category: cat.name, archivedAt: null }),
      }))
    );
    res.json({ success: true, categories: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, color, sortOrder, subcategories } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Category name is required' });

    const slug = ContestCategory.slugifyCategory(name);

    const existing = await ContestCategory.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { slug },
      ],
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.name.toLowerCase() === name.toLowerCase()
          ? `Category "${name}" already exists`
          : `Category slug "${slug}" already exists`,
      });
    }

    const maxOrder = await ContestCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    const category = await ContestCategory.create({
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      color: color || '#78716c',
      sortOrder: sortOrder ?? (maxOrder ? maxOrder.sortOrder + 1 : DEFAULT_CATEGORIES.length),
      subcategories: Array.isArray(subcategories) ? subcategories.map((s) => String(s).trim()).filter(Boolean) : [],
    });

    res.status(201).json({ success: true, category, message: `Category "${category.name}" created` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, sortOrder, isActive, subcategories } = req.body;

    const category = await ContestCategory.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (name?.trim() && name.trim() !== category.name) {
      const newName = name.trim();
      const slug = ContestCategory.slugifyCategory(newName);
      const duplicate = await ContestCategory.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { slug },
        ],
      });
      if (duplicate) return res.status(400).json({ success: false, message: `Category name "${newName}" already taken` });

      const inUse = await Contest.countDocuments({ category: category.name, archivedAt: null });
      if (inUse > 0) {
        return res.status(400).json({
          success: false,
          message:
            `Cannot rename "${category.name}" — ${inUse} live contest(s) still use it. ` +
            'Reclassify them first, or keep the name and only edit description/color/order.',
        });
      }
      category.name = newName;
      category.slug = slug;
    }

    if (description !== undefined) category.description = description.trim();
    if (color !== undefined) category.color = color;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;
    if (subcategories !== undefined) {
      category.subcategories = Array.isArray(subcategories)
        ? subcategories.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }

    await category.save();
    res.json({ success: true, category, message: `Category "${category.name}" updated` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Soft archive — contests keep their string, category hides from the public filter.
exports.archiveCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await ContestCategory.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    category.isActive = false;
    await category.save();
    res.json({ success: true, category, message: `Category "${category.name}" archived` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reorderCategories = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ success: false, message: 'order array is required' });
    }

    const operations = order.map((item, index) => ({
      updateOne: {
        filter: { _id: item._id || item.id },
        update: { $set: { sortOrder: index } },
      },
    }));

    await ContestCategory.bulkWrite(operations);
    const categories = await ContestCategory.find().sort({ sortOrder: 1 }).lean();
    res.json({ success: true, categories, message: 'Categories reordered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

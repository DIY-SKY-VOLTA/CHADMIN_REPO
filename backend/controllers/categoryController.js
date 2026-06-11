const BlogCategory = require('../models/BlogCategory');
const BlogSubmission = require('../models/BlogSubmission');

const DEFAULT_CATEGORIES = [
  { name: 'Engineering', slug: 'engineering', description: 'Software engineering, architecture, and technical deep-dives', color: '#6366f1', sortOrder: 0 },
  { name: 'Product', slug: 'product', description: 'Product strategy, roadmaps, and management', color: '#10b981', sortOrder: 1 },
  { name: 'Career', slug: 'career', description: 'Career growth, job search, and professional development', color: '#f59e0b', sortOrder: 2 },
  { name: 'Design', slug: 'design', description: 'UI/UX design, design systems, and creative process', color: '#ec4899', sortOrder: 3 },
];

const seedDefaults = async () => {
  const count = await BlogCategory.countDocuments();
  if (count === 0) {
    await BlogCategory.insertMany(DEFAULT_CATEGORIES);
  }
};

exports.listCategories = async (req, res) => {
  try {
    await seedDefaults();
    const categories = await BlogCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.adminListCategories = async (req, res) => {
  try {
    await seedDefaults();
    const categories = await BlogCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
    const enriched = await Promise.all(categories.map(async (cat) => {
      const postCount = await BlogSubmission.countDocuments({ category: cat.name, status: { $ne: 'draft' } });
      return { ...cat, postCount };
    }));
    res.json({ success: true, categories: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, color, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Category name is required' });

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const existing = await BlogCategory.findOne({
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

    const maxOrder = await BlogCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    const category = await BlogCategory.create({
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      color: color || '#6366f1',
      sortOrder: sortOrder ?? (maxOrder ? maxOrder.sortOrder + 1 : DEFAULT_CATEGORIES.length),
    });

    res.status(201).json({ success: true, category, message: `Category "${category.name}" created` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, sortOrder, isActive } = req.body;

    const category = await BlogCategory.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (name?.trim() && name.trim() !== category.name) {
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const duplicate = await BlogCategory.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { slug },
        ],
      });
      if (duplicate) return res.status(400).json({ success: false, message: `Category name "${name}" already taken` });
      category.name = name.trim();
      category.slug = slug;
    }

    if (description !== undefined) category.description = description.trim();
    if (color !== undefined) category.color = color;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json({ success: true, category, message: `Category "${category.name}" updated` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await BlogCategory.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const postCount = await BlogSubmission.countDocuments({ category: category.name });
    if (postCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${category.name}" — ${postCount} blog post(s) use this category. Reassign them first.`,
      });
    }

    await BlogCategory.deleteOne({ _id: id });
    res.json({ success: true, message: `Category "${category.name}" deleted` });
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

    await BlogCategory.bulkWrite(operations);
    const categories = await BlogCategory.find().sort({ sortOrder: 1 }).lean();
    res.json({ success: true, categories, message: 'Categories reordered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

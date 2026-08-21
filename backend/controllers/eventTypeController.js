/**
 * Event Type Controller (admin-dashboard)
 * Direct-DB admin CRUD for the EventType collection — mirrors the main backend
 * module (Phase2/backend/src/modules/events/eventType.controller.js).
 *
 * DELETE is a soft "archive" (isActive: false).
 */

const EventType = require('../models/EventType');
const Event = require('../models/Event');

// Same 11 types as the main backend (events-v1.1 prompt enum).
const DEFAULT_TYPES = [
  { name: 'Conference', color: '#3b82f6', description: 'Large multi-day professional gathering with talks, panels, and networking', sortOrder: 0 },
  { name: 'Summit', color: '#8b5cf6', description: 'High-level gathering focused on a theme or industry, often with keynotes', sortOrder: 1 },
  { name: 'Workshop', color: '#06b6d4', description: 'Hands-on, interactive session where attendees learn by doing', sortOrder: 2 },
  { name: 'Webinar', color: '#0ea5e9', description: 'Online seminar delivered live to a remote audience', sortOrder: 3 },
  { name: 'Meetup', color: '#f59e0b', description: 'Casual, community-driven local gathering around a shared interest', sortOrder: 4 },
  { name: 'Expo', color: '#f97316', description: 'Exhibition where organizations showcase products, services, and innovations', sortOrder: 5 },
  { name: 'Trade Show', color: '#ef4444', description: 'Industry exhibition for businesses to display products and network', sortOrder: 6 },
  { name: 'Career Fair', color: '#14b8a6', description: 'Event connecting job seekers with employers and recruiters', sortOrder: 7 },
  { name: 'Networking Event', color: '#ec4899', description: 'Social event designed for making professional connections', sortOrder: 8 },
  { name: 'Training Program', color: '#22c55e', description: 'Structured multi-session learning program with a curriculum', sortOrder: 9 },
  { name: 'Festival', color: '#e11d48', description: 'Celebration featuring performances, culture, food, or media', sortOrder: 10 },
];

const seedDefaults = async () => {
  const count = await EventType.countDocuments();
  if (count === 0) {
    await EventType.insertMany(
      DEFAULT_TYPES.map((t) => ({ ...t, slug: EventType.slugifyEventType(t.name) }))
    );
  }
};

exports.adminListTypes = async (req, res) => {
  try {
    await seedDefaults();
    const types = await EventType.find().sort({ sortOrder: 1, name: 1 }).lean();
    const enriched = await Promise.all(
      types.map(async (t) => ({
        ...t,
        eventCount: await Event.countDocuments({ eventType: t.slug, archivedAt: null }),
      }))
    );
    res.json({ success: true, types: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createType = async (req, res) => {
  try {
    const { name, description, color, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Event type name is required' });

    const slug = EventType.slugifyEventType(name);

    const existing = await EventType.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { slug },
      ],
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.name.toLowerCase() === name.toLowerCase()
          ? `Event type "${name}" already exists`
          : `Event type slug "${slug}" already exists`,
      });
    }

    const maxOrder = await EventType.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    const type = await EventType.create({
      name: name.trim(),
      slug,
      description: description?.trim() || '',
      color: color || '#3b82f6',
      sortOrder: sortOrder ?? (maxOrder ? maxOrder.sortOrder + 1 : DEFAULT_TYPES.length),
    });

    res.status(201).json({ success: true, type, message: `Event type "${type.name}" created` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, sortOrder, isActive } = req.body;

    const type = await EventType.findById(id);
    if (!type) return res.status(404).json({ success: false, message: 'Event type not found' });

    if (name?.trim() && name.trim() !== type.name) {
      const newName = name.trim();
      const slug = EventType.slugifyEventType(newName);
      const duplicate = await EventType.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { slug },
        ],
      });
      if (duplicate) return res.status(400).json({ success: false, message: `Event type name "${newName}" already taken` });

      const inUse = await Event.countDocuments({ eventType: type.slug, archivedAt: null });
      if (inUse > 0) {
        return res.status(400).json({
          success: false,
          message:
            `Cannot rename "${type.name}" — ${inUse} live event(s) still use it. ` +
            'Reclassify them first, or keep the name and only edit description/color/order.',
        });
      }
      type.name = newName;
      type.slug = slug;
    }

    if (description !== undefined) type.description = description.trim();
    if (color !== undefined) type.color = color;
    if (sortOrder !== undefined) type.sortOrder = sortOrder;
    if (isActive !== undefined) type.isActive = isActive;

    await type.save();
    res.json({ success: true, type, message: `Event type "${type.name}" updated` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.archiveType = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await EventType.findById(id);
    if (!type) return res.status(404).json({ success: false, message: 'Event type not found' });

    type.isActive = false;
    await type.save();
    res.json({ success: true, type, message: `Event type "${type.name}" archived` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.reorderTypes = async (req, res) => {
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

    await EventType.bulkWrite(operations);
    const types = await EventType.find().sort({ sortOrder: 1 }).lean();
    res.json({ success: true, types, message: 'Event types reordered' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

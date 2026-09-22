const BlogSubmission = require('../models/BlogSubmission');
const { deleteSanityPost, updateSanityPost, getAllSanityPosts } = require('../utils/sanityPublisher');
const { logAction } = require('./activityLogController');

exports.listPublished = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim().toLowerCase();

    // 1. Fetch approved local submissions (DB only & DB+Sanity)
    const dbSubmissions = await BlogSubmission.find({ status: 'approved' }).lean();

    // 2. Fetch all posts from Sanity CMS directly
    const sanityPostsRaw = await getAllSanityPosts();

    // 3. Map Sanity posts to match the frontend's expected BlogSubmission shape
    const mappedSanityPosts = sanityPostsRaw.map(sp => ({
      _id: sp._id, // use sanity id as pseudo-id for frontend keys
      title: sp.title || 'Untitled',
      slug: sp.slug || sp._id,
      excerpt: sp.excerpt || '',
      coverImage: sp.coverImage || '',
      category: 'Blog',
      tags: sp.tags || [],
      status: 'approved',
      // Sanity posts carry the author as a plain string (see getAllSanityPosts);
      // an honest unknown beats inventing an author.
      author: { name: sp.authorName || 'Unknown Author' },
      sanityId: sp._id,
      sanityUrl: `https://${process.env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${process.env.SANITY_DATASET}?query=*[_id=='${sp._id}'][0]`,
      readTime: sp.readTime || '5 min read',
      updatedAt: sp._updatedAt || sp.publishedAt || new Date().toISOString(),
      createdAt: sp._createdAt || sp.publishedAt || new Date().toISOString(),
    }));

    // 4. Merge and Deduplicate
    // We favor the local DB version if it exists because it has more metadata (like Author info)
    const dbSanityIds = new Set(dbSubmissions.filter(s => s.sanityId).map(s => String(s.sanityId)));
    
    // Get posts that exist ONLY in Sanity (created outside the admin dashboard)
    const sanityOnlyPosts = mappedSanityPosts.filter(sp => !dbSanityIds.has(String(sp.sanityId)));

    // Combine them
    let combined = [...dbSubmissions, ...sanityOnlyPosts];

    // 5. Apply Search filter locally in memory
    if (search) {
      combined = combined.filter(item => 
        (item.title && item.title.toLowerCase().includes(search)) || 
        (item.author?.name && item.author.name.toLowerCase().includes(search))
      );
    }

    // 6. Sort by updatedAt descending
    combined.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // 7. Paginate
    const total = combined.length;
    const paginatedSubmissions = combined.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      submissions: paginatedSubmissions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePublished = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if it's a Sanity-only post (pseudo-id)
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a sanity-only post edit (like 'drafts.abc' or 'd234-...')
      // We can only update it in Sanity
      const updated = await updateSanityPost(id, updateData);
      return res.json({ success: true, message: 'Sanity-only blog updated', submission: updated });
    }

    // Regular DB update
    const blog = await BlogSubmission.findByIdAndUpdate(id, {
      ...updateData,
      lastEditedBy: req.admin.id,
      lastEditedAt: new Date(),
    }, { new: true });

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Update Sanity if sanityId exists
    if (blog.sanityId) {
      try {
        await updateSanityPost(blog.sanityId, blog);
      } catch (sanityErr) {
        console.error(`Failed to update Sanity: ${sanityErr.message}`);
      }
    }

    res.json({ success: true, message: 'Published blog updated', submission: blog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.unpublishFromSanity = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's a Sanity-only post (pseudo-id)
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      await deleteSanityPost(id);
      return res.json({ success: true, message: 'Deleted Sanity-only blog' });
    }

    const blog = await BlogSubmission.findById(id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
    if (!blog.sanityId) return res.status(400).json({ success: false, message: 'Blog is not published to Sanity' });

    await deleteSanityPost(blog.sanityId);

    blog.sanityId = null;
    blog.sanityUrl = null;
    blog.status = 'pending';
    await blog.save();

    // Log activity
    logAction({
      adminId: req.admin.id,
      adminName: req.admin.username || req.admin.id,
      action: 'unpublish_blog',
      description: `Unpublished blog from Sanity: "${blog.title}"`,
      targetId: id,
      targetType: 'blog',
    });

    res.json({ success: true, message: 'Unpublished from Sanity and moved to pending' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublishedStats = async (req, res) => {
  try {
    // Merge stats logic
    const dbSubmissions = await BlogSubmission.find({ status: 'approved' }).lean();
    const sanityPostsRaw = await getAllSanityPosts();
    
    const dbSanityIds = new Set(dbSubmissions.filter(s => s.sanityId).map(s => String(s.sanityId)));
    const sanityOnlyPosts = sanityPostsRaw.filter(sp => !dbSanityIds.has(String(sp._id)));
    
    const combined = [...dbSubmissions, ...sanityOnlyPosts];

    const total = combined.length;
    const withSanity = dbSubmissions.filter(s => s.sanityId).length + sanityOnlyPosts.length;
    const withoutSanity = dbSubmissions.filter(s => !s.sanityId).length;

    // Published this month
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const publishedThisMonth = combined.filter(s => new Date(s.updatedAt || s.createdAt) >= currentMonth).length;

    // Top authors mapping
    const authorCounts = {};
    combined.forEach(s => {
      const name = s.author?.name || s.authorName || 'Sanity Admin';
      authorCounts[name] = (authorCounts[name] || 0) + 1;
    });

    const topAuthors = Object.keys(authorCounts)
      .map(name => ({ _id: name, name, count: authorCounts[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({ success: true, stats: { total, withSanity, withoutSanity, publishedThisMonth, topAuthors } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

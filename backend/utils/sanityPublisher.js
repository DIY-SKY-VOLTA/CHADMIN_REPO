/**
 * Sanity Publish Utility
 * Creates/updates blog posts in Sanity CMS from approved submissions
 * 
 * Converts TipTap HTML content to Sanity Portable Text format
 * and creates a proper post document with all metadata.
 */

const { createClient } = require('@sanity/client');
const cheerio = require('cheerio');


const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || '9vp8teu1';
const SANITY_DATASET = process.env.SANITY_DATASET || 'production';
const SANITY_API_VERSION = '2024-01-01';
const SANITY_TOKEN = process.env.SANITY_TOKEN;

if (!SANITY_TOKEN) {
  console.warn('SANITY_TOKEN not set — Sanity write operations will fail');
}

const sanityClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: SANITY_API_VERSION,
  token: SANITY_TOKEN,
  useCdn: false,
});

/**
 * Convert TipTap HTML content string to Sanity Portable Text blocks
 * Handles: paragraphs, headings, lists, code blocks, blockquotes, images, links
 */
function htmlToPortableText(html) {
  if (!html) return [];

  const $ = cheerio.load(html, { xmlMode: false });
  const blocks = [];

  $('body').children().each((_, el) => {
    const block = convertNodeToBlock($, el);
    if (block) {
      if (Array.isArray(block)) {
        blocks.push(...block);
      } else {
        blocks.push(block);
      }
    }
  });

  return blocks;
}

function convertNodeToBlock($, el) {
  const tag = el.tagName;

  switch (tag) {
    case 'p':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'normal',
      };

    case 'h1':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'h1',
      };

    case 'h2':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'h2',
      };

    case 'h3':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'h3',
      };

    case 'h4':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'h4',
      };

    case 'blockquote':
      return {
        _type: 'block',
        children: extractInlineContent($, el),
        markDefs: extractMarkDefs($, el),
        style: 'blockquote',
      };

    case 'ul':
    case 'ol': {
      const listItems = [];
      $(el).children('li').each((_, li) => {
        listItems.push({
          _type: 'block',
          children: extractInlineContent($, li),
          markDefs: extractMarkDefs($, li),
          style: 'normal',
          listItem: 'bullet',
          level: 1,
        });
      });
      return listItems;
    }

    case 'pre': {
      const codeEl = $(el).find('code');
      const code = codeEl.length ? codeEl.text() : $(el).text();
      const language = codeEl.attr('class')?.match(/language-(\w+)/)?.[1] || '';
      return {
        _type: 'code',
        code,
        language,
      };
    }

    case 'img': {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || '';
      if (src) {
        return {
          _type: 'image',
          asset: { _type: 'reference', _ref: null },
          alt,
          _externalUrl: src,
        };
      }
      return null;
    }

    case 'br':
      return {
        _type: 'block',
        children: [{ _type: 'span', text: '', marks: [] }],
        style: 'normal',
      };

    case 'hr':
      return {
        _type: 'block',
        children: [{ _type: 'span', text: '---', marks: [] }],
        style: 'normal',
        markDefs: [],
      };

    default: {
      const text = $(el).text().trim();
      if (text) {
        return {
          _type: 'block',
          children: [{ _type: 'span', text, marks: [] }],
          style: 'normal',
        };
      }
      return null;
    }
  }
}

function extractInlineContent($, el) {
  const children = [];

  el.childNodes.forEach((child) => {
    if (child.type === 'text') {
      if (child.data) {
        children.push({ _type: 'span', text: child.data, marks: [] });
      }
    } else if (child.type === 'tag' || child.type === 'element') {
      const inline = convertInlineElement($, child);
      if (inline) children.push(...inline);
    }
  });

  return children.length > 0 ? children : [{ _type: 'span', text: '', marks: [] }];
}

function convertInlineElement($, el) {
  const tag = el.tagName;
  const text = $(el).text();

  if (!text) return [];

  switch (tag) {
    case 'strong':
    case 'b':
      return [{ _type: 'span', text, marks: ['strong'] }];

    case 'em':
    case 'i':
      return [{ _type: 'span', text, marks: ['em'] }];

    case 'code':
      return [{ _type: 'span', text, marks: ['code'] }];

    case 'a': {
      const href = $(el).attr('href');
      return [{ _type: 'span', text, marks: [] }];
    }

    case 'span':
    case 'font':
      return [{ _type: 'span', text, marks: [] }];

    default:
      return [{ _type: 'span', text, marks: [] }];
  }
}

function extractMarkDefs($, el) {
  const defs = [];
  $(el).find('a').each((_, a) => {
    const href = $(a).attr('href');
    if (href) {
      defs.push({
        _key: `link_${Math.random().toString(36).substring(2, 8)}`,
        _type: 'link',
        href,
      });
    }
  });
  return defs;
}

/**
 * Publish a blog submission to Sanity CMS
 * 
 * @param {Object} submission - Mongoose BlogSubmission document
 * @returns {Object} { sanityId, sanityUrl }
 */
async function publishToSanity(submission) {
  if (!SANITY_TOKEN) {
    throw new Error('SANITY_TOKEN is not configured. Cannot publish to Sanity.');
  }

  console.info(`Publishing blog to Sanity: ${submission.title} (${submission.slug})`);

  const blocks = htmlToPortableText(submission.content);

  const postDoc = {
    _type: 'post',
    title: submission.title,
    slug: {
      _type: 'slug',
      current: submission.slug,
    },
    excerpt: submission.excerpt || autoGenerateExcerpt(submission.content),
    body: blocks,
    publishedAt: submission.publishedAt ? new Date(submission.publishedAt).toISOString() : new Date().toISOString(),
    readTime: submission.readTime || '5 min read',
    featured: false,
    category: {
      _type: 'reference',
      _ref: null,
    },
    tags: submission.tags || [],
    author: {
      _type: 'reference',
      _ref: null,
    },
    seo: {
      title: submission.metaTitle || submission.title,
      description: submission.metaDescription || submission.excerpt || '',
    },
  };

  if (submission.coverImage) {
    postDoc.mainImage = {
      _type: 'image',
      asset: { _type: 'reference', _ref: null },
      alt: submission.coverImageAlt || submission.title,
      caption: submission.coverImageCaption || '',
    };
  }

  const created = await sanityClient.create(postDoc);

  console.info(`Successfully published to Sanity: ${created._id}`);

  return {
    sanityId: created._id,
    sanityUrl: `https://${SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/data/query/${SANITY_DATASET}?query=*[_id=='${created._id}'][0]`,
  };
}

/**
 * Update an existing Sanity post document
 * 
 * @param {string} sanityId - Existing Sanity document ID
 * @param {Object} submission - Updated BlogSubmission document
 * @returns {Object} Updated Sanity document
 */
async function updateSanityPost(sanityId, submission) {
  if (!SANITY_TOKEN) {
    throw new Error('SANITY_TOKEN is not configured. Cannot update Sanity post.');
  }

  console.info(`Updating Sanity post: ${sanityId}`);

  const blocks = htmlToPortableText(submission.content);

  const patch = {
    title: submission.title,
    slug: {
      _type: 'slug',
      current: submission.slug,
    },
    excerpt: submission.excerpt || autoGenerateExcerpt(submission.content),
    body: blocks,
    publishedAt: submission.publishedAt ? new Date(submission.publishedAt).toISOString() : new Date().toISOString(),
    readTime: submission.readTime || '5 min read',
    tags: submission.tags || [],
    seo: {
      title: submission.metaTitle || submission.title,
      description: submission.metaDescription || submission.excerpt || '',
    },
  };

  const updated = await sanityClient.patch(sanityId).set(patch).commit();

  console.info(`Successfully updated Sanity post: ${sanityId}`);

  return updated;
}

/**
 * Delete a post from Sanity
 * 
 * @param {string} sanityId - Sanity document ID to delete
 */
async function deleteSanityPost(sanityId) {
  if (!SANITY_TOKEN) {
    throw new Error('SANITY_TOKEN is not configured. Cannot delete from Sanity.');
  }

  console.info(`Deleting Sanity post: ${sanityId}`);

  await sanityClient.delete(sanityId);

  console.info(`Successfully deleted Sanity post: ${sanityId}`);
}

/**
 * Auto-generate excerpt from HTML content
 */
function autoGenerateExcerpt(content, maxLength = 200) {
  if (!content) return '';
  const text = content.replace(/<[^>]+>/g, '').trim();
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

module.exports = {
  publishToSanity,
  updateSanityPost,
  deleteSanityPost,
  htmlToPortableText,
};

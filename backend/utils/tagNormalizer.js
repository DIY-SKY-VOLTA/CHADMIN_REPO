/**
 * Tag Normalizer — Reusable Utility
 *
 * Single source of truth for tag normalization logic.
 * Used by:
 *   - contests model  (pre('save') hook)
 *   - migration script (normalizeContestTags.js)
 *   - external pipeline (Scrapping folder)
 *   - admin API endpoint
 *
 * @module utils/tagNormalizer
 * @version 2.0
 */

/* ============================================================
   CANONICAL CATEGORY MAPPING
============================================================ */

const CATEGORY_MAP = {
  'art & design':          'Creative Arts',
  'digital art':           'Creative Arts',
  'graphic design':        'Creative Arts',
  'fashion design':        'Creative Arts',
  'photography':           'Creative Arts',
  'illustration':          'Creative Arts',
  'animation':             'Creative Arts',

  'technology':            'Technology & AI',
  'technology innovation': 'Technology & AI',
  'ai':                    'Technology & AI',
  'artificial intelligence':'Technology & AI',
  'web development':       'Technology & AI',
  'data science':          'Technology & AI',

  'science':               'Science & Research',
  'research':              'Science & Research',

  'entrepreneurship':      'Business & Innovation',
  'innovation':            'Business & Innovation',
  'startups':              'Business & Innovation',

  'writing':               'Writing & Media',
  'film & video':          'Writing & Media',
  'filmmaking':            'Writing & Media',
  'video editing':         'Writing & Media',
  'music':                 'Writing & Media',
  'journalism':            'Writing & Media',

  'environment':           'Environment & Sustainability',
  'sustainability':        'Environment & Sustainability',
  'climate':               'Environment & Sustainability',

  'cooking':               'Food & Cooking',
  'food':                  'Food & Cooking',
  'culinary':              'Food & Cooking',
  'recipe':                'Food & Cooking',
  'baking':                'Food & Cooking',
  'barbecue':              'Food & Cooking',

  'education':             'Education & Learning',

  'social impact':         'Social Impact & Leadership',
  'leadership & impact':   'Social Impact & Leadership',

  'open / multidisciplinary': 'Open / Multidisciplinary',
  'performing arts':         'Open / Multidisciplinary',
  'dance':                   'Open / Multidisciplinary',
  'theatre':                 'Open / Multidisciplinary',
};

const CANONICAL_CATEGORY_LIST = [
  'Creative Arts',
  'Technology & AI',
  'Science & Research',
  'Business & Innovation',
  'Writing & Media',
  'Environment & Sustainability',
  'Food & Cooking',
  'Education & Learning',
  'Social Impact & Leadership',
  'Open / Multidisciplinary',
];

/* ============================================================
   SUBCATEGORY MAPPING — raw value → canonical subcategory
============================================================ */

const SUBCATEGORY_MAP = {
  // Creative Arts
  'photography':            'Photography',
  'art & design':           'Illustration & Visual Art',
  'digital art':            'Illustration & Visual Art',
  'illustration':           'Illustration & Visual Art',
  'animation':              'Illustration & Visual Art',
  'graphic design':         'Graphic Design',
  'fashion design':         'Fashion Design',
  'architecture':           'Architecture & Urban Design',
  'architectural':          'Architecture & Urban Design',
  'urban design':           'Architecture & Urban Design',
  'urban planning':         'Architecture & Urban Design',
  'urbanism':               'Architecture & Urban Design',
  'landscape architecture': 'Architecture & Urban Design',
  'landscape':              'Architecture & Urban Design',
  'garden design':          'Architecture & Urban Design',
  'interior design':        'Architecture & Urban Design',

  // Technology & AI
  'technology':             'Software Development',
  'technology innovation':  'Software Development',
  'web development':        'Software Development',
  'coding':                 'Software Development',
  'ai':                     'AI & Machine Learning',
  'artificial intelligence':'AI & Machine Learning',
  'data science':           'AI & Machine Learning',

  // Science & Research
  'science':                'Physical & Space Sciences',
  'research':               'Physical & Space Sciences',

  // Business & Innovation
  'entrepreneurship':       'Entrepreneurship & Startups',
  'innovation':             'Entrepreneurship & Startups',
  'startups':               'Entrepreneurship & Startups',
  'business':               'Entrepreneurship & Startups',

  // Writing & Media
  'writing':                'Fiction & Creative Writing',
  'film & video':           'Film & Video',
  'filmmaking':             'Film & Video',
  'video editing':          'Film & Video',
  'music':                  'Music & Audio',
  'journalism':             'Journalism & Nonfiction',
  'media':                  'Journalism & Nonfiction',

  // Environment & Sustainability
  'environment':            'Conservation & Ecology',
  'sustainability':         'Conservation & Ecology',
  'climate':                'Climate & Clean Energy',
  'agriculture':            'Sustainable Food & Agriculture',

  // Food & Cooking
  'cooking':                'Cooking',
  'baking':                 'Baking',
  'barbecue':               'Barbecue',
  'recipe':                 'Recipe Development',

  // Education & Learning
  'education':              'Teaching & Curriculum',

  // Social Impact & Leadership
  'social impact':          'Community & Equity',
  'leadership & impact':    'Youth Leadership',

  // Open / Multidisciplinary — no subcategory
  'open / multidisciplinary': null,
  'performing arts':          null,
  'dance':                    null,
  'theatre':                  null,
};

/**
 * Map a raw category string to its canonical subcategory.
 * @param {string} rawCategory
 * @returns {string|null} Canonical subcategory name or null
 */
function mapSubcategory(rawCategory) {
  if (!rawCategory) return null;
  const key = rawCategory.toLowerCase().trim();
  return SUBCATEGORY_MAP[key] || null;
}

/**
 * Map a raw category string to its canonical group.
 * @param {string} rawCategory
 * @returns {string} Canonical category name
 */
function mapCanonicalCategory(rawCategory) {
  if (!rawCategory) return 'Open / Multidisciplinary';
  const key = rawCategory.toLowerCase().trim();
  return CATEGORY_MAP[key] || 'Open / Multidisciplinary';
}

/* ============================================================
   CONSOLIDATION MAP — merge variant tags into canonical forms
============================================================ */

const CONSOLIDATION_MAP = {
  // Plurals → singular
  'students': 'student',
  'startups': 'startup',
  'grants': 'grant',
  'scholarships': 'scholarship',
  'fellowships': 'fellowship',
  'competitions': 'competition',

  // Photo variants
  'photo': 'photography',
  'astrophotography': 'photography',
  'fine-art-photo': 'fine-art',
  'press-photography': 'photojournalism',
  'world-photo-awards': 'photography',
  'birds': 'wildlife',
  'flowers': 'nature',
  'botany': 'nature',
  'trees': 'nature',

  // Climate variants
  'climate-change': 'climate',
  'climate-action': 'climate',
  'climate-resilience': 'climate',
  'climate-adaptation': 'climate',
  'climate-justice': 'climate',
  'climate-tech': 'climate',
  'climate-smart': 'climate',
  'net-zero': 'climate',

  // Sustainability variants
  'sustainable-development': 'sustainability',
  'sustainable-design': 'sustainability',
  'sustainable-innovation': 'sustainability',
  'circular-economy': 'sustainability',
  'eco-innovation': 'sustainability',
  'zero-waste': 'sustainability',

  // Environmental
  'environmental': 'environment',
  'environmental-art': 'environment',
  'nature-art': 'nature',
  'biosphere': 'environment',
  'ecosystem': 'environment',
  'ecology': 'environment',
  'freshwater': 'water',
  'marine-life': 'ocean',
  'marine-conservation': 'ocean',
  'ocean-conservation': 'ocean',

  // Energy variants
  'clean-energy': 'renewable-energy',
  'solar-energy': 'renewable-energy',
  'solar': 'renewable-energy',
  'green-energy': 'renewable-energy',
  'nuclear-energy': 'nuclear',
  'hydrogen': 'renewable-energy',
  'super-pollutants': 'pollution',

  // Women/gender variants
  'women-in-tech': 'women-in-stem',
  'women-in-science': 'women-in-stem',
  'girls-in-tech': 'women-in-stem',
  'women-artists': 'women-in-art',
  'women-in-art': 'women-in-art',
  'women-photographers': 'women',
  'women-founders': 'women-entrepreneurs',
  'women-entrepreneurs': 'women-entrepreneurs',
  'women-in-sports': 'women',
  'women-writers': 'women',
  'women-empowerment': 'women',
  'young-artists': 'emerging-artists',
  'young-writers': 'emerging-artists',
  'young-readers': 'youth',
  'youth-advocacy': 'youth',
  'youth-engagement': 'youth',
  'youth-leadership': 'youth',
  'youth-awards': 'youth',

  // Startup/business variants
  'startup-funding': 'startup',
  'startup-accelerator': 'startup',
  'startup-pitch': 'pitch',
  'venture-pitch': 'pitch',
  'tech-pitch': 'pitch',
  'pitch-battle': 'pitch',
  'venture-capital': 'startup',
  'vc-funding': 'startup',
  'seed-capital': 'startup',
  'equity-free': 'startup',
  'equity-free-funding': 'startup',
  'impact-funding': 'grant',
  'grant-funding': 'grant',
  'government-grant': 'grant',
  'safe-funding': 'grant',
  'co-financing': 'grant',
  'emergency-funding': 'grant',

  // Pitch/residency variants
  'solo-exhibition': 'solo-show',
  'online-exhibition': 'online-exhibition',
  'artist-residency': 'residency',
  'retreat': 'residency',

  // Literature variants
  'publishing': 'publication',
  'literary': 'literature',
  'literary-fiction': 'literature',
  'literary-prize': 'literature',
  'literary-magazine': 'literature',
  'african-literature': 'literature',
  'childrens-literature': 'literature',
  'short-story': 'fiction',
  'story-collection': 'fiction',
  'novel': 'fiction',
  'graphic-novel': 'fiction',
  'micro-story': 'flash-fiction',
  'chapbook': 'poetry',
  'haiku': 'poetry',
  'prose': 'fiction',
  'spoken-word': 'poetry',
  'book-cover': 'cover-art',
  'bookplate': 'ex-libris',
  'letters': 'literature',
  'books': 'literature',
  'annual-book': 'publication',
  'photobook': 'publication',

  // Screenwriting variants
  'screenwriting': 'writing',
  'playwriting': 'writing',
  'pilot-script': 'writing',
  'creative-writing': 'writing',

  // Architecture/design variants
  'built-environment': 'architecture',
  'residential-design': 'architecture',
  'landscape-architecture': 'architecture',
  'garden-design': 'architecture',
  'interior-design': 'architecture',
  'urban-design': 'urban',
  'urban-planning': 'urban',
  'urban-development': 'urban',
  'urban-innovation': 'urban',
  'urban-living': 'urban',
  'urban-solutions': 'urban',
  'urban-intelligence': 'urban',
  'micro-living': 'urban',
  'industrial-design': 'product-design',
  'surface-design': 'product-design',
  'furniture-design': 'product-design',
  'branded-environments': 'architecture',
  'wayfinding': 'graphic-design',

  // Visual identity/design variants
  'corporate-identity': 'graphic-design',
  'visual-identity': 'graphic-design',
  'visual-system': 'graphic-design',
  'visual-communication': 'graphic-design',
  'branding': 'graphic-design',
  'typography': 'graphic-design',
  'public-art': 'public-art',
  'calligraphy': 'typography',

  // UI/UX variants
  'uiux': 'ui-ux',
  'app-design': 'ui-ux',
  'frontend': 'ui-ux',
  'mobile-apps': 'ui-ux',
  'ios-development': 'ui-ux',

  // Digital variants
  'digital-art': 'digital-art',
  'digital-media': 'digital-media',
  'digital-marketing': 'marketing',
  'digital-inclusion': 'digital-inclusion',
  'digital-communication': 'digital-communication',
  'digital-economy': 'digital-economy',
  'digital-jobs': 'digital-jobs',
  'digital-access': 'digital-access',
  'digital-integrity': 'digital-integrity',
  'digital-certificate': 'certification',
  'digital-experiences': 'digital-media',
  'digital-imaging': 'photography',
  'digital-awards': 'digital-art',
  'metaverse-exhibition': 'digital-art',
  'new-media': 'digital-media',

  // AI variants
  'ai-ethics': 'ai',
  'ai-safety': 'ai',
  'ai-for-good': 'ai',
  'ai-modeling': 'ai',
  'trusted-ai': 'ai',
  'generative-ai': 'ai',
  'machine-learning': 'ai',
  'ai-art': 'ai',
  'alignment': 'ai',

  // Tech variants
  'deep-tech': 'tech',
  'cleantech': 'tech',
  'healthtech': 'health',
  'agritech': 'agriculture',
  'fintech': 'finance',
  'edtech': 'education',
  'hr-tech': 'tech',
  'civic-tech': 'tech',
  'space-tech': 'tech',
  'media-tech': 'tech',
  'biotech': 'science',
  'agrifood': 'agriculture',
  'food-tech': 'food',
  'food-security': 'food',
  'food-waste': 'food',

  // Photo genre variants
  'black-and-white': 'monochrome',
  'monochrome': 'monochrome',
  'shades-of-gray': 'monochrome',
  'umbra': 'shadow',
  'shadow-and-light': 'shadow',
  'low-light': 'night',
  'candid': 'portrait',
  'cityscape': 'urban',
  'street-life': 'street',
  'silhouettes': 'shadow',

  // Social variants
  'social-impact': 'social-impact',
  'social-change': 'social-impact',
  'social-design': 'social-impact',
  'social-narrative': 'social-impact',
  'social-commentary': 'social-impact',
  'social-themes': 'social-impact',
  'social-enterprise': 'social-impact',
  'social-issues': 'social-impact',
  'social-sciences': 'social-sciences',
  'social-media': 'social-media',

  // Health variants
  'healthcare': 'health',
  'health-innovation': 'health',
  'health-justice': 'health',

  // Community/society
  'community': 'community',
  'cultural-heritage': 'cultural-heritage',
  'cultural-exchange': 'cultural-heritage',
  'civic-engagement': 'civic-engagement',
  'volunteering': 'community',
  'grassroots': 'community',
  'humanity': 'human-rights',
  'human': 'human-rights',
  'human-stories': 'storytelling',
  'human-condition': 'storytelling',

  // Film/Video variants
  'cinema': 'film',
  'filmmaking': 'film',
  'film-festival': 'documentary',
  'experimental-cinema': 'experimental',
  'videominute': 'short-film',

  // Science variants
  'science-communication': 'science',
  'science-journalism': 'science',
  'life-science': 'biology',
  'earth-science': 'geology',
  'earth-observation': 'geology',
  'space-science': 'astronomy',
  'photon-source': 'physics',

  // Education variants
  'inclusive-education': 'education',
  'online-learning': 'education',
  'teaching': 'education',
  'schools': 'education',
  'pedagogy': 'education',
  'vocational': 'education',
  'fellowships': 'fellowship',
  'scholarships': 'scholarship',
  'graduate-scholarship': 'scholarship',
  'postgraduate': 'scholarship',
  'undergraduate': 'student',
  'masters': 'student',
  'high-school': 'student',
  'junior': 'student',
  'seniors': 'seniors',
  'portfolio-building': 'portfolio',
  'professional-development': 'professional-development',
  'career-development': 'professional-development',

  // Curation/gallery
  'curated': 'curation',
  'curatorial': 'curation',
  'gallery': 'curation',
  'online-gallery': 'online-exhibition',
  'juried-exhibition': 'juried',

  // Entrepreneurship variants
  'entrepreneurship': 'startup',
  'innovation': 'innovation',
  'inventing': 'innovation',
  'incubation': 'startup',
  'startups': 'startup',

  // Awards/recognition
  'international-competition': 'competition',
  'monthly-contest': 'competition',
  'weekly-contest': 'competition',
  'timed-challenge': 'competition',
  'pitch-competition': 'pitch',
  'industry-award': 'award',
  'professional-honor': 'award',
  'merit-based': 'scholarship',
  'merit': 'scholarship',
  'best-of': 'award',
  'honor': 'award',
  'prestige': 'award',
  'award-label': 'award',
  'ranking': 'award',
  'recognition': 'award',
  'certifications': 'certification',
  'accreditation': 'certification',
  'government-certification': 'certification',

  // Competition format
  'hackathon': 'hackathon',
  'olympiad': 'olympiad',
  'moot-court': 'olympiad',
  'bootcamp': 'bootcamp',
  'workshop': 'bootcamp',
  'training': 'bootcamp',

  // Sports/games
  'football': 'sports',
  'cricket': 'sports',
  'cycling': 'sports',

  // Media/news
  'magazine-cover': 'magazine',
  'news-reporting': 'journalism',
  'local-news': 'journalism',
  'news': 'journalism',

  // Other consolidations
  'intellectual-property': 'ip',
  'photography': 'photography',
  'sdg': 'sdgs',
  'composition': 'composition',
  'comics': 'graphic-novel',
  'manga': 'graphic-novel',
  'cartoon': 'illustration',
  'coding': 'programming',
  'software': 'programming',
  'computing': 'programming',
  'open-source': 'programming',
  'information-technology': 'tech',
  'cybersecurity': 'security',
  'safety': 'security',
  'data': 'data-science',
  'data-science': 'data-science',
  'hardware': 'engineering',
  'electronics': 'engineering',
  'api': 'programming',
  'robotics': 'engineering',
  'quantum': 'physics',
  'photojournalism': 'photojournalism',
  'cinematography': 'film',
  'narrative': 'storytelling',
  'storytelling': 'storytelling',
  'audio': 'music',
  'audiovisual': 'film',
  'vocals': 'music',
  'orchestral': 'music',
  'instruments': 'music',
  'piano': 'music',
  'strings': 'music',
  'classical': 'music',
  'brass-bands': 'music',
  'composers': 'music',
  'soul': 'music',
  'indie-publishing': 'publication',
  'podcast': 'podcast',
  'award': 'award',
  'people': 'portrait',
  'stars': 'astronomy',
  'biodiversity': 'wildlife',
  'animals': 'wildlife',
  'pets': 'wildlife',
  'zoos': 'wildlife',
  'aquariums': 'ocean',
  'fisheries': 'ocean',
  'insects': 'wildlife',
  'gaming': 'gaming',
  'american-made': 'americana',
  'politics': 'governance',
  'policy': 'governance',
  'diplomacy': 'governance',
  'public-sector': 'governance',
  'economics': 'finance',
  'accounting': 'finance',
  'banking': 'finance',
  'supply-chain': 'business',
  'commodities': 'business',
  'manufacturing': 'business',
  'retail': 'business',
  'e-commerce': 'business',
  'marketing': 'marketing',
  'advertising': 'marketing',
  'content-marketing': 'marketing',
  'pr': 'marketing',
  'public-relations': 'marketing',
  'promotion': 'marketing',
  'communications': 'marketing',
  'naming': 'graphic-design',
  'insurance': 'finance',
  'investment': 'finance',
  'market-expansion': 'business',
  'economic-growth': 'business',
  'economic-opportunity': 'business',
  'economic-prosperity': 'business',
  'labor-mobility': 'business',
  'trade': 'business',
  'fmcg': 'business',
  'career': 'professional-development',
  'fellowship': 'fellowship',
  'match-funding': 'grant',
  'prototype': 'prototype',
  'proposal': 'proposal',
  'case-study': 'case-study',
  'employment': 'career',
  'internship': 'internship',
  'academic-mobility': 'scholarship',
  'scaling': 'startup',
  'governance': 'governance',
  'multi': 'global',
  'transnational': 'global',
  'diaspora': 'global',
  'technopreneurship': 'startup',
  'strategy': 'strategy',
  'research-and-development': 'research',
  'research': 'research',
  'preservation': 'conservation',
  'reconstruction': 'reconstruction',
  'gender': 'gender-equality',
  'equality': 'gender-equality',
  'diversity': 'diversity',
  'inclusion': 'inclusion',
  'lgbtq': 'lgbtq',
  'lgbtqia': 'lgbtq',
  'queer': 'lgbtq',
  'refugees': 'migration',
  'humanitarian': 'human-rights',
  'peacebuilding': 'peace',
  'conflict-resolution': 'peace',
  'philanthropy': 'social-impact',
  'charity-donation': 'social-impact',
  'minority': 'minority',
  'travel': 'travel',
  'tourism': 'travel',
  'holiday': 'travel',
  'winter': 'travel',
  'autumn': 'travel',
  'adventure': 'travel',
  'countryside': 'travel',
  'culinary': 'food',
  'nutrition': 'health',
  'welfare': 'social-impact',
  'poverty-alleviation': 'social-impact',
  'hunger': 'food',
  'water-theme': 'water',
  'sanitation': 'water',
  'pollution': 'pollution',
  'waste': 'pollution',
  'nuclear': 'nuclear',
  'geology': 'geology',
  'astronomy': 'astronomy',
  'astrophysics': 'astronomy',
  'biology': 'biology',
  'chemistry': 'chemistry',
  'physics': 'physics',
  'mathematics': 'mathematics',
  'engineering': 'engineering',
  'crystallography': 'science',
  'synchrotron': 'science',
  'photonics': 'physics',
  'statistics': 'mathematics',
  'fieldwork': 'research',
  'theater': 'theater',
  'opera': 'music',
  'drama': 'theater',
  'dance': 'dance',
  'solo': 'solo-show',
  'portrait': 'portrait',
  'landscape': 'landscape',
  'street': 'street',
  'abstract': 'abstract',
  'conceptual': 'conceptual',
  'conceptual-design': 'conceptual',
  'minimalism': 'abstract',
  'contemporary': 'contemporary',
  'contemporary-art': 'contemporary',
  'modern': 'contemporary',
  'modernist': 'contemporary',
  'abstract-expressionism': 'abstract',
  'still-life': 'still-life',
  'collage': 'mixed-media',
  'mixed-media': 'mixed-media',
  'print': 'printmaking',
  'interactive-media': 'digital-media',
  'visual-media': 'digital-media',
  'video-art': 'experimental',
  'new-contemporary': 'contemporary',
  'glass': 'sculpture',
  'ceramics': 'sculpture',
  'woodworking': 'sculpture',
  'craft': 'sculpture',
  'analog': 'photography',
  'traditional-media': 'traditional-art',
  'visual-arts': 'visual-arts',
  'visual-art': 'visual-arts',
  'visual': 'visual-arts',
  'fine-art': 'fine-art',
  'art-exhibition': 'exhibition',
  'curation': 'curation',
  'creative': 'innovation',
  'innovation': 'innovation',
  'exhibition': 'exhibition',
  'climate': 'climate',
  'environment': 'environment',
  'sustainability': 'sustainability',
  'conservation': 'conservation',
  'water': 'water',
  'ocean': 'ocean',
  'wildlife': 'wildlife',
  'nature': 'nature',
  'agriculture': 'agriculture',
  'food': 'food',
  'health': 'health',
  'education': 'education',
  'capacity-building': 'capacity-building',
  'portfolio-review': 'portfolio-review',
  'portfolio': 'portfolio',
  'packaging': 'packaging',
  'commercial': 'commercial',
  'editorial': 'editorial',
  'poster': 'poster',
  'illustration': 'illustration',
  'typography': 'typography',
  'color': 'color',
  'color-theory': 'color',
  'light': 'light',
  'contrast': 'light',
  'texture': 'texture',
  'geometry': 'geometry',
  'emotion': 'emotion',
  'action': 'action',
  'face': 'portrait',
  'shadow': 'shadow',
  'night': 'night',
  'sports': 'sports',
  'culture': 'culture',
  'history': 'history',
  'stem': 'stem',
  'steam': 'stem',
  'children': 'youth',
  'youth': 'youth',
  'elderly': 'seniors',
  'retirement': 'seniors',
  'disability-awareness': 'inclusion',
  'autism': 'inclusion',
  'global': 'global',
  'diversity': 'diversity',
  'inclusion': 'inclusion',
  'gender-equality': 'gender-equality',
  'human-rights': 'human-rights',
  'social-impact': 'social-impact',
  'peace': 'peace',
  'migration': 'migration',
  'migrant': 'migration',
  'democracy': 'democracy',
  'urban': 'urban',
  'architecture': 'architecture',
  'graphic-design': 'graphic-design',
  'product-design': 'product-design',
  'ui-ux': 'ui-ux',
  'photography': 'photography',
  'photojournalism': 'photojournalism',
  'documentary': 'documentary',
  'animation': 'animation',
  'painting': 'painting',
  'sculpture': 'sculpture',
  'printmaking': 'printmaking',
  'drawing': 'drawing',
  'calligraphy': 'calligraphy',
  'fine-art': 'fine-art',
  'ai': 'ai',
  'startup': 'startup',
  'innovation': 'innovation',
  'youth': 'youth',
  'publication': 'publication',
  'pitch': 'pitch',
  'grant': 'grant',
  'student': 'student',
  'storytelling': 'storytelling',
  'poetry': 'poetry',
  'funding': 'grant',
  'tech': 'tech',
  'scholarship': 'scholarship',
  'travel': 'travel',
  'community': 'community',
  'leadership': 'leadership',
};

/* ============================================================
   TAG DENY LIST — generic words with no signal value
   Expanded with brand names, platforms, generic descriptors
============================================================ */

const TAG_DENY_LIST = new Set([
  // Generic competition words
  'general', 'open', 'annual', 'monthly', 'weekly',
  'competition', 'awards', 'prizes', 'recognition',
  'global', 'international', 'talent', 'excellence',
  'creative', 'design', 'art', 'photography', 'video',
  'digital', 'emerging', 'festival', 'exhibition', 'showcase',
  'prize', 'award', 'contest', 'competitions',
  'prize-money', 'prize-fund', 'cash-prize',

  // Brand / platform / company names
  'canva', 'flipkart', 'pixiv', 'sony', 'leica', 'wipo',
  'mastercard-foundation', 'mit', 'harvard', 'stanford',
  'yale', 'columbia-university', 'sheffield-docfest',
  'khelo-india', 'nd-awards', 'tef', 'borlaug', 'gef-sgp',
  'tipa', 'un-habitat', 'horizon-europe', 'upenn',
  'unesco', 'fifa', 'mastercard', 'wikipedia',
  'sony', 'iphone', 'canon', 'nokia',
  'bifa-qualifying',

  // Generic single words that add no info
  'online', 'feature', 'campaign', 'news', 'photo',
  'people', 'music', 'writing', 'film', 'business', 'nude',
  'agency', 'corporate', 'comprehensive', 'industry-standard',
  'insight', 'capture', 'vision', 'visions', 'breakthrough',
  'transformative', 'growth', 'skills', 'local', 'regional',
  'workplace', 'promotion', 'interview', 'journal',

  // Generic pageant
  'pageant',

  // Timed / frequency words
  'timed', 'deadline', 'quarterly',

  // Overly broad
  'multilingual', 'multilingualism',
  'interdisciplinary', 'cross-disciplinary',
  'regional', 'worldwide',
]);

/* ============================================================
   LOCATION REMOVE LIST — countries, cities, regions
   (already captured in audience.location field)
============================================================ */

const TAG_LOCATION_REMOVE = new Set([
  // Countries
  'india', 'nigeria', 'canada', 'uk', 'usa', 'china',
  'japan', 'australia', 'greece', 'italy', 'france',
  'dubai', 'singapore', 'ukraine', 'russia', 'vietnam',
  'madagascar', 'indonesia', 'scotland', 'slovenia',
  'turkmenistan', 'libya', 'equatorial-guinea',
  'south-africa', 'monaco', 'georgia', 'algeria',
  'angola', 'argentina', 'bangladesh', 'bolivia',
  'brazil', 'chile', 'colombia', 'croatia', 'czech',
  'denmark', 'egypt', 'finland', 'france', 'germany', 'ghana',
  'hungary', 'iceland', 'iran', 'iraq', 'ireland',
  'israel', 'jordan', 'kazakhstan', 'kenya', 'korea',
  'lebanon', 'luxembourg', 'malaysia', 'maldives',
  'mexico', 'morocco', 'nepal', 'netherlands',
  'new-zealand', 'norway', 'pakistan', 'peru',
  'philippines', 'poland', 'portugal', 'qatar',
  'romania', 'rwanda', 'saudi-arabia', 'serbia',
  'south-korea', 'spain', 'sri-lanka', 'sweden',
  'switzerland', 'taiwan', 'tanzania', 'thailand',
  'tunisia', 'turkey', 'uganda', 'uae', 'uk',
  'united-arab-emirates', 'united-kingdom',
  'united-states', 'uzbekistan', 'zambia', 'zimbabwe',

  // Territories / regions
  'alaska', 'alberta', 'brooklyn', 'texas', 'paris',
  'berlin', 'tokyo', 'madrid', 'geneva', 'new-york',
  'himalaya', 'mediterranean', 'indo-burma',
  'global-south', 'asia', 'africa', 'europe',
  'commonwealth', 'brics-alliance', 'dubai', 'venice',

  // Continents / macros
  'american', 'european', 'asian', 'african', 'latin-american',

  // Language tags
  'english-language', 'multilingualism', 'multilingual',
]);

/* ============================================================
   KEEP LIST — niche-but-descriptive tags worth preserving
============================================================ */

const TAG_KEEP_LIST = new Set([
  // Niche art/photography genres
  'astrophotography', 'experimental-cinema', 'still-life',
  'minimalism', 'silhouettes', 'monochrome', 'street',
  'abstract', 'conceptual', 'contemporary', 'fine-art',
  'photojournalism', 'landscape', 'portrait',
  'mixed-media', 'street-photography',

  // Niche formats
  'oscar-qualifying', 'biennial', 'juried',
  'solo-show', 'online-exhibition',
  'portfolio-review', 'residency',

  // Specific fields
  'crystallography', 'synchrotron', 'marine-conservation',
  'ocean', 'wildlife', 'biodiversity',
  'astronomy', 'physics', 'chemistry', 'biology',
  'mathematics', 'engineering', 'robotics',
  'archaeology', 'paleontology', 'linguistics',
  'philosophy', 'history', 'anthropology',

  // Literature/poetry
  'haiku', 'poetry', 'flash-fiction', 'creative-writing',
  'fiction', 'nonfiction', 'essay', 'screenwriting',
  'playwriting', 'chapbook',

  // Music
  'classical', 'jazz', 'orchestral', 'opera', 'symphony',
  'choir', 'composition', 'podcast',

  // Performance
  'theater', 'dance', 'spoken-word',

  // Social/impact specific
  'ai-ethics', 'climate-justice', 'lgbtq',
  'indigenous', 'minority', 'disability',
  'human-rights', 'gender-equality',

  // Useful tech specifics
  'blockchain', 'web3', 'generative-ai', 'machine-learning',
  'data-science', 'cybersecurity', 'game-development',

  // Contest-specific useful tags
  'award', 'fellowship', 'scholarship', 'grant',
  'hackathon', 'olympiad', 'bootcamp',

  // Format tags that have filtering value
  'open-call', 'pitch-competition', 'competition',

  // Travel/documentary
  'documentary', 'short-film', 'animation',
]);

/* ============================================================
   TAG TYPE BUCKETS — for type diversity enforcement
============================================================ */

const TAG_TYPES = {
  theme: new Set([
    'climate', 'social-impact', 'ocean', 'gender-equality',
    'food-security', 'food', 'biodiversity', 'conservation',
    'sustainability', 'environment', 'renewable-energy',
    'climate-justice', 'peace', 'democracy', 'human-rights',
    'migration', 'inclusion', 'diversity', 'empowerment',
    'cultural-heritage', 'civic-engagement', 'community',
    'governance', 'education', 'health', 'water',
    'agriculture', 'capacity-building', 'leadership',
    'humanitarian', 'disability', 'lgbtq', 'minority',
    'indigenous', 'sdgs', 'poverty-alleviation',
    'economic-growth', 'digital-inclusion',
    'food', 'water', 'sanitation', 'pollution',
    'ai-ethics', 'digital-access', 'ethics',
    'gender-equality', 'human-rights',
  ]),

  domain: new Set([
    'short-film', 'documentary', 'animation', 'experimental',
    'film', 'screenwriting', 'cinematography',
    'photography', 'portrait', 'landscape', 'street',
    'photojournalism', 'astrophotography',
    'painting', 'sculpture', 'printmaking', 'drawing',
    'illustration', 'calligraphy', 'textiles',
    'graphic-design', 'branding', 'typography',
    'ui-ux', 'product-design', 'industrial-design',
    'furniture-design', 'interior-design', 'fashion',
    'architecture', 'urban', 'landscape-architecture',
    'ai', 'machine-learning', 'data-science',
    'robotics', 'programming', 'engineering',
    'hardware', 'blockchain', 'web3', 'gaming',
    'music', 'composition', 'podcast', 'audio',
    'poetry', 'fiction', 'nonfiction', 'essay',
    'writing', 'journalism', 'graphic-novel',
    'comics', 'manga', 'literature',
    'mathematics', 'physics', 'chemistry', 'biology',
    'astronomy', 'geology', 'science', 'research',
    'fine-art', 'contemporary-art', 'digital-art',
    'mixed-media', 'abstract', 'conceptual',
    'still-life', 'monochrome', 'shadow', 'night',
    'color', 'texture', 'light',
    'street', 'portrait', 'landscape',
    'documentary', 'fiction', 'nonfiction',
    'creative-writing', 'poetry', 'haiku', 'flash-fiction',
    'chapbook', 'essay', 'screenwriting', 'playwriting',
    'spoken-word', 'theater', 'dance',
    'photography', 'illustration', 'animation',
    'film', 'podcast', 'award', 'publication',
    'coding', 'programming', 'data-science',
  ]),

  format: new Set([
    'oscar-qualifying', 'biennial', 'residency',
    'solo-show', 'online-exhibition',
    'pitch-competition', 'pitch', 'open-call', 'juried',
    'hackathon', 'bootcamp', 'olympiad',
    'fellowship', 'scholarship', 'grant', 'internship',
    'accelerator', 'incubator', 'prototype',
    'competition', 'pitch-competition', 'pitch-battle',
    'portfolio-review', 'curation', 'gallery',
  ]),

  audience: new Set([
    'women-in-stem', 'emerging-artists', 'early-career',
    'women-in-tech', 'women-in-art', 'women',
    'women-entrepreneurs', 'student', 'youth', 'seniors',
    'postgraduate', 'undergraduate', 'girls-in-tech',
    'black-owned', 'black-founders', 'minority',
    'lgbtq', 'diaspora', 'immigrant-founders',
    'young-writers', 'young-artists', 'independent-creators',
    'startup', 'children', 'families',
  ]),

  'prize-type': new Set([
    'exhibition', 'publication', 'mentorship',
    'aws-credits', 'travel-grant', 'residency',
    'seed-capital', 'co-financing', 'grant-funding',
    'equity-free', 'charity-donation', 'prize-money',
    'certification', 'scholarship', 'fellowship',
    'startup', 'award', 'grant', 'funding',
    'portfolio', 'magazine', 'cover-art', 'poster',
    'publication', 'exhibition', 'solo-show',
    'online-exhibition', 'gallery', 'curation',
  ]),
};

/**
 * Determine the type bucket for a normalized tag.
 * @param {string} tag - A normalized tag string
 * @returns {'theme' | 'domain' | 'format' | 'audience' | 'prize-type' | 'unknown'}
 */
function getTagType(tag) {
  for (const [type, tagSet] of Object.entries(TAG_TYPES)) {
    if (tagSet.has(tag)) return type;
  }
  return 'unknown';
}

/* ============================================================
   CORE NORMALIZATION FUNCTIONS
============================================================ */

/**
 * Normalize a single tag: lowercase + hyphenate spaces + strip special chars.
 * @param {string} tag - Raw tag string
 * @returns {string|null} Normalized tag or null if invalid
 */
function normalizeTag(tag) {
  if (!tag || typeof tag !== 'string') return null;
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Full tag normalization pipeline for an array of contest tags.
 *
 * Pipeline order:
 *   1. Normalize (lowercase + hyphenate)
 *   2. Deduplicate
 *   3. Extract keep-listed tags (protect from consolidation + removal)
 *   4. Consolidate variants via CONSOLIDATION_MAP
 *   5. Remove deny-listed tags
 *   6. Remove location tags
 *   7. Merge back keep-listed + filtered, re-dedup
 *   8. Remove tags overlapping with category
 *   9. Remove tags overlapping with filterKeys
 *  10. Keep max 3 with type diversity
 *  11. Remove short tags (≤ 2 chars)
 *  12. Final dedup
 *
 * @param {string[]} tags - Raw tags array
 * @param {string} category - Canonical category string (e.g. "Creative Arts")
 * @param {object} filterKeys - filterKeys sub-document (themes, format, medium, domain)
 * @returns {string[]} Normalized tags (max 3)
 */
function normalizeTags(tags, category, filterKeys) {
  if (!Array.isArray(tags) || tags.length === 0) return [];

  // Step 1: Normalize each tag
  let normalized = tags
    .map(normalizeTag)
    .filter(Boolean);

  // Step 2: Deduplicate
  normalized = [...new Set(normalized)];

  // Step 3: Extract keep-listed tags (preserve them from consolidation + removal)
  const keepListed = normalized.filter(t => TAG_KEEP_LIST.has(t));
  const nonKeep = normalized.filter(t => !TAG_KEEP_LIST.has(t));

  // Step 4: Apply consolidation map
  const consolidated = nonKeep.map(t => CONSOLIDATION_MAP[t] || t);

  // Step 5: Remove deny-listed tags
  let filtered = consolidated.filter(t => !TAG_DENY_LIST.has(t));

  // Step 6: Remove location tags
  filtered = filtered.filter(t => !TAG_LOCATION_REMOVE.has(t));

  // Step 7: Merge back keep-listed + filtered, re-dedup
  normalized = [...keepListed, ...filtered];
  normalized = [...new Set(normalized)];

  // Step 8: Remove category-overlapping tags
  const categoryLower = (category || '').toLowerCase().trim();
  const categoryWords = new Set(
    categoryLower.split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2)
  );

  normalized = normalized.filter(t => {
    if (t === categoryLower) return false;
    if (categoryWords.has(t)) return false;
    const tWords = t.split('-').filter(w => w.length > 2);
    for (const w of tWords) {
      if (categoryWords.has(w)) return false;
    }
    return true;
  });

  // Step 9: Remove tags that appear in filterKeys
  if (filterKeys) {
    const filterValues = new Set();
    if (Array.isArray(filterKeys.themes)) {
      filterKeys.themes.forEach(t => filterValues.add(t.toLowerCase().replace(/\s+/g, '-')));
    }
    if (Array.isArray(filterKeys.format)) {
      filterKeys.format.forEach(f => filterValues.add(f.toLowerCase().replace(/\s+/g, '-')));
    }
    if (Array.isArray(filterKeys.medium)) {
      filterKeys.medium.forEach(m => filterValues.add(m.toLowerCase().replace(/\s+/g, '-')));
    }
    if (filterKeys.domain) {
      filterValues.add(filterKeys.domain.toLowerCase().replace(/\s+/g, '-'));
    }
    normalized = normalized.filter(t => !filterValues.has(t));
  }

  // Step 10: Keep max 3 with type diversity
  let selected = [];
  const usedTypes = new Set();
  const typeBuckets = ['theme', 'domain', 'format', 'audience', 'prize-type'];

  // Pass 1: one from each type bucket
  for (const bucket of typeBuckets) {
    const candidates = normalized.filter(t => !usedTypes.has(t) && getTagType(t) === bucket);
    if (candidates.length > 0) {
      selected.push(candidates[0]);
      usedTypes.add(candidates[0]);
    }
    if (selected.length >= 3) break;
  }

  // Pass 2: fill remaining with 'unknown' type tags
  if (selected.length < 3) {
    const unknowns = normalized.filter(t => !usedTypes.has(t) && getTagType(t) === 'unknown');
    for (const t of unknowns) {
      selected.push(t);
      usedTypes.add(t);
      if (selected.length >= 3) break;
    }
  }

  // Pass 3: any remaining unused tags
  if (selected.length < 3) {
    for (const t of normalized) {
      if (!usedTypes.has(t)) {
        selected.push(t);
        usedTypes.add(t);
        if (selected.length >= 3) break;
      }
    }
  }

  // Step 11: Remove short tags
  selected = selected.filter(t => t.length > 2);

  // Step 12: Final dedup
  return [...new Set(selected)];
}

/**
 * Build the Mongoose-compatible update object for a contest document.
 * @param {object} doc - Contest document (plain object or Mongoose doc)
 * @returns {object|null} Mongoose update object or null if no changes needed
 */
function buildTagUpdate(doc) {
  const rawCat = (doc.category || '');
  const canonical = mapCanonicalCategory(rawCat);
  const subCat = mapSubcategory(rawCat);
  const normalized = normalizeTags(
    doc.tags,
    canonical,
    doc.filterKeys
  );

  const originalTags = (doc.tags || []).map(t => String(t)).sort();
  const newTags = normalized.sort();
  const tagsChanged = JSON.stringify(originalTags) !== JSON.stringify(newTags);

  const needsCategoryUpdate = !!(rawCat) && doc.category !== canonical;
  const needsSubCategory = doc.subCategory !== subCat;

  const $set = {};
  if (tagsChanged) $set.tags = normalized;
  if (needsCategoryUpdate) $set.category = canonical;
  if (needsSubCategory) $set.subCategory = subCat;

  if (Object.keys($set).length === 0) return null;
  return { $set };
}

module.exports = {
  // Functions
  normalizeTag,
  normalizeTags,
  mapCanonicalCategory,
  mapSubcategory,
  getTagType,
  buildTagUpdate,

  // Mapping tables (exported for external use / inspection)
  CATEGORY_MAP,
  SUBCATEGORY_MAP,
  CANONICAL_CATEGORY_LIST,
  CONSOLIDATION_MAP,
  TAG_DENY_LIST,
  TAG_LOCATION_REMOVE,
  TAG_KEEP_LIST,
  TAG_TYPES,
};

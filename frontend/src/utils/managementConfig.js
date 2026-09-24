/**
 * Management Configuration & Style Guide
 * 
 * This file defines standardized terminology, icons, and configurations for all
 * management section pages to ensure a consistent, professional admin experience.
 */

// ============================================================================
// TERMINOLOGY STANDARDS
// ============================================================================

export const TERMINOLOGY = {
  // Action verbs - use consistently across all pages
  actions: {
    create: 'Create',
    add: 'Add',
    edit: 'Edit',
    update: 'Update',
    save: 'Save',
    delete: 'Delete',
    archive: 'Archive',
    restore: 'Restore',
    suspend: 'Suspend',
    ban: 'Ban',
    activate: 'Activate',
    deactivate: 'Deactivate',
    refresh: 'Refresh',
    export: 'Export',
    search: 'Search',
    filter: 'Filter',
    clear: 'Clear',
    cancel: 'Cancel',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    view: 'View',
    preview: 'Preview',
    publish: 'Publish',
    unpublish: 'Unpublish',
  },

  // Status labels - use consistently
  status: {
    active: 'Active',
    inactive: 'Inactive',
    archived: 'Archived',
    deleted: 'Deleted',
    pending: 'Pending',
    published: 'Published',
    draft: 'Draft',
    scheduled: 'Scheduled',
    open: 'Open',
    closed: 'Closed',
    verified: 'Verified',
    trusted: 'Trusted',
    new: 'New',
    banned: 'Banned',
    suspended: 'Suspended',
    restored: 'Restored',
  },

  // Page titles - standardized naming convention
  // Format: "[Entity] Manager" or "[Entity] Management"
  pageTitles: {
    categories: 'Category Manager',
    contestCategories: 'Contest Category Manager',
    eventTypes: 'Event Type Manager',
    users: 'User Manager',
    comments: 'Comment Moderation',
    images: 'Media Library',
    contests: 'Contest Manager',
    contestDetails: 'Contest Details',
    contestImages: 'Contest Image Health',
    events: 'Event Manager',
    eventDetails: 'Event Details',
    eventImages: 'Event Images',
    reviewQueue: 'Review Queue',
    prompts: 'Pipeline Prompts',
    editorial: 'Editorial Queue',
    posts: 'Submissions',
    published: 'Live Posts',
    analytics: 'Analytics',
    activity: 'Activity Log',
    settings: 'Settings',
    dashboard: 'Dashboard',
  },

  // Descriptions/subtitles
  descriptions: {
    categories: 'Manage and organize post categories',
    contestCategories: 'Manage and organize contest categories',
    eventTypes: 'Manage and organize event types',
    users: 'Manage user accounts and permissions',
    comments: 'Review and moderate user comments',
    images: 'Manage media library and assets',
    contests: 'Manage contests and competitions',
    events: 'Manage events and conferences',
  },
};

// ============================================================================
// ICON STANDARDS
// ============================================================================

export const ICONS = {
  // Entity icons
  categories: { icon: 'Tag', label: 'Categories' },
  contestCategories: { icon: 'Trophy', label: 'Contest Categories' },
  eventTypes: { icon: 'CalendarDays', label: 'Event Types' },
  users: { icon: 'Users', label: 'Users' },
  comments: { icon: 'MessageSquare', label: 'Comments' },
  images: { icon: 'Image', label: 'Images' },
  contests: { icon: 'Trophy', label: 'Contests' },
  events: { icon: 'CalendarDays', label: 'Events' },

  // Action icons
  actions: {
    create: 'Plus',
    add: 'Plus',
    edit: 'Edit3',
    update: 'Edit3',
    save: 'Save',
    delete: 'Trash2',
    archive: 'Archive',
    restore: 'RotateCcw',
    suspend: 'PauseCircle',
    ban: 'Ban',
    activate: 'CheckCircle',
    deactivate: 'XCircle',
    refresh: 'RefreshCw',
    export: 'Download',
    search: 'Search',
    filter: 'Filter',
    clear: 'X',
    view: 'Eye',
    preview: 'Eye',
    drag: 'GripVertical',
  },

  // Status icons
  status: {
    active: { icon: 'CheckCircle', color: 'text-emerald-600' },
    inactive: { icon: 'Circle', color: 'text-neutral-400' },
    archived: { icon: 'Archive', color: 'text-amber-600' },
    deleted: { icon: 'Trash2', color: 'text-red-600' },
    pending: { icon: 'Clock', color: 'text-blue-600' },
    published: { icon: 'CheckCircle', color: 'text-emerald-600' },
    draft: { icon: 'FileText', color: 'text-neutral-500' },
    open: { icon: 'Circle', color: 'text-emerald-600' },
    closed: { icon: 'Circle', color: 'text-neutral-500' },
    verified: { icon: 'ShieldCheck', color: 'text-blue-600' },
    trusted: { icon: 'ShieldCheck', color: 'text-emerald-600' },
    banned: { icon: 'Ban', color: 'text-red-600' },
    suspended: { icon: 'PauseCircle', color: 'text-amber-600' },
  },
};

// ============================================================================
// COLOR STANDARDS
// ============================================================================

export const COLORS = {
  // Status colors
  status: {
    active: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    inactive: {
      bg: 'bg-neutral-500/10',
      border: 'border-neutral-500/15',
      text: 'text-neutral-500 dark:text-neutral-400',
    },
    archived: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
    },
    deleted: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/15',
      text: 'text-red-600 dark:text-red-400',
    },
    pending: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/15',
      text: 'text-blue-600 dark:text-blue-400',
    },
    published: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    draft: {
      bg: 'bg-neutral-500/10',
      border: 'border-neutral-500/15',
      text: 'text-neutral-500 dark:text-neutral-400',
    },
    verified: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/15',
      text: 'text-blue-600 dark:text-blue-400',
    },
    trusted: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    banned: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/15',
      text: 'text-red-600 dark:text-red-400',
    },
    suspended: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
    },
  },

  // Preset color palettes for categorization
  presetColors: {
    categories: ['#6366f1', '#2bd47a', '#f5a53a', '#f04340', '#ec4899', '#00f0ff', '#8b5cf6', '#f97316'],
    contestCategories: ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#14b8a6', '#78716c'],
    eventTypes: ['#3b82f6', '#8b5cf6', '#06b6d4', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444', '#14b8a6', '#ec4899', '#22c55e', '#e11d48'],
  },
};

// ============================================================================
// TABLE CONFIGURATION
// ============================================================================

export const TABLE_CONFIG = {
  // Default column widths for consistency
  columnWidths: {
    sort: '8%',
    name: '30%',
    slug: '20%',
    description: '25%',
    status: '10%',
    usage: '10%',
    actions: '10%',
    date: '15%',
    user: '25%',
    comment: '45%',
    post: '20%',
  },

  // Table styles
  styles: {
    header: 'bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider select-none',
    row: 'px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-xs',
    divider: 'divide-y divide-neutral-150 dark:divide-white/5',
    container: 'bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]',
  },
};

// ============================================================================
// PAGE LAYOUT CONFIGURATION
// ============================================================================

export const LAYOUT = {
  page: 'h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20 selection:bg-neutral-200/50 dark:selection:bg-neutral-400/40',
  header: 'shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm',
  statsGrid: 'shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  content: 'flex-1 overflow-y-auto px-6 pb-6',
  emptyState: 'bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm',
};

// ============================================================================
// DATE & NUMBER FORMATTING
// ============================================================================

export const FORMATTERS = {
  date: (dateStr, options = {}) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options,
      });
    } catch {
      return '—';
    }
  },

  dateTime: (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  },

  number: (num) => {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString();
  },

  bytes: (bytes) => {
    if (!bytes || bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  },
};

// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

export const ANIMATIONS = {
  itemVariants: {
    hidden: { opacity: 0, y: 6 },
    visible: (i = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.01 * i,
        duration: 0.3,
        ease: [0.23, 1, 0.32, 1],
      },
    }),
  },

  drawer: {
    backdrop: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    },
    panel: {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
      transition: { type: 'spring', damping: 25, stiffness: 220 },
    },
  },

  dialog: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { type: 'spring', damping: 26, stiffness: 320 },
  },
};

// ============================================================================
// EXPORT
// ============================================================================

export default {
  TERMINOLOGY,
  ICONS,
  COLORS,
  TABLE_CONFIG,
  LAYOUT,
  FORMATTERS,
  ANIMATIONS,
};

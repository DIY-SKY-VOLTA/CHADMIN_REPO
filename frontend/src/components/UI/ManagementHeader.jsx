import { motion } from 'framer-motion';

/**
 * ManagementHeader - Standardized header for all management pages
 * 
 * Provides consistent styling for page titles, subtitles, and action buttons
 * 
 * @param {Object} props
 * @param {string} props.title - Main page title
 * @param {string} props.subtitle - Descriptive subtitle (shown when data is loaded)
 * @param {string} props.emptySubtitle - Subtitle shown when no data exists
 * @param {React.ReactNode} props.actions - Action buttons (typically Refresh + Add)
 * @param {boolean} props.isLoading - Whether data is currently loading
 * @param {number} props.itemCount - Number of items (for dynamic subtitle)
 * @param {string} props.itemType - Type of items (e.g., "categories", "users")
 */
const ManagementHeader = ({
  title,
  subtitle,
  emptySubtitle,
  actions,
  isLoading,
  itemCount = 0,
  itemType = 'items'
}) => {
  return (
    <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-[#121214]/40 backdrop-blur-sm">
      <div>
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          {title}
        </h1>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
          {itemCount > 0
            ? (subtitle || `Manage ${itemCount} ${itemType}`)
            : (emptySubtitle || `No ${itemType} found. Create your first ${itemType === itemType.slice(0, -1) ? itemType.slice(0, -1) : itemType}.`)}
        </p>
      </div>
      <div className="flex gap-2">
        {actions}
      </div>
    </div>
  );
};

export default ManagementHeader;

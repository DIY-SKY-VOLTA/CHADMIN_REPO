import { motion } from 'framer-motion';

/**
 * StatCard - Standardized statistic card for management dashboards
 * 
 * Displays a metric with an icon, label, and value in a consistent card format
 * 
 * @param {Object} props
 * @param {string} props.label - The label/title of the statistic
 * @param {string|number} props.value - The numeric value to display
 * @param {React.ComponentType} props.icon - Lucide icon component
 * @param {string} props.iconColor - Tailwind text color class for the icon (e.g., 'text-blue-600')
 * @param {string} props.iconBg - Tailwind background color class for the icon container
 * @param {string} props.className - Additional classes for the card container
 */
const StatCard = ({
  label,
  value,
  icon: Icon,
  iconColor = 'text-neutral-500',
  iconBg = 'bg-neutral-100 dark:bg-neutral-800/50',
  className = ''
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 p-4 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-center justify-between group hover:border-neutral-300 dark:hover:border-neutral-800 transition-all ${className}`}
    >
      <div className="space-y-1">
        <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
          {label}
        </span>
        <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100 leading-none">
          {value}
        </p>
      </div>
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center ${iconColor}`}>
        <Icon size={15} strokeWidth={1.5} />
      </div>
    </motion.div>
  );
};

export default StatCard;

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * ActionButton - Standardized button for management page actions
 * 
 * Provides consistent styling for primary, secondary, and destructive actions
 * 
 * @param {Object} props
 * @param {string} props.variant - 'primary' | 'secondary' | 'danger' | 'ghost'
 * @param {React.ReactNode} props.children - Button content
 * @param {boolean} props.isLoading - Whether the button is in a loading state
 * @param {React.ComponentType} props.icon - Optional icon component (Lucide)
 * @param {string} props.iconPlacement - 'left' | 'right' (default: 'left')
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'sm')
 */
const ActionButton = forwardRef(({
  variant = 'secondary',
  children,
  isLoading = false,
  icon: Icon,
  iconPlacement = 'left',
  size = 'sm',
  className = '',
  ...props
}, ref) => {
  // Variant styles
  const variantStyles = {
    primary: 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 shadow-sm',
    secondary: 'border border-neutral-200 dark:border-white/5 bg-white dark:bg-[#18181b] text-neutral-500 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-white/5',
    danger: 'text-red-650 dark:text-red-400 hover:bg-red-500/10 hover:text-red-650 dark:hover:text-red-400',
    dangerSolid: 'bg-red-500 hover:bg-red-650 text-white shadow-sm',
    ghost: 'text-neutral-400 hover:text-neutral-750 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5',
  };

  // Size styles
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs font-semibold',
    md: 'px-4 py-2 text-sm font-semibold',
    lg: 'px-6 py-3 text-base font-semibold',
  };

  const baseClasses = `rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5`;
  const variantClass = variantStyles[variant] || variantStyles.secondary;
  const sizeClass = sizeStyles[size] || sizeStyles.sm;

  return (
    <button
      ref={ref}
      type="button"
      className={`${baseClasses} ${variantClass} ${sizeClass} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === 'lg' ? 16 : size === 'md' ? 14 : 12} className="animate-spin" />
      ) : (
        <>
          {Icon && iconPlacement === 'left' && <Icon size={size === 'lg' ? 16 : size === 'md' ? 14 : 12} />}
          {children}
          {Icon && iconPlacement === 'right' && <Icon size={size === 'lg' ? 16 : size === 'md' ? 14 : 12} />}
        </>
      )}
    </button>
  );
});

ActionButton.displayName = 'ActionButton';

export default ActionButton;

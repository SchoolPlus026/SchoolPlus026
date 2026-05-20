import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle } from 'lucide-react';

/**
 * MotionButton — A Framer Motion enhanced button.
 * 
 * Props:
 *   - children: button label/content
 *   - isPending: shows spinner when true
 *   - isSuccess: shows checkmark briefly when true
 *   - onClick, disabled, type, className, style: standard button props
 *   - tapScale: scale on tap (default 0.95)
 *   - hoverScale: scale on hover (default 1.03)
 */
export default function MotionButton({
  children,
  isPending = false,
  isSuccess = false,
  onClick,
  disabled,
  type = 'button',
  className = '',
  style = {},
  tapScale = 0.95,
  hoverScale = 1.03,
}) {
  const isDisabled = disabled || isPending;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
      whileTap={{ scale: isDisabled ? 1 : tapScale }}
      whileHover={{ scale: isDisabled ? 1 : hoverScale }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isPending ? (
          <motion.span
            key="pending"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Loader2 size={16} className="animate-spin" />
            <span>Loading...</span>
          </motion.span>
        ) : isSuccess ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <CheckCircle size={16} />
            <span>Done!</span>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

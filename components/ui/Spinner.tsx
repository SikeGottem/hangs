// Spinner: a spinning Loader2 icon; stops spinning under reduced motion.
import { Loader2 } from 'lucide-react'
import { cx } from './cx'

export function Spinner({ size = 16, className }: { size?: 16 | 20; className?: string }) {
  return <Loader2 aria-hidden size={size} className={cx('animate-spin motion-reduce:animate-none', className)} />
}

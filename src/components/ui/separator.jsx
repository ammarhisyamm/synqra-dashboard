import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return <SeparatorPrimitive.Root decorative={decorative} orientation={orientation} className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full', className)} {...props} />;
}

export { Separator };

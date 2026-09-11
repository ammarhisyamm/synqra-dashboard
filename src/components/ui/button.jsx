import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'ui-focus-ring inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] px-3 text-[13px] font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[#25334a]',
        secondary: 'border border-border bg-card text-foreground hover:bg-muted',
        outline: 'border border-border bg-card text-foreground hover:border-[#c9d5e3] hover:bg-muted',
        ghost: 'text-secondary-foreground hover:bg-muted hover:text-foreground',
        destructive: 'border border-[#efc4c4] bg-card text-destructive hover:bg-[#fff1f1]',
      },
      size: {
        sm: 'min-h-8 rounded-[6px] px-2.5 text-xs',
        default: 'min-h-9',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };

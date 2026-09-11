import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      success: 'border-[#c5ead9] bg-[#edf8f3] text-[#248764]',
      warning: 'border-[#f0d7ad] bg-[#fff7ea] text-[#a76d2a]',
      danger: 'border-[#efc4c4] bg-[#fff1f1] text-destructive',
      info: 'border-[#c9daf6] bg-[#eff5ff] text-[#315fa8]',
      neutral: 'border-border bg-muted text-secondary-foreground',
      outline: 'border-border bg-card text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

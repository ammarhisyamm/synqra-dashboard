import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

function Checkbox({ className, ...props }) {
  return <CheckboxPrimitive.Root className={cn('ui-focus-ring peer size-4 shrink-0 rounded-[5px] border border-input bg-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)} {...props}>
    <CheckboxPrimitive.Indicator className="grid place-items-center"><Check size={12} weight="bold" /></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
}

export { Checkbox };

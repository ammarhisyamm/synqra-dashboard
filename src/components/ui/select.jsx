import * as SelectPrimitive from '@radix-ui/react-select';
import { CaretDown, Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;
const SelectTrigger = ({ className, children, ...props }) => <SelectPrimitive.Trigger className={cn('ui-focus-ring flex min-h-10 w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-input bg-background px-3 text-sm text-foreground', className)} {...props}>{children}<SelectPrimitive.Icon><CaretDown size={15} /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
const SelectContent = ({ className, children, position = 'popper', ...props }) => <SelectPrimitive.Portal><SelectPrimitive.Content position={position} className={cn('z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius)] border border-border bg-popover p-1 text-popover-foreground shadow-lg', className)} {...props}><SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>;
const SelectItem = ({ className, children, ...props }) => <SelectPrimitive.Item className={cn('ui-focus-ring relative flex min-h-9 w-full cursor-default select-none items-center rounded-[6px] py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}><span className="absolute left-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check size={14} /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>;
const SelectLabel = ({ className, ...props }) => <SelectPrimitive.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
const SelectSeparator = ({ className, ...props }) => <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator };

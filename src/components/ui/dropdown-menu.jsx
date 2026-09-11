import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuItem = ({ className, inset, ...props }) => <DropdownMenuPrimitive.Item className={cn('ui-focus-ring relative flex min-h-9 cursor-default select-none items-center gap-2 rounded-[6px] px-2.5 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50', inset && 'pl-8', className)} {...props} />;
const DropdownMenuSeparator = ({ className, ...props }) => <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
const DropdownMenuContent = ({ className, sideOffset = 4, ...props }) => <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn('z-50 min-w-40 overflow-hidden rounded-[var(--radius)] border border-border bg-popover p-1 text-popover-foreground shadow-lg', className)} {...props} /></DropdownMenuPrimitive.Portal>;

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuContent };

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
function TooltipContent({ className, sideOffset = 4, ...props }) { return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn('z-50 rounded-[6px] bg-primary px-2.5 py-1.5 text-xs text-primary-foreground shadow-md', className)} {...props} /></TooltipPrimitive.Portal>; }

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };

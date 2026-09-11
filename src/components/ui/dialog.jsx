import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({ className, ...props }) {
  return <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-[#111b3078]', className)} {...props} />;
}

function DialogContent({ className, children, showClose = true, ...props }) {
  return <DialogPortal><DialogOverlay /><DialogPrimitive.Content className={cn('ui-focus-ring fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[var(--radius)] border border-border bg-card p-7 text-card-foreground shadow-xl', className)} {...props}>
    {children}
    {showClose && <DialogPrimitive.Close aria-label="Close dialog" className="ui-focus-ring absolute right-4 top-4 grid size-8 place-items-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground"><X size={17} /></DialogPrimitive.Close>}
  </DialogPrimitive.Content></DialogPortal>;
}

function DialogHeader({ className, ...props }) { return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />; }
function DialogTitle({ className, ...props }) { return <DialogPrimitive.Title className={cn('text-balance text-xl font-medium tracking-normal', className)} {...props} />; }
function DialogDescription({ className, ...props }) { return <DialogPrimitive.Description className={cn('text-pretty text-sm leading-relaxed text-muted-foreground', className)} {...props} />; }
function DialogFooter({ className, ...props }) { return <div className={cn('flex items-center justify-end gap-2', className)} {...props} />; }

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };

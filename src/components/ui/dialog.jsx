import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

let pointerTrigger = null;
// WebKit does not always focus buttons clicked with a pointer. Preserve the
// actual opener rather than returning focus to a previously focused input.
export function useDialogFocusTracking() {
  useEffect(() => {
    const pointer = event => { pointerTrigger = event.target instanceof Element ? event.target.closest('button:not(:disabled),a[href],input,textarea,select,[tabindex]') : null; };
    const keyboard = () => { pointerTrigger = null; };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', keyboard, true); pointerTrigger = null; };
  }, []);
}

function DialogOverlay({ className, ...props }) {
  return <DialogPrimitive.Overlay className={cn('ui-dialog-overlay fixed inset-0 z-[90] bg-[#111b3078]', className)} {...props} />;
}

function DialogContent({ className, children, showClose = true, closeDisabled = false, style, ...props }) {
  const returnFocus = useRef(pointerTrigger?.isConnected ? pointerTrigger : document.activeElement);
  return <DialogPortal><div className="ui-dialog-layer"><DialogOverlay /><DialogPrimitive.Content onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }} className={cn('ui-dialog-content ui-focus-ring relative z-[91] grid w-[calc(100%-32px)] max-w-[520px] gap-4 rounded-[var(--radius)] border border-border bg-card p-6 text-card-foreground shadow-xl', className)} style={{ ...style, position: 'relative', inset: 'auto', transform: 'none', translate: '0 0' }} {...props}>
    {children}
    {showClose && <DialogPrimitive.Close disabled={closeDisabled} aria-label="Close dialog" className="ui-focus-ring absolute right-4 top-4 grid size-8 place-items-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground"><X size={17} /></DialogPrimitive.Close>}
  </DialogPrimitive.Content></div></DialogPortal>;
}

function DialogHeader({ className, ...props }) { return <div data-slot="dialog-header" className={cn('flex flex-col gap-2 text-left', className)} {...props} />; }
function DialogTitle({ className, ...props }) { return <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-balance text-xl font-medium tracking-normal', className)} {...props} />; }
function DialogDescription({ className, ...props }) { return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-pretty text-sm leading-relaxed text-muted-foreground', className)} {...props} />; }
function DialogFooter({ className, ...props }) { return <div data-slot="dialog-footer" className={cn('flex items-center justify-end gap-2', className)} {...props} />; }

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };

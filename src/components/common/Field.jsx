import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { cn } from '@/lib/utils';
import { useId } from 'react';

export function Field({ label, icon: Icon, hint, hintId, children, className = '' }) {
  return (
    <div className={cn('field', className)}><label className="field-control">
      {label && <span className="field-label">{Icon && <Icon size={14} aria-hidden="true" />}{label}</span>}
      {children}
    </label>{hint && <small id={hintId} className="field-hint">{hint}</small>}</div>
  );
}

export function TextField({ label, icon, hint, className = '', ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <Field label={label} icon={icon} hint={hint} hintId={`${id}-hint`} className={className}>
      <Input className="field-input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} id={id} />
    </Field>
  );
}

export function TextAreaField({ label, icon, hint, rows = 3, className = '', ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <Field label={label} icon={icon} hint={hint} hintId={`${id}-hint`} className={className}>
      <Textarea className="field-input" rows={rows} aria-describedby={hint ? `${id}-hint` : undefined} {...props} id={id} />
    </Field>
  );
}

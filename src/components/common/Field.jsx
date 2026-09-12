import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { cn } from '@/lib/utils';

export function Field({ label, icon: Icon, hint, children, className = '' }) {
  return (
    <label className={cn('field', className)}>
      {label && <span className="field-label">{Icon && <Icon size={14} aria-hidden="true" />}{label}</span>}
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function TextField({ label, icon, hint, className = '', ...props }) {
  return (
    <Field label={label} icon={icon} hint={hint} className={className}>
      <Input className="field-input" {...props} />
    </Field>
  );
}

export function TextAreaField({ label, icon, hint, rows = 3, className = '', ...props }) {
  return (
    <Field label={label} icon={icon} hint={hint} className={className}>
      <Textarea className="field-input" rows={rows} {...props} />
    </Field>
  );
}

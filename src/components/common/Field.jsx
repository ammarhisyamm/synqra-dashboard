export function Field({ label, icon: Icon, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`.trim()}>
      {label && <span className="field-label">{Icon && <Icon size={14} />}{label}</span>}
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function TextField({ label, icon, hint, className = '', ...props }) {
  return (
    <Field label={label} icon={icon} hint={hint} className={className}>
      <input className="field-input" {...props} />
    </Field>
  );
}

export function TextAreaField({ label, icon, hint, rows = 3, className = '', ...props }) {
  return (
    <Field label={label} icon={icon} hint={hint} className={className}>
      <textarea className="field-input" rows={rows} {...props} />
    </Field>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';

function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MultiCheckSelect({ values = [], options = [], onChange, ariaLabel, placeholder = 'Select…', className = '', icon: Icon, prefix, renderOption, emptyLabel = 'No options' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = Array.isArray(values) ? values.map(String) : [];

  const items = options.map(option =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value ?? option.id, label: option.label ?? option.name ?? String(option.value), color: option.color, hint: option.hint }
  );

  const toggle = value => {
    const key = String(value);
    const next = selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
    onChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open ]);

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? items.find(item => String(item.value) === selected[0])?.label || placeholder
      : `${selected.length} selected`;

  return (
    <div className={`app-select app-multi-select ${className}`.trim()} ref={containerRef}>
      <button
        type="button"
        className={`app-select-trigger ${open ? 'open' : ''} ${selected.length ? 'has-value' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(prev => !prev)}
      >
        {prefix}
        {Icon && <Icon size={15} className="app-select-icon" />}
        <span className="app-select-label">{label}</span>
        {selected.length > 1 && <span className="app-select-badge">{selected.length}</span>}
        <ChevronDown size={14} className={`app-select-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="app-select-menu app-multi-menu" role="listbox" aria-label={ariaLabel} aria-multiselectable="true">
          <div className="app-multi-head">
            <span>{ariaLabel || placeholder}</span>
            {selected.length > 0 && <button type="button" className="app-multi-clear" onClick={() => onChange([])}>Clear</button>}
          </div>
          {items.length === 0 ? (
            <span className="app-select-empty">{emptyLabel}</span>
          ) : (
            items.map(item => {
              const active = selected.includes(String(item.value));
              return (
                <button
                  type="button"
                  key={item.value}
                  className={`app-select-item app-multi-item ${active ? 'selected' : ''}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(item.value)}
                >
                  <span className={`app-multi-check${active ? ' checked' : ''}`} aria-hidden="true">
                    {active && <Check size={12} weight="bold" />}
                  </span>
                  {renderOption ? renderOption(item, active) : (
                    <span className="app-multi-label">
                      {item.color && <i className="app-multi-dot" style={{ background: item.color }} />}
                      <span>{item.label}</span>
                      {item.hint && <small>{item.hint}</small>}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function AssigneeOption({ name, email, index = 0 }) {
  return (
    <span className="app-multi-label app-multi-assignee">
      <span className={`app-multi-avatar avatar-bg-${index % 3}`}>{initials(name)}</span>
      <span className="app-multi-text"><span>{name}</span>{email && email !== name && <small>{email}</small>}</span>
    </span>
  );
}

export function PriorityOption({ label }) {
  const dot = label === 'Blocker' ? '#e05252' : label === 'Major' ? '#ff7f23' : '#82a1d1';
  return (
    <span className="app-multi-label">
      <i className="app-multi-dot" style={{ background: dot }} />
      <span>{label}</span>
    </span>
  );
}

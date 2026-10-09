import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import './MultiCheckSelect.css';

function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MultiCheckSelect({ values = [], options = [], onChange, ariaLabel, placeholder = 'Select…', className = '', icon: Icon, prefix, renderOption, emptyLabel = 'No options', disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(values) ? values.map(String) : [];

  const items = options.map(option =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { ...option, value: option.value ?? option.id, label: option.label ?? option.name ?? String(option.value) }
  );

  const toggle = value => {
    const key = String(value);
    const next = selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
    onChange(next);
  };

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? items.find(item => String(item.value) === selected[0])?.label || placeholder
      : `${selected.length} selected`;

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
    <div className={cn('app-select app-multi-select', className)}>
      <Menu.Trigger asChild>
      <button
        type="button"
        disabled={disabled}
        className={cn('app-select-trigger ui-focus-ring', open && 'open', selected.length && 'has-value')}
        aria-label={ariaLabel}
      >
        {prefix}
        {Icon && <Icon size={15} className="app-select-icon" />}
        <span className="app-select-label">{label}</span>
        {selected.length > 1 && <span className="app-select-badge">{selected.length}</span>}
        <ChevronDown size={14} className={`app-select-chevron ${open ? 'rotated' : ''}`} />
      </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="app-select-menu app-multi-menu" align="start" sideOffset={8} collisionPadding={16} aria-label={ariaLabel}>
          <div className="app-multi-head">
            <span>{ariaLabel || placeholder}</span>
            {selected.length > 0 && <Menu.Item className="app-multi-clear" onSelect={() => onChange([])}>Clear</Menu.Item>}
          </div>
          {items.length === 0 ? (
            <span className="app-select-empty">{emptyLabel}</span>
          ) : (
            items.map(item => {
              const active = selected.includes(String(item.value));
              return (
                <Menu.CheckboxItem
                  key={item.value}
                  className={`app-select-item app-multi-item ${active ? 'selected' : ''}`}
                  checked={active}
                  onCheckedChange={() => toggle(item.value)}
                  onSelect={event => event.preventDefault()}
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
                </Menu.CheckboxItem>
              );
            })
          )}
        </Menu.Content>
      </Menu.Portal>
    </div>
    </Menu.Root>
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

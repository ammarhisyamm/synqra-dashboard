import { useEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';

export function AppSelect({ value, options = [], onChange, ariaLabel, placeholder = 'Select…', className = '', icon: Icon, badge, prefix }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const items = options.map(option =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value ?? option.id, label: option.label ?? option.name ?? String(option.value) }
  );

  const current = items.find(item => String(item.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <span className={`app-select ${className}`.trim()} ref={containerRef}>
      <button
        type="button"
        className={`app-select-trigger ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
      >
        {prefix}
        {Icon && <Icon size={15} className="app-select-icon" />}
        <span className="app-select-label">{current?.label || placeholder}</span>
        {badge !== undefined && badge !== null && <span className="app-select-badge">{badge}</span>}
        <ChevronDown size={14} className={`app-select-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <span className="app-select-menu">
          {items.length === 0 ? (
            <span className="app-select-empty">No options</span>
          ) : (
            items.map(item => (
              <button
                type="button"
                key={item.value}
                className={`app-select-item ${String(item.value) === String(value) ? 'selected' : ''}`}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
              >
                <span>{item.label}</span>
                {String(item.value) === String(value) && <Check size={14} />}
              </button>
            ))
          )}
        </span>
      )}
    </span>
  );
}


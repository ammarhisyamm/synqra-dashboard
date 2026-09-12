import { useMemo, useState } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export function AppSelect({ value, options = [], onChange, ariaLabel, placeholder = 'Select…', className = '', icon: Icon, badge, prefix }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => options.map(option =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value ?? option.id, label: option.label ?? option.name ?? String(option.value) }
  ), [options]);
  const emptyValue = '__synqra_empty__';
  const selectedValue = value === '' || value === null || value === undefined ? emptyValue : String(value);
  const current = items.find(item => String(item.value) === String(value));

  return (
    <SelectPrimitive.Root value={selectedValue} onValueChange={next => onChange(next === emptyValue ? '' : next)} open={open} onOpenChange={setOpen}>
      <div className={cn('app-select', className)}>
        <SelectPrimitive.Trigger type="button" className={cn('app-select-trigger ui-focus-ring', open && 'open')} aria-label={ariaLabel}>
          {prefix}
          {Icon && <Icon size={15} className="app-select-icon" />}
          <SelectPrimitive.Value placeholder={placeholder}>{current?.label}</SelectPrimitive.Value>
          {badge !== undefined && badge !== null && <span className="app-select-badge">{badge}</span>}
          <SelectPrimitive.Icon><ChevronDown size={14} className={`app-select-chevron ${open ? 'rotated' : ''}`} /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content position="popper" sideOffset={5} className="app-select-menu" aria-label={ariaLabel}>
            <SelectPrimitive.Viewport>
              {items.length === 0 ? <span className="app-select-empty">No options</span> : items.map(item => {
                const itemValue = String(item.value) === '' ? emptyValue : String(item.value);
                return <SelectPrimitive.Item key={itemValue} value={itemValue} className={cn('app-select-item', itemValue === selectedValue && 'selected')}>
                  <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator><Check size={14} /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>;
              })}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </div>
    </SelectPrimitive.Root>
  );
}

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;
const TabsList = ({ className, ...props }) => <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-[var(--radius)] bg-muted p-1', className)} {...props} />;
const TabsTrigger = ({ className, ...props }) => <TabsPrimitive.Trigger className={cn('ui-focus-ring inline-flex min-h-8 items-center justify-center rounded-[6px] px-3 text-sm text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...props} />;
const TabsContent = ({ className, ...props }) => <TabsPrimitive.Content className={cn('ui-focus-ring mt-2', className)} {...props} />;

export { Tabs, TabsList, TabsTrigger, TabsContent };

# Admin Dashboard - Management Section Style Guide

## Overview

This guide defines the standardized patterns, components, and conventions for all management section pages in the admin dashboard. Follow these standards to ensure a consistent, professional admin experience.

**Reference Implementation**: See `Categories.jsx`, `ContestCategories.jsx`, and `EventTypes.jsx` for the canonical implementation of these standards.

---

## Page Structure

All management pages should follow this structure:

```jsx
<div className="h-full flex flex-col bg-neutral-50/30 dark:bg-[#0d0d0f]/20">
  {/* 1. Header */}
  <ManagementHeader title="..." subtitle="..." actions={<>...</>} />
  
  {/* 2. Stats Cards (for list pages) */}
  <div className="shrink-0 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <StatCard label="..." value={...} icon={Icon} iconColor="..." />
    <StatCard label="..." value={...} icon={Icon} iconColor="..." />
    <StatCard label="..." value={...} icon={Icon} iconColor="..." />
    <StatCard label="..." value={...} icon={Icon} iconColor="..." />
  </div>
  
  {/* 3. Control Bar (optional - for search/filter) */}
  <div className="shrink-0 px-6 py-3 border-b border-neutral-200/30 dark:border-white/[0.04]">
    {/* Search, filters, etc. */}
  </div>
  
  {/* 4. Main Content */}
  <div className="flex-1 overflow-y-auto px-6 pb-6">
    {/* Table, Grid, or List */}
  </div>
  
  {/* 5. Slide-over Drawers (optional) */}
  <AnimatePresence>
    {isDrawerOpen && <Drawer ... />}
  </AnimatePresence>
  
  {/* 6. Confirmation Dialogs (optional) */}
  <AnimatePresence>
    {deleteTarget && <ConfirmDialog ... />}
  </AnimatePresence>
</div>
```

---

## Terminology Standards

Use the standardized terminology from `managementConfig.js`:

### Page Titles
| Page | Title | Subtitle Pattern |
|------|-------|-----------------|
| Categories | Category Manager | `Manage ${count} categories` |
| Contest Categories | Contest Category Manager | `Manage ${count} contest categories` |
| Event Types | Event Type Manager | `Manage ${count} event types` |
| Users | User Manager | `Showing ${count} of ${total} users` |
| Comments | Comment Moderation | `Moderate ${count} comment threads` |
| Contests | Contest Manager | `${total} contest${s}` |
| Events | Event Manager | `${total} event${s}` |
| Media Library | Media Library | `Manage ${count} images` |

### Action Verbs
- **Create/Add**: Use "Add" for primary actions, "Create" in dialogs
- **Edit/Update**: Use "Edit" for actions, "Update" for saving
- **Delete/Archive**: Use "Archive" for soft delete, "Delete" for permanent
- **Save**: Always "Save" or "Save Details"
- **Refresh**: Always "Refresh" with `RefreshCw` icon
- **Export**: Always "Export" with `Download` icon
- **Search**: Always "Search" with `Search` icon
- **Cancel**: Always "Cancel"
- **Confirm**: Always "Confirm"

### Status Labels
| Status | Label | Color |
|--------|-------|-------|
| Active | Active | Emerald |
| Inactive | Inactive | Neutral |
| Archived | Archived | Amber |
| Deleted | Deleted | Red |
| Pending | Pending | Blue |
| Published | Published | Emerald |
| Draft | Draft | Neutral |
| Open | Open | Emerald |
| Closed | Closed | Neutral |
| Scheduled | Scheduled | Blue |
| Banned | Banned | Red |
| Suspended | Suspended | Amber |

---

## Icon Standards

Use Lucide icons consistently. See `managementConfig.js` for the complete icon mapping.

### Common Icons
| Purpose | Icon | Size | Stroke |
|---------|------|------|--------|
| Refresh | `RefreshCw` | 12 | 1.5 |
| Add/Create | `Plus` | 13 | 1.5 |
| Edit | `Edit3` | 13 | 1.5 |
| Delete | `Trash2` | 13 | 1.5 |
| Archive | `Archive` | 13 | 1.5 |
| Save | `Save` | 12 | 1.5 |
| Close | `X` | 15 | 1.5 |
| Search | `Search` | 13 | 1.5 |
| Drag Handle | `GripVertical` | 14 | 1.5 |
| User | `User` | 14 | 1.5 |
| Comment | `MessageSquare` | 14 | 1.5 |
| Category | `Tag` | 14 | 1.5 |
| Contest | `Trophy` | 14 | 1.5 |
| Event | `CalendarDays` | 14 | 1.5 |

---

## Color Standards

### Status Colors
Use the color mappings from `managementConfig.js`:

```js
// Active states
bg: 'bg-emerald-500/10'
border: 'border-emerald-500/15'
text: 'text-emerald-600 dark:text-emerald-400'

// Inactive/Neutral states
bg: 'bg-neutral-500/10'
border: 'border-neutral-500/15'
text: 'text-neutral-500 dark:text-neutral-400'

// Warning states
bg: 'bg-amber-500/10'
border: 'border-amber-500/15'
text: 'text-amber-600 dark:text-amber-400'

// Danger/Error states
bg: 'bg-red-500/10'
border: 'border-red-500/15'
text: 'text-red-600 dark:text-red-400'
```

### Preset Color Palettes
For categorization/color-picker features, use the predefined palettes:

```js
// Categories (Blog Post Categories)
const presetColors = ['#6366f1', '#2bd47a', '#f5a53a', '#f04340', '#ec4899', '#00f0ff', '#8b5cf6', '#f97316'];

// Contest Categories
const presetColors = ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#3b82f6', '#14b8a6', '#78716c'];

// Event Types
const presetColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#0ea5e9', '#f59e0b', '#f97316', '#ef4444', '#14b8a6', '#ec4899', '#22c55e', '#e11d48'];
```

---

## Component Standards

### ManagementHeader
Use for all page headers:

```jsx
import { ManagementHeader } from '@/components/UI';

<ManagementHeader
  title="Category Manager"
  subtitle={categories.length > 0 ? `Manage ${categories.length} categories` : 'Create your first category'}
  actions={
    <>
      <button onClick={fetchCategories} className="...">
        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        Refresh
      </button>
      <button onClick={startCreating} className="...">
        <Plus size={13} /> Add Category
      </button>
    </>
  }
/>
```

### StatCard
Use for all statistic cards:

```jsx
import { StatCard } from '@/components/UI';
import { Tag, Layers, Palette } from 'lucide-react';

<StatCard
  label="Total Categories"
  value={totalCategories}
  icon={Tag}
  iconColor="text-neutral-500"
  iconBg="bg-neutral-100 dark:bg-neutral-800/50"
/>

<StatCard
  label="Active Associations"
  value={totalPostCount}
  icon={Layers}
  iconColor="text-emerald-600 dark:text-emerald-400"
  iconBg="bg-emerald-500/10"
/>
```

### ActionButton
Use for consistent action buttons:

```jsx
import { ActionButton } from '@/components/UI';
import { Plus, Trash2 } from 'lucide-react';

<ActionButton variant="primary" icon={Plus}>
  Add Category
</ActionButton>

<ActionButton variant="secondary" icon={Trash2}>
  Delete
</ActionButton>

<ActionButton variant="danger" icon={Trash2}>
  Delete
</ActionButton>

<ActionButton variant="dangerSolid" icon={Trash2}>
  Confirm Delete
</ActionButton>
```

### ConfirmDialog
Use for all destructive actions:

```jsx
import { ConfirmDialog } from '@/components/UI';

<ConfirmDialog
  open={!!deleteTarget}
  onClose={() => setDeleteTarget(null)}
  onConfirm={handleDelete}
  title="Delete Category"
  intent="danger"
  actionIcon="delete"
  confirmLabel="Delete"
  requireText="DELETE"
>
  Permanently delete {deleteTarget?.name}?
</ConfirmDialog>
```

---

## Table Standards

### Column Headers
Use this pattern for table column headers:

```jsx
<div className="bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-2.5 flex items-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider select-none">
  <div className="w-[8%]">Sort</div>
  <div className="w-[30%]">Name</div>
  <div className="w-[20%]">Slug</div>
  <div className="w-[15%]">Status</div>
  <div className="w-[25%]">Description</div>
  <div className="w-[10%] text-right">Actions</div>
</div>
```

### Table Container
```jsx
<div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
  <div className="min-w-full divide-y divide-neutral-200/50 dark:divide-white/5">
    {/* Column Headers */}
    <div className="...">...</div>
    
    {/* Rows */}
    <div className="divide-y divide-neutral-150 dark:divide-white/5">
      {items.map((item, idx) => (
        <TableRow key={item._id} item={item} idx={idx} />
      ))}
    </div>
  </div>
</div>
```

### Table Row
```jsx
<div
  key={item._id}
  draggable={supportsDrag}
  onDragStart={() => handleDragStart(idx)}
  onDragOver={(e) => handleDragOver(e, idx)}
  onDragEnd={handleDragEnd}
  className={`px-5 py-3 flex items-center hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-xs ${
    draggedIdx === idx ? 'opacity-40 bg-neutral-100/50 dark:bg-neutral-900/40 border-dashed border-neutral-300' : ''
  } ${dragOverIdx === idx ? 'border-t-2 border-neutral-450 dark:border-neutral-700 bg-neutral-100/30 dark:bg-white/5' : ''}`}
>
  {/* Cells */}
</div>
```

---

## Drawer Standards

### Slide-over Drawer Structure
```jsx
<AnimatePresence>
  {isDrawerOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setIsDrawerOpen(false)}
        className="fixed inset-0 z-45 bg-black/30 dark:bg-black/60 backdrop-blur-[2px]"
      />
      
      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#151518] border-l border-neutral-200/50 dark:border-white/5 shadow-2xl flex flex-col justify-between overflow-hidden text-xs"
      >
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-neutral-200/50 dark:border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            {isCreating ? 'Create Category' : 'Edit Category'}
          </span>
          <button onClick={() => setIsDrawerOpen(false)} className="...">
            <X size={15} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Form fields */}
        </div>
        
        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-neutral-50/50 dark:bg-neutral-900/30 flex justify-between gap-3">
          <ActionButton variant="primary" isLoading={isSaving} icon={Save}>
            {isCreating ? 'Create' : 'Save'}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setIsDrawerOpen(false)}>
            Cancel
          </ActionButton>
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>
```

---

## Empty State Standards

```jsx
<div className="bg-white dark:bg-[#151518]/40 border border-neutral-200/40 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center py-20 shadow-sm">
  <Icon size={28} strokeWidth={1.5} className="text-neutral-350 dark:text-neutral-600 mb-3" />
  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-300">No items found</p>
  <p className="text-[11px] text-neutral-400 mt-1">Description of what to do</p>
  <button
    onClick={startCreating}
    className="mt-4 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-[10px] font-bold uppercase hover:opacity-90 transition-all shadow-sm"
  >
    Create First Item
  </button>
</div>
```

---

## Loading State Standards

### Table Loading (Shimmer)
```jsx
<div className="bg-white dark:bg-[#151518]/70 border border-neutral-200/40 dark:border-white/5 rounded-xl p-4 divide-y divide-neutral-150 dark:divide-white/5 animate-pulse space-y-3">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="flex items-center gap-3 py-3">
      <div className="w-4 h-4 bg-neutral-200/50 dark:bg-neutral-800 rounded" />
      <div className="w-8 h-8 bg-neutral-200/50 dark:bg-neutral-800 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/4" />
        <div className="h-2 bg-neutral-200/50 dark:bg-neutral-800 rounded w-1/2" />
      </div>
    </div>
  ))}
</div>
```

---

## Form Standards

### Input Fields
```jsx
<div className="space-y-1.5">
  <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
    Field Label
  </label>
  <input
    type="text"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="Placeholder text..."
    className="w-full px-3 py-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm"
  />
</div>
```

### Textarea Fields
```jsx
<div className="space-y-1.5">
  <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider">
    Description
  </label>
  <textarea
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder="Placeholder text..."
    rows={3}
    className="w-full px-3 py-2 bg-white dark:bg-[#1b1b1e] border border-neutral-200/60 dark:border-white/5 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-[#2b2b30] transition-all shadow-sm resize-none"
  />
</div>
```

### Toggle Switch
```jsx
<div className="flex items-center justify-between rounded-lg border border-neutral-200/50 dark:border-white/5 px-3 py-2.5">
  <div>
    <p className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">Active</p>
    <p className="text-[9px] text-neutral-400">Hidden when off</p>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={isActive}
    onClick={() => setIsActive(!isActive)}
    className={`relative w-9 h-5 rounded-full transition-colors ${
      isActive ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
    }`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
        isActive ? 'left-[18px]' : 'left-0.5'
      }`}
    />
  </button>
</div>
```

---

## Button Standards

### Primary Button
```jsx
<button className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm">
  <Plus size={13} />
  Add Item
</button>
```

### Secondary Button
```jsx
<button className="p-1.5 rounded-lg border border-neutral-200/50 dark:border-white/5 bg-white dark:bg-[#18181b] hover:bg-neutral-50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-[11px] font-medium">
  <RefreshCw size={12} />
  Refresh
</button>
```

### Danger Button (Outline)
```jsx
<button className="p-1.5 rounded hover:bg-red-500/10 text-neutral-400 hover:text-red-650 dark:hover:text-red-400 transition-colors">
  <Trash2 size={13} />
</button>
```

### Danger Button (Solid)
```jsx
<button className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-650 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-1.5">
  <Trash2 size={12} />
  Delete
</button>
```

---

## Pagination Standards

```jsx
{totalPages > 1 && (
  <div className="flex items-center justify-center gap-3 px-4 py-6">
    <button
      onClick={() => setPage(p => Math.max(1, p - 1))}
      disabled={page <= 1}
      className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
    >
      <ChevronLeft size={13} />
    </button>
    <span className="text-[11px] font-medium text-neutral-500">
      Page {page} of {totalPages}
    </span>
    <button
      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
      disabled={page >= totalPages}
      className="p-1.5 rounded-lg border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-[#151518] text-neutral-500 hover:text-neutral-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
    >
      <ChevronRight size={13} />
    </button>
  </div>
)}
```

---

## Best Practices

### 1. Always use standardized terminology
- Refer to `managementConfig.js` for approved terms
- Never invent new terms for existing concepts

### 2. Always use consistent icons
- Use the icon mappings from `managementConfig.js`
- Maintain consistent icon sizes and stroke widths

### 3. Always use consistent colors
- Use the color standards from `managementConfig.js`
- Never hardcode colors - use Tailwind classes

### 4. Always provide loading states
- Use shimmer/animate-pulse for content loading
- Use spinner for button loading
- Always disable buttons during async operations

### 5. Always provide empty states
- Show helpful message when no data exists
- Include a call-to-action when appropriate
- Use consistent empty state styling

### 6. Always confirm destructive actions
- Use ConfirmDialog for delete/archive/purge operations
- Require typed confirmation for permanent actions
- Provide clear explanation of consequences

### 7. Always provide feedback
- Use toast notifications for success/error messages
- Keep messages concise and actionable
- Use appropriate toast durations

### 8. Always handle errors gracefully
- Catch and handle all API errors
- Show user-friendly error messages
- Never expose raw error messages to users

---

## Page-Specific Guidelines

### Taxonomy Pages (Categories, ContestCategories, EventTypes)
These pages manage simple hierarchical data with drag-and-drop sorting:
- ✅ Must have: Header, Stats Cards, Table with DnD, Drawer, ConfirmDialog
- ✅ Should have: Live preview in drawer, Color picker
- ✅ Optional: Search (if many items)

### List Pages (Contests, Events, Users, Comments)
These pages display lists with filtering and pagination:
- ✅ Must have: Header, Stats Cards, Search/Filter bar, Table/Grid, Pagination
- ✅ Should have: Sort controls, Bulk actions (if applicable)
- ✅ Optional: Export functionality

### Detail Pages (ContestDetails, EventDetails)
These pages show and edit detailed information:
- ✅ Must have: Header, Form fields, Save button
- ✅ Should have: Preview, Validation
- ✅ Optional: Tabs for complex data

### Health/Monitoring Pages (ContestImages, ReviewQueue)
These pages show system health and require actions:
- ✅ Must have: Header, Clear status indicators, Action buttons
- ✅ Should have: Filters, Bulk actions
- ✅ Optional: Charts, Visual indicators

---

## Checklist for New Management Pages

- [ ] Page follows the standard structure
- [ ] Uses ManagementHeader for the header
- [ ] Has appropriate stat cards (if list page)
- [ ] Uses standardized terminology
- [ ] Uses standardized icons
- [ ] Uses standardized colors
- [ ] Has loading states
- [ ] Has empty states
- [ ] Has error handling
- [ ] Uses ConfirmDialog for destructive actions
- [ ] Provides user feedback (toasts)
- [ ] Is responsive (mobile-friendly)
- [ ] Supports dark mode
- [ ] Matches the design language of existing polished pages

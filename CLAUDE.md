# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plumy is an Electron-based project management tool featuring a dual-view interface:
- **Timeline View**: A Gantt-chart-like calendar timeline for visualizing task schedules
- **Swimlanes View**: A kanban board for task status management

The app uses React, TypeScript, Tailwind CSS, and Vite for the frontend bundling, with Electron for the desktop application wrapper.

## Key Commands

### Development

```bash
npm install              # Install dependencies
npm run dev             # Start dev server (Vite on port 5173) + Electron with hot reload
npm run dev:vite        # Start Vite dev server only
npm run dev:electron    # Start Electron (requires Vite server running)
```

### Building

```bash
npm run build           # Build renderer only
npm run build:renderer  # Build with Vite
npm run build:electron  # Build with electron-builder
npm run dist            # Full production build (generate icons + build + electron-builder)
npm run generate:icons  # Generate app icons from source
npm start               # Run packaged Electron app
```

## Architecture Overview

### Data Model

**Core types** (`src/app/types.ts`):
- `Task`: Represents a project task with properties like title, status, dates, and swimlane assignment
- `TaskStatus`: Union type ('open' | 'in-progress' | 'under-review' | 'done')
- `TimelineSwimlane`: Represents horizontal rows in the timeline view
- `Swimlane`: Status column definition used in the kanban view

**Data Flow**:
- All state is stored in `src/app/App.tsx` as the source of truth
- Data persists to browser localStorage via `safeReadJSON`/`safeWriteJSON` helpers
- Status columns (swimlanes for kanban) stored in `plumy.statusColumns.v1`
- Tasks stored in `plumy.tasks.v1`
- Timeline swimlanes stored in `plumy.swimlanes.v1`

### View Architecture

**TimelineView** (`src/app/components/TimelineView.tsx`):
- Renders a calendar-based timeline with months displayed horizontally
- Shows tasks as draggable blocks positioned by start/end dates
- Supports drag-to-resize tasks to change dates
- Swimlanes are rows representing different project areas
- Uses `MonthsScrollerFixed` for horizontal month scrolling
- Uses `react-dnd` for drag-and-drop functionality

**SwimlanesView** (`src/app/components/SwimlanesView.tsx`):
- Kanban board with columns representing task statuses (open, in-progress, under-review, done)
- Status columns map to `swimlanes` prop (actually status columns)
- Supports drag-to-move tasks between columns and reorder within columns
- Supports column reordering, renaming, and color changes
- Uses `react-dnd` with `HTML5Backend`

### UI Components

- **shadcn/ui components**: Pre-built accessible components in `src/app/components/ui/` (Dialog, Button, Select, etc.)
- **Custom components**: Task cards, swimlane rows, timeline utilities
- **Styling**: Tailwind CSS with Vite plugin; configured in `tailwind.config.js`

### Utilities

**`src/app/utils/contrast.ts`**:
- `getReadableTextClassFor(bgColorClass)`: Returns appropriate text color class (text-black or text-white) for readability on a given background color

**`src/app/utils/storage.ts`**:
- Storage utilities (if any custom logic beyond App.tsx)

**`src/app/constants/swimlanes.ts`**:
- Default swimlane definitions with status IDs and colors
- Colors use Tailwind classes (e.g., `bg-cyan-500`, `bg-blue-500`)

### Electron Integration

**Main Process** (`electron/main.cjs`):
- Creates BrowserWindow and handles dev/prod loading
- `isDev` flag determines whether to load from dev server (port 5173) or built dist/
- Dev mode opens DevTools automatically
- Includes error handlers for renderer crashes and load failures
- IPC handlers for:
  - **Store API**: `store/get`, `store/set`, `store/export` (using electron-store)
  - **File Attachments**: `attachments/pick`, `attachments/verify`, `attachments/embed`
  - **External Links**: `open-external` with protocol validation

**Preload** (`electron/preload.cjs`):
- Bridges renderer process to main process IPC safely (context isolation enabled)

## Development Patterns

### State Management
- React hooks only (useState, useEffect)
- All state in App.tsx with handlers passed down
- No external state library (Redux, Zustand, etc.)
- localStorage is the persistence layer

### Drag and Drop
- Uses `react-dnd` for both views
- Timeline uses `react-dnd` for task repositioning
- Swimlanes view uses `HTML5Backend` for drag-and-drop
- Task reordering updates the underlying array order

### Dialog/Modal Patterns
- TaskDialog and SwimlaneDialog are controlled by open/close state in App.tsx
- `selectedTask`/`selectedSwimlane` determines edit vs. create mode
- Dialogs pass data back via onSave callback

### Tailwind + Contrast
- Background colors for tasks/swimlanes are Tailwind classes (bg-*)
- Text colors determined by `getReadableTextClassFor()` to ensure contrast
- The `readable-text` class support is implemented via this utility

## Build and Deployment

- **Vite**: Fast bundler configured with path alias `@` → `src/`
- **Tailwind CSS Vite Plugin**: Automatically applies Tailwind transformations
- **Electron Builder**: Packages the app for macOS (dmg, pkg), Windows (nsis), and Linux (AppImage)
- **Icons**: Generated from source via `npm run generate:icons` before dist build
- App ID: `com.plumy.app`, Product Name: `Plumy`

## Important Implementation Notes

1. **Local Storage Keys**: Use version suffix (e.g., `plumy.tasks.v1`) for easy schema migrations
2. **Task IDs**: Generated using `Date.now().toString()` for uniqueness
3. **Swimlane Assignment**: Tasks can optionally belong to a timeline swimlane via `swimlaneId`
4. **Task Visibility**: The `swimlaneOnly` flag controls whether a task appears only in swimlanes or in both views
5. **Status Colors**: Defined in constants and applied via Tailwind; always pair with readable text color
6. **Error Handling**: In electron/main.cjs, errors are caught and shown via dialog boxes to help diagnose issues

## Recent Changes

The codebase has evolved from initial project setup with recent work on:
- Enhanced task color handling with readable text support (high contrast accessibility)
- Timeline view synchronization with status column colors
- Simplified swimlane definitions (removed 'agentation' dependency)

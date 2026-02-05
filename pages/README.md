# Plumy Landing Page

A minimalist landing page for Plumy, a desktop project management application built with Electron. The design embodies Swedish/Nordic design principles with clean lines, functional beauty, spacious layouts, and muted colors.

## Features

- **Swedish/Nordic Design**: Clean, minimal aesthetic with muted colors and strong typography
- **Responsive Layout**: Works seamlessly on all screen sizes
- **Modern Stack**: Built with Vite, React, TypeScript, and Tailwind CSS
- **Performance**: Fast loading and optimized for production

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React** - UI component library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

The project is already set up with all dependencies installed.

### Development

Start the development server:

```bash
npm run dev
```

The site will be available at `http://localhost:5173/`

### Build for Production

Create an optimized production build:

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## Project Structure

```
plumy-landing/
├── src/
│   ├── components/
│   │   ├── Hero.tsx         # Hero section with navigation
│   │   ├── Features.tsx     # Feature highlights
│   │   ├── Download.tsx     # Download/pricing section
│   │   └── Footer.tsx       # Footer with links
│   ├── App.tsx              # Main app component
│   ├── index.css            # Global styles with Tailwind
│   └── main.tsx             # App entry point
├── public/                   # Static assets
├── index.html               # HTML template
├── tailwind.config.js       # Tailwind configuration
├── vite.config.ts           # Vite configuration
└── package.json             # Dependencies and scripts
```

## Design Principles

### Color Palette

- **Backgrounds**: Off-white (#F8F9FA), Light grays
- **Text**: Nordic gray scale (from #202124 to #9AA0A6)
- **Accents**: 
  - Blue: #6B9AC4
  - Green: #8BA888
  - Purple: #9B87B5

### Typography

- Font: System fonts (San Francisco on macOS, Segoe UI on Windows)
- Hierarchy: Large, readable headings with light font weights
- Spacing: Generous whitespace for clarity

### Layout

- Spacious sections with ample padding
- Clean grid layouts
- Minimal decoration
- Focus on content and functionality

## Customization

### Updating Colors

Edit the color palette in `tailwind.config.js`:

```javascript
colors: {
  'nordic': {
    // Add or modify colors here
  }
}
```

### Adding Sections

Create new components in `src/components/` and import them in `App.tsx`.

## License

Copyright © 2026 Plumy. All rights reserved.
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

# Slide Editor

A WYSIWYG editor for HTML slide decks built with Electron and Squire RTE.

## Features

- **WYSIWYG Editing**: Edit slides visually using Squire rich text editor
- **HTML Source View**: Toggle between visual and HTML source editing modes
- **Speaker Notes**: Add speaker notes sections to slides
- **External CSS**: Link to external CSS stylesheets for slide styling
- **Custom CSS**: Add additional CSS rules to override or complement external styles
- **Slide Management**: Add, delete, and navigate between slides easily
- **File Operations**: Open, save, and create new slide decks
- **Play Mode**: Preview slides in browser with b6plus presentation mode
- **Thumbnail Previews**: Visual thumbnails of all slides in the sidebar

## Installation

1. Make sure you have Node.js installed (version 16 or higher recommended)

2. Navigate to the project directory:
```bash
cd slide-editor
```

3. Install dependencies (this will also copy Squire.js and DOMPurify to the src directory):
```bash
npm install
```

## Running the Application

```bash
npm start
```

You can also open a file directly from the command line:
```bash
npm start path/to/slides.html
```

Or in a built application:
```bash
./SlideEditor path/to/slides.html
```

### Opening Files

There are several ways to open a slide deck:

1. **File menu** - File → Open... (Cmd/Ctrl+O)
2. **Command line** - Pass the file path as an argument when starting the app
3. **Drag and drop** - Drag an HTML file onto the application window
4. **Double-click** - Associate .html files with the app and double-click (macOS/Windows)

### Relative Paths

The editor correctly resolves relative paths (images, CSS files, etc.) based on the location of the opened HTML file.

Note: The first `npm install` will copy Squire RTE, DOMPurify, and html2canvas from node_modules to src/ so they're bundled with the application.

## Building for Distribution

To create installers that users can download and install:

```bash
# Build for your current platform
npm run dist

# Or build for specific platforms
npm run dist:mac     # macOS
npm run dist:win     # Windows
npm run dist:linux   # Linux
```

Installers will be created in the `dist/` directory.

For detailed build instructions, see [BUILD.md](BUILD.md).

## Usage

### Creating Slides

1. Click **"➕ Add Slide"** to add a new slide
2. Click **"📝 Add Notes"** to add speaker notes for the current slide
3. Use the WYSIWYG editor to format your content
4. Click **"🗑️ Delete"** to remove the current slide

### Editing Content

- **WYSIWYG Mode**: Use the visual editor to format text, add lists, etc.
- **HTML Mode**: Click **"🔄 HTML View"** to edit raw HTML source
- Switch between modes as needed - content is preserved

### Styling Slides

1. **External CSS**:
   - Enter a CSS URL in the "CSS URL" field
   - Or click **"📁"** to browse for a local CSS file
   - Click **"Apply"** to apply the stylesheet

2. **Custom CSS**:
   - Click **"✏️ Custom CSS"** to open the CSS editor
   - Add your custom CSS rules
   - Click **"Save"** to apply

### File Operations

- **New File**: File → New (Ctrl/Cmd+N)
- **Open File**: File → Open (Ctrl/Cmd+O)
- **Save**: File → Save (Ctrl/Cmd+S)
- **Save As**: File → Save As (Ctrl/Cmd+Shift+S)

## Slide Deck Format

The editor creates HTML files with the following structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="path/to/styles.css">
    <style>
        /* Custom CSS rules */
    </style>
</head>
<body>
    <section class="slide">
        <!-- Slide content -->
    </section>
    
    <section class="comment">
        <!-- Speaker notes -->
    </section>
    
    <!-- More slides... -->
</body>
</html>
```

### Slide Types

- **`<section class="slide">`**: Regular slide content
- **`<section class="comment">`**: Speaker notes associated with the previous slide

## Keyboard Shortcuts

- **Ctrl/Cmd+N**: New file
- **Ctrl/Cmd+O**: Open file
- **Ctrl/Cmd+S**: Save file
- **Ctrl/Cmd+Shift+S**: Save file as
- **Ctrl/Cmd+Z**: Undo (in editor)
- **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: Redo (in editor)

## Technical Details

### Built With

- **Electron**: Cross-platform desktop application framework
- **Squire RTE**: Rich text editor library
- **html2canvas**: For generating slide thumbnails

### Architecture

- **Main Process** (`main.js`): Electron main process handling file I/O and menus
- **Preload Script** (`preload.js`): Secure IPC bridge between main and renderer
- **Renderer Process** (`editor.js`): Application logic and Squire integration
- **Iframe Isolation**: Slides are edited inside an iframe to prevent style conflicts

## Development

To open DevTools for debugging:
- View → Toggle DevTools (Ctrl/Cmd+Shift+I)

## License

MIT

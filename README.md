# B6+ Slide Editor

A WYSIWYG editor for HTML slide decks built with Electron and Squire RTE.

## Features

- **WYSIWYG editing**: Edit slides visually using Squire rich text editor
- **HTML source view**: Toggle between visual and HTML source editing modes
- **Speaker notes**: Add speaker notes sections to slides
- **External CSS**: Link to external CSS stylesheets for slide styling
- **Custom CSS**: Add additional CSS rules to override or complement external styles
- **Slide management**: Add, delete, and navigate between slides easily
- **File operations**: Open, save, and create new slide decks
- **Play mode**: Preview slides in browser with b6+ presentation mode
- **Thumbnail previews**: Visual thumbnails of all slides in the sidebar

## Pre-built installers

| Version | Debian (amd64) | MacOS (arm64) | MacOS (Intel) | Windows (installer) | Windows (executable) |
|---------|----------------|---------------|---------------|---------------------|----------------------|
| 0.1.0   | [b6plus-slide-editor_0.1.0_amd64.deb](https://www.w3.org/Talks/Tools/b6plus-editor/b6plus-slide-editor_0.1.0_amd64.deb) | [B6+ Slide Editor-0.1.0-arm64.dmg](https://www.w3.org/Talks/Tools/b6plus-editor/B6+%20Slide%20Editor-0.1.0-arm64.dmg) | [B6+ Slide Editor-0.1.0.dmg](https://www.w3.org/Talks/Tools/b6plus-editor/B6+%20Slide%20Editor-0.1.0.dmg) | [B6+ Slide Editor Setup 0.1.0.exe](https://www.w3.org/Talks/Tools/b6plus-editor/B6+%20Slide%20Editor%20Setup%200.1.0.exe) | [B6+ Slide Editor 0.1.0.exe](https://www.w3.org/Talks/Tools/b6plus-editor/B6+%20Slide%20Editor%200.1.0.exe) |

## Installation

1. Make sure you have Node.js installed (version 16 or higher recommended)

2. Navigate to the project directory:
```bash
cd b6plus-slide-editor
```

3. Install dependencies (this will also copy html2canvas.js and DOMPurify to the src directory):
```bash
npm install
```

## Running the application

```bash
npm start
```

You can also open a file directly from the command line:
```bash
npm start path/to/slides.html
```

Or in an installed application:
```bash
b6plus-slide-editor path/to/slides.html
```

### Opening files

There are several ways to open a slide deck:

1. **File menu** – File → Open... (Cmd/Ctrl+O)
2. **Command line** – Pass the file path as an argument when starting the app
3. **Drag and drop** – Drag an HTML file onto the application window
4. **Double-click** – Associate .html files with the app and double-click

## Building for distribution

Installers will be in the `dist/` directory.

To generate or update the installers:

```bash
# Build for your current platform
npm run dist

# Or build for specific platforms
npm run dist:mac     # macOS
npm run dist:win     # Windows
npm run dist:linux   # Linux
```

## Usage

### Creating slides

1. Click **"➕ Add Slide"** to add a new slide
2. Click **"📝 Add Notes"** to add speaker notes for the current slide
3. Use the WYSIWYG editor to format your content
4. Click **"🗑️ Delete"** to remove the current slide

### Editing content

- **WYSIWYG Mode**: Use the visual editor to format text, add lists, etc.
- **HTML Mode**: Click **"🔄 HTML View"** to edit raw HTML source
- Switch between modes as needed - content is preserved

### Styling slides

1. **External CSS**:
   - Enter a CSS URL in the "CSS URL" field
   - Or click **"📁"** to browse for a local CSS file
   - Click **"Apply"** to apply the stylesheet

2. **Custom CSS**:
   - Click **"✏️ Custom CSS"** to open the CSS editor
   - Add your custom CSS rules
   - Click **"Save"** to apply

### File operations

- **New File**: File → New (Ctrl/Cmd+N)
- **Open File**: File → Open (Ctrl/Cmd+O)
- **Save**: File → Save (Ctrl/Cmd+S)
- **Save As**: File → Save As (Ctrl/Cmd+Shift+S)

## Slide deck format

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

### Slide types

- **`<section class="slide">`**: Regular slide content
- **`<section class="comment">`**: Speaker notes associated with the previous slide

## Keyboard shortcuts

- **Ctrl/Cmd+N**: New file
- **Ctrl/Cmd+O**: Open file
- **Ctrl/Cmd+S**: Save file
- **Ctrl/Cmd+Shift+S**: Save file as
- **Ctrl/Cmd+Z**: Undo (in editor)
- **Ctrl/Cmd+Y** or **Ctrl/Cmd+Shift+Z**: Redo (in editor)

## technical details

### Built with

- **Electron**: Cross-platform desktop application framework
- **Squire RTE**: Rich text editor library
- **html2canvas**: For generating slide thumbnails

### Architecture

- **Main process** (`main.js`): Electron main process handling file I/O and menus
- **Preload script** (`preload.js`): Secure IPC bridge between main and renderer
- **Renderer process** (`editor.js`): Application logic and Squire integration
- **Iframe isolation**: Slides are edited inside an iframe to prevent style conflicts

## Development

To open DevTools for debugging:
- View → Toggle DevTools (Ctrl/Cmd+Shift+I)

## License

[W3C](https://www.w3.org/Consortium/Legal/2023/software-license)

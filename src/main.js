const { app, BrowserWindow, Menu, MenuItem, dialog, ipcMain } = require('electron');
const path = require('path');
//const fs = require('fs').promises;
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

let mainWindow;

const defaultLayouts = [
  {
    label: 'Normal slide',
    click: () => mainWindow.webContents.send('set-slide-layout', '')
  },
  {
    label: 'Cover slide',
    click: () => mainWindow.webContents.send('set-slide-layout', 'cover')
  },
  {
    label: 'Final slide',
    click: () => mainWindow.webContents.send('set-slide-layout', 'final')
  }
];
const defaultTransitions = [];
const template = [
  // macOS application menu
  ...(process.platform === 'darwin' ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => app.quit()
      }
    ]
  }] : []),
  {
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: () => mainWindow.webContents.send('new-file')
      },
      {
        label: 'Open...',
        accelerator: 'CmdOrCtrl+O',
        click: () => openFile()
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => mainWindow.webContents.send('save-file')
      },
      {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => mainWindow.webContents.send('save-file-as')
      },
      ...(process.platform !== 'darwin' ? [
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ] : [])
    ]
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => mainWindow.webContents.send('undo')
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => mainWindow.webContents.send('redo')
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        click: () => mainWindow.webContents.send('select-all')
      },
      { type: 'separator' },
      {
        label: 'Change Style Sheet...',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => mainWindow.webContents.send('change-stylesheet')
      },
      {
        label: 'Custom CSS...',
        click: () => mainWindow.webContents.send('edit-custom-css')
      }
    ]
  },
  {
    label: 'Format',
    submenu: [
      {
        label: 'Bold',
        accelerator: 'CmdOrCtrl+B',
        click: () => mainWindow.webContents.send('format-bold')
      },
      {
        label: 'Italic',
        accelerator: 'CmdOrCtrl+I',
        click: () => mainWindow.webContents.send('format-italic')
      },
      {
        label: 'Underline',
        accelerator: 'CmdOrCtrl+U',
        click: () => mainWindow.webContents.send('format-underline')
      },
      {
        label: 'Strikethrough',
        click: () => mainWindow.webContents.send('format-strikethrough')
      },
      {
        label: 'Code',
        click: () => mainWindow.webContents.send('format-code')
      },
      { type: 'separator' },
      {
        label: 'Insert Link...',
        accelerator: 'CmdOrCtrl+K',
        click: () => mainWindow.webContents.send('format-link')
      },
      {
        label: 'Remove Formatting',
        click: () => mainWindow.webContents.send('format-removeformat')
      },
      { type: 'separator' },
      {
	label: 'Block elements',
	submenu: [
	  {
	    label: 'Paragraph',
	    click: () => mainWindow.webContents.send('format-block', 'p')
	  },
	  {
	    label: 'Heading 1',
	    click: () => mainWindow.webContents.send('format-block', 'h1')
	  },
	  {
	    label: 'Heading 2',
	    click: () => mainWindow.webContents.send('format-block', 'h2')
	  },
	  {
	    label: 'Heading 3',
	    click: () => mainWindow.webContents.send('format-block', 'h3')
	  },
	  {
	    label: 'Heading 4',
	    click: () => mainWindow.webContents.send('format-block', 'h4')
	  },
	  {
	    label: 'Heading 5',
	    click: () => mainWindow.webContents.send('format-block', 'h5')
	  },
	  {
	    label: 'Heading 6',
	    click: () => mainWindow.webContents.send('format-block', 'h6')
	  },
	  {
	    label: 'Blockquote',
	    click: () => mainWindow.webContents.send('formatquote')
	  },
	  {
	    label: 'Pre',
	    click: () => mainWindow.webContents.send('format-block', 'pre')
	  },
	  {
	    label: 'Division',
	    click: () => mainWindow.webContents.send('format-block', 'div')
	  },
	  {
	    label: 'Address',
	    click: () => mainWindow.webContents.send('format-block', 'address')
	  },
	  {
	    label: 'Details',
	    click: () => mainWindow.webContents.send('format-block', 'details')
	  },
	  {
	    label: 'Article',
	    click: () => mainWindow.webContents.send('format-block', 'article')
	  },
	  {
	    label: 'Aside',
	    click: () => mainWindow.webContents.send('format-block', 'aside')
	  }
	]
      },
      {
        label: 'Bulleted List',
        click: () => mainWindow.webContents.send('format-ul')
      },
      {
        label: 'Numbered List',
        click: () => mainWindow.webContents.send('format-ol')
      },
      { type: 'separator' },
      {
        label: 'Edit Class...',
        click: () => mainWindow.webContents.send('edit-class')
      }
    ]
  },
  {
    id: 'slide',
    label: 'Slide',
    submenu: [
      {
        label: 'Add Slide',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => mainWindow.webContents.send('add-slide')
      },
      {
        label: 'Add Notes',
        accelerator: 'CmdOrCtrl+Shift+M',
        click: () => mainWindow.webContents.send('add-notes')
      },
      { type: 'separator' },
      {
        label: 'Delete Slide',
        accelerator: 'CmdOrCtrl+Shift+Backspace',
        click: () => mainWindow.webContents.send('delete-slide')
      },
      { type: 'separator' },
      {
        label: 'Slide Layout',
	id: 'slide-layout',
        submenu: defaultLayouts
      },
      {
        label: 'Default Transition',
	id: 'default-transitions',
        submenu: defaultTransitions
      },
      {
        label: 'Slide Transition',
	id: 'slide-transitions',
        submenu: defaultTransitions
      },
      {
	label: 'Omit decoration && slide number',
	id: 'set-clear',
	type: 'checkbox',
	click: () => mainWindow.webContents.send('set-clear')
      },
      {
	label: 'Shrink text to fit',
	id: 'set-textfit',
	type: 'checkbox',
	click: () => mainWindow.webContents.send('set-textfit')
      },
      { type: 'separator' },
      {
        label: 'Play',
        accelerator: 'CmdOrCtrl+P',
        click: () => mainWindow.webContents.send('play-slides')
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Toggle HTML/WYSIWYG View',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => mainWindow.webContents.send('toggle-view')
      },
      { type: 'separator' },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => mainWindow.webContents.send('zoom-in')
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => mainWindow.webContents.send('zoom-out')
      },
      {
        label: 'Reset Zoom',
        accelerator: 'CmdOrCtrl+0',
        click: () => mainWindow.webContents.send('zoom-reset')
      },
      { type: 'separator' },
      {
        label: 'Toggle DevTools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => mainWindow.webContents.toggleDevTools()
      }
    ]
  },
  {
    label: 'Help',
    role: 'help',
    submenu: [
      {
        label: 'Online Manual',
        click: async () => {
          const { shell } = require('electron');
          await shell.openExternal('https://www.w3.org/Talks/Tools/b6plus-editor/manual.html');
        }
	// click: () => {
	//   const win = new BrowserWindow({});
	//   win.loadURL('https://www.w3.org/Talks/Tools/b6plus-editor/manual.html');
	// }
      },
      {
	label: 'Style Help',
	id: 'style-help',
	enabled: false,
	click: () => mainWindow.webContents.send('style-help')
      }
    ]
  }
];

async function openFileByPath(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const directory = path.dirname(filePath);
    mainWindow.webContents.send('file-opened', {
      path: filePath,
      directory: directory,
      content: content
    });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('src/index.html');

  // Handle window close event
  mainWindow.on('close', (e) => {
    // Ask the renderer if there are unsaved changes
    if (!mainWindow.forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('check-unsaved-changes');
    }
  });

  // Open file from command line if provided
  const fileToOpen = process.argv.find(arg => arg.endsWith('.html') && !arg.includes('index.html'));
  if (fileToOpen) {
    mainWindow.webContents.on('did-finish-load', () => {
      openFileByPath(fileToOpen);
    });
  }

  app.setAboutPanelOptions({
    applicationName: "B6+ slide editor", // string (optional) - The app's name.
    applicationVersion: "0.1.0", // string (optional) - The app's version.
    copyright: "© 2026 W3C", // string (optional) - Copyright information.
    version: "0.1", // string (optional) macOS - The app's build version number.
    // credits: "", // string (optional) macOS Windows - Credit information.
    authors: ["Bert Bos"], // string[] (optional) Linux - List of app authors.
    website: "https://www.w3.org/Talks/Tools/b6plus-editor/manual.html", // string (optional) Linux - The app's website.
    iconPath: "b6plus-logo.png", // string (optional) Linux Windows - Path to the app's icon in a JPEG or PNG file format. On Linux, will be shown as 64x64 pixels while retaining aspect ratio. On Windows, a 48x48 PNG will result in the best visual quality.
  });

  const menu = Menu.buildFromTemplate(template);

  Menu.setApplicationMenu(menu);

  const { session } = require('electron');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
	...details.responseHeaders,
	'Content-Security-Policy': ['style-src http: file: data: \'unsafe-inline\'; img-src http: file: data:; font-src http: file: data:; script-src \'self\'; default-src \'none\'']
      }
    })
  })
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'HTML Files', extensions: ['html'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const content = fs.readFileSync(filePath, 'utf-8');
      const directory = path.dirname(filePath);

      mainWindow.webContents.send('file-opened', {
        path: filePath,
        directory: directory,
        content: content
      });
    } catch (err) {
      dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
    }
  }
}

ipcMain.handle('save-file-dialog', async (event, currentPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: currentPath || 'slides.html',
    filters: [
      { name: 'HTML Files', extensions: ['html'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  if (filePath.match(/^[a-z]+:/i) && !filePath.match(/^file:/i)) {
    // TODO: fetch
    dialog.showErrorBox('Error', `Fetching of a remote file (${filePath}) is not implemented yet`);
  } else {
    filePath = filePath.replace(/^file:\/\//i, '');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return {content: content, success: true, error: null};
    } catch (err) {
      // throw new Error(`Failed to read file: ${err.message}`);
      return {content: null, success: false, error: err.message};
    }
  }
});

ipcMain.handle('select-css-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSS Files', extensions: ['css'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('resolve-path', async (event, basePath, relativePath) => {
  // Resolve a relative path based on a base path
  return path.resolve(path.dirname(basePath), relativePath);
});

ipcMain.handle('make-relative-path', async (event, fromPath, toPath) => {
  // Make a path relative from one file to another
  return path.relative(path.dirname(fromPath), toPath);
});

ipcMain.handle('is-absolute-path', async (event, pathStr) => {
  // Check if a path is absolute (works for URLs and file paths)
  if (pathStr.startsWith('http://') || pathStr.startsWith('https://') || pathStr.startsWith('file://')) {
    return true;
  }
  return path.isAbsolute(pathStr);
});

ipcMain.handle('write-temp-file', async (event, content) => {
  // Write content to a temporary HTML file
  const os = require('os');
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, 'slide-deck-preview.html');

  try {
    fs.writeFileSync(tempFilePath, content, 'utf-8');
    return { success: true, path: tempFilePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-temp-file-path', async () => {
  // Get the path where temp file will be written
  const os = require('os');
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, 'slide-deck-preview.html');
  const resolvedPath = fs.realpathSync(tempFilePath);
  return resolvedPath;
});

ipcMain.handle('open-in-browser', async (event, url) => {
  // Open url in default browser
  const { shell } = require('electron');
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Handle a request to replace the slide layout and transition menus
ipcMain.handle('update-layout-and-transitions-menus', async (event, json) => {
  // The application menu cannot be changed (we cannot add or remove
  // items), it can only be replaced. So instead we update the template
  // and create a new application menu from that.

  // Find the Slide menu
  let slideMenu;
  for (let i = 0; i < template.length && !slideMenu; i++)
    if (template[i].id == 'slide') slideMenu = template[i].submenu;
  if (!slideMenu) return;

  // Find the Slide Layouts submenu
  let slideLayoutMenu;
  for (let i = 0; i < slideMenu.length && !slideLayoutMenu; i++)
    if (slideMenu[i].id === 'slide-layout') slideLayoutMenu = slideMenu[i];

  // Update the Slide Layouts menu
  if (slideLayoutMenu) {
    if (json.layouts === undefined) {
      slideLayoutMenu.submenu = defaultLayouts;
    } else {
      slideLayoutMenu.submenu = [];
      for (const h of json.layouts) {
	const n = h.name;
	// updateLayoutsAndTransitions() should already have made it an array...
	const c = Array.isArray(h.class) ? h.class[0] : h.class;
	slideLayoutMenu.submenu.push({
	  label: n,
	  click: () => mainWindow.webContents.send('set-slide-layout', c)
	});
      }
    }
  }

  // Find the Default Transitions submenu
  let defTransMenu;
  for (let i = 0; i < slideMenu.length && !defTransMenu; i++)
    if (slideMenu[i].id === 'default-transitions') defTransMenu = slideMenu[i];

  // Update the default transitions menu
  if (defTransMenu) {
    if (json.transitions === undefined) {
      defTransMenu.submenu = defaultTransitions;
    } else {
      defTransMenu.submenu = [];
      for (const h of json.transitions) {
	const n = h.name;
	const c = h.class;
	defTransMenu.submenu.push({
	  label: n,
	  click: () => mainWindow.webContents.send('set-default-transition', c)
	});
      }
    }
  }

  // Find the Slide Transitions submenu
  let slideTransMenu;
  for (let i = 0; i < slideMenu.length && !slideTransMenu; i++)
    if (slideMenu[i].id === 'slide-transitions') slideTransMenu = slideMenu[i];

  // Update the slide transitions menu
  if (slideTransMenu) {
    if (json.transitions === undefined) {
      slideTransMenu.submenu = defaultTransitions;
    } else {
      slideTransMenu.submenu = [];
      for (const h of json.transitions) {
	const n = h.name;
	const c = h.class;
	slideTransMenu.submenu.push({
	  label: n,
	  click: () => mainWindow.webContents.send('set-slide-transition', c)
	});
      }
    }
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Also enable/disable the style help menu item.
  const styleHelp = menu.getMenuItemById('style-help');
  if (styleHelp) styleHelp.enabled = !!json.documentation;
});

// Update the checkbox of the Clear menu item
ipcMain.handle('set-clear', (event, value) => {
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-clear');
  if (item) item.checked = value;
});

ipcMain.handle('set-textfit', (event, value) => {
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-textfit');
  if (item) item.checked = value;
});

ipcMain.handle('show-hide-clear', (event, value) => {
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-clear');
  if (item) item.enabled = value;
});

// Handle response from unsaved changes check
ipcMain.on('proceed-with-close', () => {
  if (mainWindow) {
    mainWindow.forceClose = true;
    mainWindow.close();
  }
});

ipcMain.on('cancel-close', () => {
  // Do nothing, window stays open
});

app.whenReady().then(createWindow);

// Handle file open from drag and drop or double-click
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openFileByPath(filePath);
  } else {
    // If window doesn't exist yet, create it and open file after
    app.whenReady().then(() => {
      createWindow();
      mainWindow.webContents.on('did-finish-load', () => {
        openFileByPath(filePath);
      });
    });
  }
});

app.on('window-all-closed', () => {
//  if (process.platform !== 'darwin') {
    app.quit();
//  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

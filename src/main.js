const { app, BrowserWindow, Menu, MenuItem, dialog, ipcMain, net }
      = require('electron');
const path = require('path');
//const fs = require('fs').promises;
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
// const https = require('https');
const http2 = require('http2');
const mime = require('mime-types');

let mainWindow;

const defaultLayouts = [
  { label: 'Normal slide',
    click: () => mainWindow.webContents.send('r-set-slide-layout', '') },
  { label: 'Cover slide',
    click: () => mainWindow.webContents.send('r-set-slide-layout', 'cover') },
  { label: 'Final slide',
    click: () => mainWindow.webContents.send('r-set-slide-layout', 'final') }
];
const defaultTransitions = [];
const template = [
  // macOS application menu
  ...(process.platform === 'darwin' ? [
    { label: app.name,
      submenu: [
	{ role: 'about' },
	{ type: 'separator' },
	{ role: 'services' },
	{ type: 'separator' },
	{ role: 'hide' },
	{ role: 'hideOthers' },
	{ role: 'unhide' },
	{ type: 'separator' },
	{ label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit() }
      ] }] : []),
  { label: 'File',
    submenu: [
      { label: 'New',
        accelerator: 'CmdOrCtrl+N',
        click: () => mainWindow.webContents.send('r-new-file') },
      { label: 'Open...',
        accelerator: 'CmdOrCtrl+O',
        click: () => mainWindow.webContents.send('r-open-file') },
      { label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => mainWindow.webContents.send('r-save-file') },
      { label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => mainWindow.webContents.send('r-save-as') },
      ...(process.platform !== 'darwin' ? [
        { type: 'separator' },
        { label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit() }
      ] : [])
    ] },
  { label: 'Edit',
    submenu: [
      { label: 'Undo',
	id: 'undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => mainWindow.webContents.send('r-undo') },
      { label: 'Redo',
	id: 'redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => mainWindow.webContents.send('r-redo') },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        click: () => mainWindow.webContents.send('r-select-all') },
      { type: 'separator' },
      { label: 'Change Style Sheet...',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => mainWindow.webContents.send('r-change-stylesheet') },
      { label: 'Custom CSS...',
        click: () => mainWindow.webContents.send('r-edit-custom-css') }
    ] },
  { label: 'Inline',
    submenu: [
      { label: 'Strong',
        accelerator: 'CmdOrCtrl+B',
        click: () => mainWindow.webContents.send('r-format-inline', 'strong') },
      { label: 'Emphasis',
        accelerator: 'CmdOrCtrl+I',
        click: () => mainWindow.webContents.send('r-format-inline', 'em') },
      { label: 'Bold',
        click: () => mainWindow.webContents.send('r-format-inline', 'b') },
      { label: 'Italic',
        click: () => mainWindow.webContents.send('r-format-inline', 'i') },
      { label: 'Underline',
        accelerator: 'CmdOrCtrl+U',
        click: () => mainWindow.webContents.send('r-format-inline', 'u') },
      { label: 'Strikethrough',
        click: () => mainWindow.webContents.send('r-format-inline', 's') },
      { label: 'Code',
        accelerator: 'CmdOrCtrl+d',
        click: () => mainWindow.webContents.send('r-format-inline', 'code') },
      { type: 'separator' },
      { label: 'Insert Link...',
        accelerator: 'CmdOrCtrl+K',
        click: () => mainWindow.webContents.send('r-format-link') },
      { label: 'Remove Formatting',
        click: () => mainWindow.webContents.send('r-format-removeformat') },
      { type: 'separator' },
      { label: 'Add Image...',
	click: () => mainWindow.webContents.send('r-add-image') },
      { type: 'separator' },
      { label: 'Language...',
        click: () => mainWindow.webContents.send('r-language', 'selection') },
      { label: 'Edit Class...',
        click: () => mainWindow.webContents.send('r-edit-class', 'selection') }
    ] },
  { label: 'Blocks',
    submenu: [
      { label: 'Paragraph',
	click: () => mainWindow.webContents.send('r-format-block', 'p') },
      { label: 'Heading 1',
        accelerator: 'CmdOrCtrl+1',
	click: () => mainWindow.webContents.send('r-format-block', 'h1') },
      { label: 'Heading 2',
        accelerator: 'CmdOrCtrl+2',
	click: () => mainWindow.webContents.send('r-format-block', 'h2') },
      { label: 'Heading 3',
        accelerator: 'CmdOrCtrl+3',
	click: () => mainWindow.webContents.send('r-format-block', 'h3') },
      { label: 'Heading 4',
        accelerator: 'CmdOrCtrl+4',
	click: () => mainWindow.webContents.send('r-format-block', 'h4') },
      { label: 'Heading 5',
        accelerator: 'CmdOrCtrl+5',
	click: () => mainWindow.webContents.send('r-format-block', 'h5') },
      { label: 'Heading 6',
        accelerator: 'CmdOrCtrl+6',
	click: () => mainWindow.webContents.send('r-format-block', 'h6') },
      { label: 'Address',
	click: () => mainWindow.webContents.send('r-format-block', 'address') },
      { label: 'Preformatted',
	click: () => mainWindow.webContents.send('r-format-block', 'pre') },
      { type: 'separator' },
      { label: 'Blockquote',
	click: () => mainWindow.webContents.send('r-format-quote') },
      { label: 'Division',
	click: () => mainWindow.webContents.send('r-format-block', 'div') },
      { label: 'Details',
	click: () => mainWindow.webContents.send('r-format-block', 'details') },
      { label: 'Article',
	click: () => mainWindow.webContents.send('r-format-block', 'article') },
      { label: 'Section',
	click: () => mainWindow.webContents.send('r-format-block', 'section') },
      { label: 'Aside',
	click: () => mainWindow.webContents.send('r-format-block', 'aside') },
      { type: 'separator' },
      { label: 'Remove Container',
	click: () => mainWindow.webContents.send('r-format-block', 'unwrap') },
      { type: 'separator' },
      { label: 'Bulleted List',
        accelerator: 'CmdOrCtrl+Shift+8',
        click: () => mainWindow.webContents.send('r-format-ul') },
      { label: 'Numbered List',
        accelerator: 'CmdOrCtrl+Shift+9',
        click: () => mainWindow.webContents.send('r-format-ol') },
      { label: 'Push To Sub-list',
	click: () => mainWindow.webContents.send('r-increase-list-level') },
      { label: 'Pull From Sub-list',
	click: () => mainWindow.webContents.send('r-decrease-list-level') },
      { type: 'separator' },
      { label: 'Language...',
        click: () => mainWindow.webContents.send('r-language', 'block') },
      { label: 'Edit Class...',
        click: () => mainWindow.webContents.send('r-edit-class', 'block') }
    ] },
  { id: 'table',
    label: 'Tables',
    submenu: [
      { label: 'Insert Table',
	click: () => mainWindow.webContents.send('r-make-table') },
      { label: 'Add Headings Row',
	click: () => mainWindow.webContents.send('r-add-headings-row') },
      { label: 'Add Row',
	click: () => mainWindow.webContents.send('r-add-row') },
      { label: 'Add Column',
	click: () => mainWindow.webContents.send('r-add-column') },
      { label: 'Delete Rows',
	click: () => mainWindow.webContents.send('r-delete-rows') },
      { label: 'Delete Columns',
	click: () => mainWindow.webContents.send('r-delete-columns') },
      { label: 'Toggle Heading/Data Cell',
	click: () => mainWindow.webContents.send('r-toggle-heading-cell') }
    ] },
  { id: 'slide',
    label: 'Slide',
    submenu: [
      { label: 'Add Slide',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => mainWindow.webContents.send('r-add-slide') },
      { label: 'Add Notes',
        accelerator: 'CmdOrCtrl+Shift+M',
        click: () => mainWindow.webContents.send('r-add-notes') },
      { type: 'separator' },
      { label: 'Delete Slide',
        accelerator: 'CmdOrCtrl+Shift+Backspace',
        click: () => mainWindow.webContents.send('r-delete-slide') },
      { type: 'separator' },
      { label: 'Slide Layout',
	id: 'slide-layout',
        submenu: defaultLayouts },
      { label: 'Default Transition',
	id: 'default-transitions',
        submenu: defaultTransitions },
      { label: 'Slide Transition',
	id: 'slide-transitions',
        submenu: defaultTransitions },
      { label: 'Omit decoration && slide number',
	id: 'set-clear',
	type: 'checkbox',
	click: () => mainWindow.webContents.send('r-set-clear') },
      { label: 'Shrink Text To Fit',
	id: 'set-textfit',
	type: 'checkbox',
	click: () => mainWindow.webContents.send('r-set-textfit') },
      { label: 'Default Language...',
        click: () => mainWindow.webContents.send('r-language', 'document') },
      { label: 'Slide Language...',
        click: () => mainWindow.webContents.send('r-language', 'slide') },
      { type: 'separator' },
      { label: 'Play',
        accelerator: 'CmdOrCtrl+P',
        click: () => mainWindow.webContents.send('r-play-slides') }
    ] },
  { label: 'View',
    submenu: [
      { label: 'Toggle HTML/WYSIWYG View',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => mainWindow.webContents.send('r-toggle-view') },
      { type: 'separator' },
      { label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => mainWindow.webContents.send('r-zoom-in') },
      { label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => mainWindow.webContents.send('r-zoom-out') },
      { label: 'Reset Zoom',
        accelerator: 'CmdOrCtrl+0',
        click: () => mainWindow.webContents.send('r-zoom-reset') },
      { type: 'separator' },
      { label: 'Toggle DevTools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => mainWindow.webContents.toggleDevTools() }
    ] },
  { label: 'Help',
    role: 'help',
    submenu: [
      { label: 'Online Manual',
        click: async () => { const { shell } = require('electron');
          await shell.openExternal('https://www.w3.org/Talks/Tools/b6plus-editor/manual.html'); }
	// click: () => {
	//   const win = new BrowserWindow({ });
	//   win.loadURL('https://www.w3.org/Talks/Tools/b6plus-editor/manual.html'); }
      },
      { label: 'Style Help',
	id: 'style-help',
	enabled: false,
	click: () => mainWindow.webContents.send('r-style-help') },
      ...(process.platform !== 'darwin' ? [
	{ type: 'separator' },
	{ role: 'about' } ] : [])
    ] }
];

async function openFileByPath(filePath)
{
  console.log(`* openFileByPath ${filePath}`);
  mainWindow.webContents.send('r-file-to-open', filePath);
}

function createWindow()
{
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
      mainWindow.webContents.send('r-check-unsaved-changes');
    }
  });

  // Open file from command line if provided
  // process.argv.forEach((a, i) => console.log(`argv[${i}] = ${a}`));
  console.log(...process.argv);
  let fileToOpen = process.argv.find(arg => arg.endsWith('.html') && !arg.includes('index.html'));
  if (fileToOpen) {
    // Electron changes the working directory as if with "cd -P ." (or
    // cd `realpath .`). So if there are symlinks in the path to the
    // current directory, a relative path in the command line argument
    // will be wrong. Hopefully, there is a PWD environment variable
    // that holds the original working directory.
    if (!fileToOpen.match(/^[a-z][a-z]+:/i))
      fileToOpen = path.resolve(process.env.PWD, fileToOpen);
    mainWindow.webContents.on('did-finish-load', () => {
      openFileByPath(fileToOpen);
    });
  }

  app.setAboutPanelOptions({
    applicationName: "B6+ slide editor", // string (optional) - The app's name.
    applicationVersion: "0.1", // string (optional) - The app's version.
    copyright: "© 2026 W3C", // string (optional) - Copyright information.
    version: "0.1.3", // string (optional) macOS - The app's build version number.
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


function setTitle(event, title)
{
  mainWindow.setTitle(title ?? app.name);
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
}

async function saveFileDialog (event, currentPath)
{
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: currentPath || 'slides.html',
    filters: [
      { name: 'HTML Files', extensions: ['html', 'htm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
}

async function writeFile(event, filePath, content, auth = null)
{
  console.log(`* writeFile ${filePath} (${content.length} bytes) ${auth ? 'with' : 'no'} auth`);
  if (filePath.match(/^[a-z]+:/i) && !filePath.match(/^file:/i)) {
    try {
      const mediaType = getMediaType(filePath) || 'application/octet-stream';
      // dialog.showErrorBox('Info', `writeFile(..., ${filePath},...) using ${mediaType}`);
      const options = {
	body: content,
	credentials: 'include',
	method: 'PUT',
	headers: { 'Content-Type': mediaType,
	  // It seems Jigsaw closes the connection, but Node.js's
	  // fetch() expects it to be still open and then fails with
	  // "fetch failed". So let's tell fetch that the connection
	  // should be closed:
	  'Connection': 'close' } };
      if (auth) {
	const base64 = Buffer.from(auth, 'utf8').toString('base64');
	options.headers['Authorization'] = 'Basic ' + base64;
      }
      const response = await fetch(filePath, options);
      const body = await response.text();
      console.log(`  -> ${response.status} ${response.status !== 401 ? body : ''}`);
      return { success: response.ok, url: response.url, body: body,
	status: response.status, error: response.statusText,
	authenticate: response.headers.get('WWW-Authenticate') };
    } catch (err) {
      console.log(`  -> error: ${err.message}`);
      return { success: false, error: err.message };
    }
  } else {
    try {
      const path = filePath.replace(/^file:\/\//i, '');
      fs.writeFileSync(path, content);
      console.log(`  -> success`);
      return { success: true, url: path };
    } catch (err) {
      console.log(`  -> error: ${err.message}`);
      return { success: false, url: path, error: err.message };
    }
  }
}

async function readFile(event, filePath, auth = null)
{
  console.log(`* readFile ${filePath} ${auth ? 'with' : 'no'} auth`);
  if (filePath.match(/^[a-z][a-z]+:/i) && !filePath.match(/^file:/i)) {
    // dialog.showErrorBox('Info', `readFile(..., ${filePath}, ${auth})`);
    try {
      const options = { credentials: 'include' };
      if (auth) {
	const base64 = Buffer.from(auth, 'utf8').toString('base64');
	options.headers = { 'Authorization': 'Basic ' + base64 };
	// dialog.showErrorBox('Info', `${options.headers['Authorization']}`);
      }
      const response = await fetch(filePath, options);
      const body = await response.bytes();
      console.log(`  -> (${body.length} bytes) -> ${response.status}`);
      return { success: response.ok, url: response.url, body: body,
	type: response.headers.get('Content-Type'),
	status: response.status, error: response.statusText,
	authenticate: response.headers.get('WWW-Authenticate') };
    } catch (err) {
      console.log(`  -> error: ${err.message}`);
      return { success: false, error: err.message};
    }
  } else {
    try {
      const path = filePath.replace(/^file:\/\//i, '');
      const body = fs.readFileSync(path);
      console.log(`  -> (${body.length} bytes)`);
      return { success: true, url: filePath, body: body };
    } catch (err) {
      // throw new Error(`Failed to read file: ${err.message}`);
      console.log(`  -> error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

async function selectCssFile()
{
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
}

async function selectImageFile()
{
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Image Files',
	extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] },
      { name: 'All Files',
	extensions: ['*'] } ] });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

function resolvePath(event, ...paths)
{
  // Resolve a relative path to a normalized absolute path based on
  // zero or more directories and the current working directory.
  return path.resolve(...paths);
}

function makeRelativePath(event, fromPath, toPath)
{
  // Make a path relative from one file to another
  return path.relative(path.dirname(fromPath), toPath);
}

// makeAbsolute -- handler: make a relative path an absolute URL or a real path
async function makeAbsolute(event, urlRef, base = null)
{
  if (!urlRef) return null;
  else if (urlRef.match(/^[a-z][a-z]+:/i)) return urlRef;
  else if (!base) return URL.parse('file://' + getRealPath(null, urlRef)).href;
  else if (base.match(/^[a-z][a-z]+:/)) return URL.parse(urlRef, base).href;
  else return URL.parse('file://' + getRealPath(null,
    resolvePath(null, path.dirname(base), urlRef))).href;
}

function writeTempFile(event, content)
{
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
}

function getTempFilePath()
{
  // Get the path where temp file will be written
  const os = require('os');
  const tempDir = os.tmpdir();
  const resolvedDir = fs.realpathSync(tempDir);
  const tempFilePath = path.join(resolvedDir, 'slide-deck-preview.html');
  return tempFilePath;
}

// getRealPath -- handler: return the physical path, i.e., resolving symlinks
function getRealPath(event, path)
{
  try {return fs.realpathSync(path)}
  catch (e) {return path}
}

async function openInBrowser(event, url)
{
  // Open url in default browser
  const { shell } = require('electron');
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Handle a request to replace the slide layout and transition menus
async function updateLayoutAndTransitionsMenus(event, json)
{
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
	  click: () => mainWindow.webContents.send('r-set-slide-layout', c)
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
	  id: 'default-transition-' + (c || 'default'),
	  type: 'checkbox',
	  click: () => mainWindow.webContents.send('r-set-default-transition', c)
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
	  id: 'slide-transition-' + (c || 'default'),
	  type: 'checkbox',
	  click: () => mainWindow.webContents.send('r-set-slide-transition', c)
	});
      }
    }
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Also enable/disable the style help menu item.
  const styleHelp = menu.getMenuItemById('style-help');
  if (styleHelp) styleHelp.enabled = !!json.documentation;
}

// Update the checkbox of the Clear menu item
function setClear(event, value)
{
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-clear');
  if (item) item.checked = value;
}

function setTextfit(event, value)
{
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-textfit');
  if (item) item.checked = value;
}

function showHideClear(event, value)
{
  const menu = Menu.getApplicationMenu();
  const item = menu.getMenuItemById('set-clear');
  if (item) item.enabled = value;
}

function showUndoRedo(event, canUndo, canRedo)
{
  const menu = Menu.getApplicationMenu();
  const undoItem = menu.getMenuItemById('undo');
  if (undoItem) undoItem.enabled = canUndo;
  const redoItem = menu.getMenuItemById('redo');
  if (redoItem) redoItem.enabled = canRedo;
}

// setDefaultTransition -- add/remove a checkbox in the default transitions menu
function setDefaultTransition(event, chosenTransition)
{
  const menu = Menu.getApplicationMenu();
  const defTransItem = menu.getMenuItemById('default-transitions');
  if (!defTransItem || !defTransItem.submenu) return;		// Bug?
  console.log(`setDefaultTransition "${chosenTransition}"`);
  const id = 'default-transition-' + (chosenTransition || 'default');
  for (const item of defTransItem.submenu.items)
    item.checked = item.id === id;
}

// setSlideTransition -- add/remove a checkbox in the slide transitions menu
function setSlideTransition(event, chosenTransition)
{
  const menu = Menu.getApplicationMenu();
  const slideTransItem = menu.getMenuItemById('slide-transitions');
  if (!slideTransItem || !slideTransItem.submenu) return; // Bug?
  console.log(`setSlideTransition "${chosenTransition}"`);
  const id = 'slide-transition-' + (chosenTransition || 'default');
  for (const item of slideTransItem.submenu.items)
    item.checked = item.id === id;
}

// Handle response from unsaved changes check
function proceedWithClose()
{
  if (mainWindow) {
    mainWindow.forceClose = true;
    mainWindow.close();
  }
}

function cancelClose()
{
  // Do nothing, window stays open
}

// getMediaType -- get the media type for the file extension of a given path
function getMediaType(path)
{
  return mime.lookup(path);	// returns false if extension is unknown
}

// Register handlers for messages from the renderer.
ipcMain.on('a-set-title', setTitle);
ipcMain.handle('a-save-file-dialog', saveFileDialog);
ipcMain.handle('a-write-file', writeFile);
ipcMain.handle('a-read-file', readFile);
ipcMain.handle('a-open-file', openFile);
ipcMain.handle('a-select-css-file', selectCssFile);
ipcMain.handle('a-select-image-file', selectImageFile);
ipcMain.handle('a-make-absolute', makeAbsolute);
ipcMain.handle('a-resolve-path', resolvePath);
ipcMain.handle('a-make-relative-path', makeRelativePath);
ipcMain.handle('a-write-temp-file', writeTempFile);
ipcMain.handle('a-get-temp-file-path', getTempFilePath);
ipcMain.handle('a-get-real-path', getRealPath);
ipcMain.handle('a-open-in-browser', openInBrowser);
ipcMain.handle('a-update-layout-and-transitions-menus',
  updateLayoutAndTransitionsMenus);
ipcMain.on('a-set-clear', setClear);
ipcMain.on('a-set-textfit', setTextfit);
ipcMain.on('a-show-hide-clear', showHideClear);
ipcMain.on('a-show-undo-redo', showUndoRedo);
ipcMain.on('a-proceed-with-close', proceedWithClose);
ipcMain.on('a-cancel-close', cancelClose);
ipcMain.on('a-set-default-transition', setDefaultTransition);
ipcMain.on('a-set-slide-transition', setSlideTransition);

app.whenReady().then(() => createWindow());

app.on('login', (event, webContents, details, authInfo, callback) => {
  event.preventDefault();
  mainWindow.send('r-ask-password', details.url, authInfo.realm);
  const { promise, resolve } = Promise.withResolvers();
  ipcMain.once('a-reply-password', (event, auth) => resolve(auth));
  promise.then(auth => {
    // dialog.showErrorBox('Info', `Got auth ${auth}`);
    const colon = auth ? auth.indexOf(':') : -1;
    const username = colon >= 0 ? auth.substring(0, colon) : '';
    const password = colon >= 0 ? auth.substring(colon + 1) : '';
    callback(username, password);
  });
});

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

class SlideEditor {

  // This list of block elements should be the same as the
  // block-format drop down and the Format menu.
  static blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'div', 'address', 'details', 'article', 'aside'];

  // This list is used for prettyprinting:
  static allBlockElements = ['ol', 'ul', 'dl', 'dt', 'dd', 'li', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hgroup',
    ...SlideEditor.blockElements];

  // If a style sheet is loaded that does not have metadata in a JSON
  // file, assume it provides these layouts and slide transitions:
  static defaultLayouts = [
    { "name": "Normal slide",
      "class": "" },
    { "name": "Cover slide",
      "class": "cover" },
    { "name": "Final slide",
      "class": "final" }
  ];
  static defaultTransitions = [
    { "name": "Default",
      "class": "" }
  ];

  constructor()
  {
    this.isMac = /Mac/.test(navigator.platform);

    this.slides = [];
    this.currentSlideIndex = 0;
    this.currentFilePath = null;
    this.auths = new Map();	// Map of origins to usernames & passwords
    this.cssUrl = '';
    this.cssUrlInfo = {
      documentation: null,
      "supports-clear": false,
      layouts: SlideEditor.defaultLayouts,
      transitions: SlideEditor.defaultTransitions
    };
    this.customCss = '';
    this.includeB6plus = true;
    this.isHtmlView = false;
    this.editorView = null;
    this.editorFrame = null;
    this.editor = null;
    this.zoomLevel = 1.0;
    this.hasUnsavedChanges = false;
    this.defaultTransition = '';

    this.initializeUI();
    this.setupEventListeners();
    this.addInitialSlide();
  }

  initializeUI()
  {
    this.editorFrame = document.getElementById('editor-frame');
    this.editorFrame.addEventListener('load', () => {
      this.initializeSquire();

      // A click on an image selects that image
      this.editorFrame.contentDocument.addEventListener('click', event => {
	const target = event.target;
	if (target.nodeName === 'IMG' || target.nodeName === 'svg') {
	  event.preventDefault();
	  event.stopPropagation();
	  const range = target.ownerDocument.createRange();
	  range.setStartBefore(target);
	  range.setEndAfter(target);
	  this.editor.setSelection(range);
	}
      });

      // Handle drag and drop of images or slide decks onto the editor
      this.editorFrame.contentDocument.addEventListener('drop', event => {
	event.preventDefault();
	event.stopPropagation();
	const file = event.dataTransfer.files[0];
	if (file?.type.substring(0, 6) === 'image/') {
	  const path = window.electronAPI.getPath(file);
	  document.getElementById('image-url').value = path;
	  document.getElementById('alt-text').value = '';
	  this.openImageDialog();
	} else if (file?.type === 'text/html') {
	  const path = window.electronAPI.getPath(file);
	  this.fileToOpen(path);
	}
      });
    });

    // Get the base path for loading Squire
    // In development: file:///.../src/
    // In production: app.asar or unpacked
    // const basePath = window.location.href.substring(0,
    //   window.location.href.lastIndexOf('/'));
    const basePath = window.location.href;

    // Initialize iframe with basic structure
    this.editorFrame.srcdoc = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset=UTF-8>
          <meta name=viewport content="width=device-width">
          <base href="${basePath}" id="base-url">
          <script src="${URL.parse('dompurify.js', basePath)}"></script>
          <script src="${URL.parse('squire-patched.js', basePath)}"></script>
          <style>
            body {margin: 0; padding: 0}
            /* Try to make tables a bit more visible while editing: */
            table:hover, table:hover td, table:hover th {
              outline: thin dashed orange}
          </style>
        </head>
        <body class="b6plus">
          <section id="slide-wrapper"></section>
        </body>
      </html>`;
  }

  // copySlideDeckData -- (deep) copy of slide deck contents
  copySlideDeckData(from, to)
  {
    for (const property of ['slides', 'cssUrl', 'currentFilePath',
      'includeB6plus', 'defaultTransition', 'lang', 'customCss'])
      to[property] = structuredClone(from[property]);
  }

  // isUrl -- return true if the argument is a URL, i.e., starts with a protocol
  isUrl(u)
  {
    return u && u.match(/^[a-z][a-z]+/i);
  }

  // isLocal -- true if the argument is a local path or a URL with "file:"
  isLocal(u)
  {
    return u && (u.match(/^file:/i) || !u.match(/^[a-z][a-z]+:/i));
  }

  // isAbsolute -- true if the path is a URL or a path that starts with "/"
  isAbsolute(u)
  {
    return this.isUrl(u) || u.match(/^[\/\\]/);
  }

  // makeAbsolute -- make a relative path an absolute URL or a real path
  async makeAbsolute(urlRef, base = null)
  {
    return await window.electronAPI.makeAbsolute(urlRef, base);
  }

  // absolute -- combine a relative path with a base
  absolute(path, base)
  {
    let r;

    if (this.isUrl(base)) r = URL.parse(path, base)?.href;
    else if (base) r = URL.parse(path, 'file://' + base)?.href;
    else if (path.match(/^[\/\\]/)) r = URL.parse('file://' + path)?.href;
    else r = URL.parse(path)?.href;
    console.log(`absolute(${path}, ${base}) -> ${r}`);
    return r;
  }

  // relative -- return a relative path from base to path
  relative(base, path)
  {
    let r;

    // base and path must be URLs or paths that start at "/"
    console.log(`relative(${base}, ${path})`);
    const baseUrl = URL.parse(this.isUrl(base) ? base : 'file://' + base);
    const pathUrl = URL.parse(this.isUrl(path) ? path : 'file://' + path);
    if (baseUrl.origin !== pathUrl.origin) {
      r = path;
    } else {
      const b = baseUrl.pathname.split('/'); b.pop();
      const p = pathUrl.pathname.split('/');
      while (b.length && b[0] === p[0]) {b.shift(); p.shift()}
      if (b.length === 0) r = p.join('/');
      else r = b.map(s => '..').join('/') + '/' + p.join('/')
      r += pathUrl.search + pathUrl.hash;
    }
    console.log(`  -> ${r}`);
    return r;
  }

  // setEdited -- flag current document as (not) edited and update window title
  setEdited(edited = true)
  {
    this.hasUnsavedChanges = edited;
    if (this.currentFilePath)
      window.electronAPI.setTitle(this.currentFilePath
	  + (edited ? ' (edited)' : ''));
  }

  // escapeHTML -- escape delimiters (<>&") for HTML
  escapeHTML(text)
  {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').
      replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  // prettify -- convert an HTML DOM to text with block elements indented
  prettify(indent, ...nodes)
  {
    let text = '';
    for (const n of nodes) {
      switch (n.nodeType) {
      case Node.ELEMENT_NODE:
	const tag = n.nodeName.toLowerCase();
	const isBlock = SlideEditor.allBlockElements.includes(tag);
	const isEmpty = ['img', 'br', 'hr'].includes(tag);
	const newIndent = isBlock ? indent + '  ' : indent;
	const needsNL = isBlock && !text.endsWith('\n');
	if (needsNL) text += '\n';
	if (isBlock) text += indent;
	text += '<' + tag;
	text += this.prettify(newIndent, ...n.attributes);
	text += '>';
	text += this.prettify(newIndent, ...n.childNodes);
	if (!isEmpty && isBlock && text.endsWith('\n')) text += indent;
	if (!isEmpty) text += '</' + tag + '>';
	if (isBlock) text += '\n';
	break;
      case Node.ATTRIBUTE_NODE:
	text += ' ' + n.name + '="' + this.escapeHTML(n.value) + '"';
	break;
      case Node.TEXT_NODE:
	text += this.escapeHTML(n.nodeValue);
	break;
      case Node.CDATA_SECTION_NODE:
	text += '<!CDATA[' + n.nodeValue + ']]>';
	break;
      case Node.PROCESSING_INSTRUCTION_NODE:
	text += '<?' + n.target + ' ' + n.nodeValue + '>';
	break;
      case Node.COMMENT_NODE:
	text += '<!--' + n.nodeValue + '-->';
	break;
      case Node.DOCUMENT_NODE:
	break;
      case Node.DOCUMENT_TYPE_NODE:
	text += '<DOCTYPE html>\n';
	break;
      case Node.DOCUMENT_FRAGMENT_NODE:
	break;
      }
    }
    return text;
  }

  // prettifyContents -- return prettyprinted version of node.innerHTML
  prettifyContents = node => {return this.prettify('', ...node.childNodes)};

  // initializeSquire -- create an editor with the current slide
  async initializeSquire()
  {
    const ctrlKey = this.isMac ? "Meta-" : "Ctrl-";
    const frameDoc = this.editorFrame.contentDocument;
    const editorElement = frameDoc.getElementById('slide-wrapper');

    if (!editorElement) return;

    // Wait for Squire to load in the iframe
    while (!frameDoc.defaultView.Squire)
      await new Promise(resolve => setTimeout(resolve, 50));

    const Squire = frameDoc.defaultView.Squire;

    // Get current slide content
    const currentSlide = this.slides[this.currentSlideIndex];

    // Destroy existing editor if present
    if (this.editor) this.editor.destroy();

    // Initialize Squire editor
    this.editor = new Squire(editorElement, {
      blockTag: 'P',
      blockAttributes: null,
      tagAttributes: {},
      useImageResizer: false,
      // sanitizeToDOMFragment: (html, editor) => {
      //   const frag = frameDoc.defaultView.DOMPurify.sanitize(html, {
      //     ALLOW_UNKNOWN_PROTOCOLS: true,
      //     WHOLE_DOCUMENT: false,
      //     RETURN_DOM: true,
      //     RETURN_DOM_FRAGMENT: true,
      //     FORCE_BODY: false,
      // 	  ADD_TAGS: ['use'],
      //   });
      //   return frag
      //     ? document.importNode(frag, true)
      //     : document.createDocumentFragment();
      // }
    });

    // Set initial content
    if (currentSlide) this.editor.setHTML(currentSlide.content);

    // Listen for changes
    this.editor.addEventListener('input', () => {
      this.updateCurrentSlideContent();
      this.setEdited();
    });

    // Update path on selection change
    this.editor.addEventListener('cursor', () => {
      this.updateElementPath();
      this.updateFormatButtonStates();
    });

    // Highlight any formatting buttons that apply when selection changes
    this.editor.addEventListener('select', () => {
      this.updateElementPath();
      this.updateFormatButtonStates();
    });

    // The Esc key expands the selection to its enclosing element
    this.editor.setKeyHandler('Escape', (editor, event, range) => {
      event.preventDefault();
      this.expandSelection(range);
    });

    // ArrowLeft & ArrowRight keys select an image if the cursor is next to it
    this.editor.setKeyHandler('ArrowLeft', (editor, event, range) => {
      this.handleArrowLeftOrRight(editor, event, range);
    });
    this.editor.setKeyHandler('ArrowRight', (editor, event, range) => {
      this.handleArrowLeftOrRight(editor, event, range);
    });

    // Ctrl+1,...Ctrl+6 make H1... H6
    this.editor.setKeyHandler(ctrlKey + '1', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H1') this.renameElement(block, 'h1');
	else this.renameElement(block, 'p');
      }, true);
    });
    this.editor.setKeyHandler(ctrlKey + '2', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H2') this.renameElement(block, 'h2');
	else this.renameElement(block, 'p');
      }, true);
    });
    this.editor.setKeyHandler(ctrlKey + '3', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H3') this.renameElement(block, 'h3');
	else this.renameElement(block, 'p');
      }, true);
    });
    this.editor.setKeyHandler(ctrlKey + '4', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H4') this.renameElement(block, 'h4');
	else this.renameElement(block, 'p');
      }, true);
    });
    this.editor.setKeyHandler(ctrlKey + '5', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H5') this.renameElement(block, 'h5');
	else this.renameElement(block, 'p');
      }, true);
    });
    this.editor.setKeyHandler(ctrlKey + '6', editor => {
      editor.forEachBlock(block => {
	if (block.tagName !== 'H6') this.renameElement(block, 'h6');
	else this.renameElement(block, 'p');
      }, true);
    });

    // After an Undo or Redo event, update the Edit menu
    this.editor.addEventListener('undoStateChange', event => {
      const {canUndo, canRedo} = event.detail;
      window.electronAPI.showUndoRedo(canUndo, canRedo);
      // If canUndo is false, this slide is unedited. But we cannot
      // call setEdited(false), because there may have been edits in
      // other slides.
    });

    // Add a handler for when an image is copy-pasted
    this.editor.addEventListener('pasteImage', event => {
      if (event.detail.clipboardData.files.length > 0) {
	const file = event.detail.clipboardData.files[0];
	const path = window.electronAPI.getPath(file);
	document.getElementById('image-url').value = path;
	document.getElementById('alt-text').value = '';
	this.openImageDialog();
	// this.insertImages(event.detail.clipboardData);
      }
    });

    // Initial path update
    this.updateElementPath();
  }

  // handleArrowLeftOrRight -- modify the behavior of ArowLeft and ArrowRight
  handleArrowLeftOrRight(editor, event, range)
  {
    const goRight = event.key === 'ArrowRight';

    // If cursor is collapsed and adjacent to an image, select the image.
    if (range.collapsed) {
      const { startContainer, startOffset } = range;
      let imgNode = null;

      if (startContainer.nodeType === 3) {
        // Text node: check sibling in the direction of travel
        const sib = goRight
              ? (startOffset === startContainer.length ? startContainer.nextSibling : null)
              : (startOffset === 0 ? startContainer.previousSibling : null);
        if (sib && (sib.nodeName === 'IMG' || sib.nodeName === 'svg'))
	  imgNode = sib;
      } else if (startContainer.nodeType === 1) {
        // Element node: check child at the position we'd move into
        const child = goRight
              ? startContainer.childNodes[startOffset]
              : startContainer.childNodes[startOffset - 1];
        if (child && (child.nodeName === 'IMG' || child.nodeName === 'svg'))
	  imgNode = child;
      }

      if (imgNode) {
        event.preventDefault();
        const newRange = imgNode.ownerDocument.createRange();
	newRange.setStartBefore(imgNode);
	newRange.setEndAfter(imgNode);
	editor.setSelection(newRange);
      }
    }
  }

  // makeClassName -- construct the class attribute for a slide
  makeClassName(slide)
  {
    let classes = slide.type === 'slide' ? 'slide' : 'comment';
    if (slide.styleClass) classes += ' ' + slide.styleClass;
    if (slide.slideClear) classes += ' clear';
    if (slide.slideTextfit) classes += ' textfit';
    if (slide.otherClasses) classes += ' ' + slide.otherClasses;
    return classes;
  }

  // updateElementPath -- show hierarchy of elements around cursor in status bar
  updateElementPath()
  {
    if (!this.editor) return;

    const frameDoc = this.editorFrame.contentDocument;
    const editorElement = frameDoc.getElementById('slide-wrapper');
    const pathContainer = document.getElementById('element-path');
    let selectedElement = this.selectedElement();

    if (pathContainer) {

      pathContainer.innerHTML = '';

      if (!this.isHtmlView && selectedElement) { // selection.focusNode) {

	// Build path

	// let node = selection.focusNode;

	// If it's a text node, get the parent element
	// if (node.nodeType === 3) node = node.parentNode;


	// Build path from current node up to the section wrapper
	const path = [];

	let node = selectedElement;
	while (node && node !== editorElement && node !== frameDoc.body) {
	  if (node.nodeType === 1) path.unshift(node); // Element node
	  node = node.parentNode;
	}

	// Display path from outermost to innermost
	path.forEach((element, index) => {
	  if (index > 0) {
            const separator = document.createElement('span');
            separator.className = 'path-separator';
            separator.textContent = '>';
            pathContainer.appendChild(separator);
	  }

	  const pathElement = document.createElement('span');
	  pathElement.className = 'path-element';

	  let label = element.nodeName.toLowerCase();
	  if (element.className)
	    label += '.' + element.className.split(' ').join('.');
	  if (element.id)
            label += '#' + element.id;

	  pathElement.textContent = label;
	  pathElement.title = 'Click to select this element';

	  // Click handler to select this element
	  pathElement.addEventListener('click', () => {
            this.selectElement(element);
	  });

	  pathContainer.appendChild(pathElement);
	});
      }
    }

    const blockMenu = document.getElementById('block-format');

    if (blockMenu) {

      if (this.isHtmlView || !selectedElement) { // !selection.focusNode) {
	blockMenu.value = '';
      } else {
	let node = selectedElement;
	let block = '';
	while (!block && node && node !== frameDoc && node !== editorElement) {
	  const tagName = node.tagName.toLowerCase();
	  if (SlideEditor.blockElements.includes(tagName)) block = tagName;
	  node = node.parentNode;
	}
	blockMenu.value = block;
      }
    }
  }

  // selectElement -- handle a click on the status bar
  selectElement(element)
  {
    if (!this.editor) return;

    const range = element.ownerDocument.createRange();
    range.selectNode(element);
    // or: range.setStartBefore(element); range.setEndAfter(element);
    // or: range.selectNodeContents(element);
    this.editor.setSelection(range);
    this.previousSelectedElement = element;
    this.editor.focus();
  }

  // expandSelection -- expand the selection to the element enclosing the range
  expandSelection(range)
  {
    let container = range.commonAncestorContainer;

    if (container.nodeType === Node.TEXT_NODE
	&& range.startOffset === 0
	&& range.endOffset === container.length
	&& container.parentNode.childNodes.length === 1)
      // The selection covers the whole of a text node that is the
      // only child of an element. Treat it as if that element was
      // selected.
      container = container.parentNode.parentNode;
    else if (container.nodeType === Node.TEXT_NODE
	|| container === this.previousSelectedElement)
      // If it's a text node, or if it is the element that we just
      // expanded to, get its parent instead.
      container = container.parentNode;

    // We don't expand to the wrapper element.
    if (container !== container.ownerDocument.body
	&& container.id !== 'slide-wrapper') {
      this.selectElement(container);
    }
  }

  // setupEventListeners -- event listeners on buttons and menus
  setupEventListeners()
  {
    // Electron IPC listeners, menu commands
    window.electronAPI.onNewFile(() => this.newFile());
    window.electronAPI.onOpenFile(() => this.openOpenFileDialog());
    window.electronAPI.onSaveFile(() => this.saveFile());
    window.electronAPI.onSaveAs(() => this.openSaveAsDialog());

    window.electronAPI.onAddSlide(() => this.addSlide());
    window.electronAPI.onAddNotes(() => this.addNotes());
    window.electronAPI.onDeleteSlide(() => this.deleteSlide());
    window.electronAPI.onSetSlideLayout((event, layout) =>
      this.setSlideStyleClass(layout));
    window.electronAPI.onSetDefaultTransition((event, transition) =>
      this.setDefaultTransition(transition));
    window.electronAPI.onSetSlideTransition((event, transition) =>
      this.setSlideTransition(transition));
    window.electronAPI.onSetClear(() => this.setClear());
    window.electronAPI.onSetTextfit(() => this.setTextfit());

    window.electronAPI.onToggleView(() => this.toggleView());
    window.electronAPI.onEditCustomCss(() => this.openCustomCssModal());
    window.electronAPI.onPlaySlides(() => this.playSlides());
    window.electronAPI.onChangeStylesheet(() => this.openStylesheetDialog());

    window.electronAPI.onUndo(() => this.undo());
    window.electronAPI.onRedo(() => this.redo());
    window.electronAPI.onSelectAll(() => this.selectAll());

    window.electronAPI.onFormatInline((event, format) => this.formatInline(
      format));
    window.electronAPI.onFormatLink(() => this.formatLink());
    window.electronAPI.onFormatRemoveFormat(() => this.formatRemoveFormat());
    window.electronAPI.onFormatBlock((event,data) => this.setBlockFormat(data)),
    window.electronAPI.onAddImage(() => this.openImageDialog());
    window.electronAPI.onFormatUl(() => this.formatUl());
    window.electronAPI.onFormatOl(() => this.formatOl());
    window.electronAPI.onEditClass((event, what) => this.openClassDialog(what));
    window.electronAPI.onLanguage((event, what) => this.openLanguageDialog(what));

    window.electronAPI.onMakeTable(() => this.makeTable());
    window.electronAPI.onAddHeaderRow(() => this.addHeaderRow());
    window.electronAPI.onAddRow(() => this.addRow());
    window.electronAPI.onAddColumn(() => this.addColumn());
    window.electronAPI.onDeleteRows(() => this.deleteRows());
    window.electronAPI.onDeleteColumns(() => this.deleteColumns());
    window.electronAPI.onToggleHeaderCell(() => this.toggleHeaderCell());

    window.electronAPI.onZoomIn(() => this.zoomIn());
    window.electronAPI.onZoomOut(() => this.zoomOut());
    window.electronAPI.onZoomReset(() => this.zoomReset());

    window.electronAPI.onStyleHelp(() => this.styleHelp());

    window.electronAPI.onAskPassword((event, url, realm) => this.askPassword(
      url, realm));

    window.electronAPI.onFileToOpen((event, path) => this.fileToOpen(path));

    // Toolbar buttons
    document.getElementById('play-slides').addEventListener('click', () => this.playSlides());
    document.getElementById('add-slide').addEventListener('click', () => this.addSlide());
    document.getElementById('add-notes').addEventListener('click', () => this.addNotes());
    document.getElementById('delete-slide').addEventListener('click', () => this.deleteSlide());
    document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
    document.getElementById('change-stylesheet').addEventListener('click', () => this.openStylesheetDialog());
    document.getElementById('edit-custom-css').addEventListener('click', () => this.openCustomCssModal());

    // Formatting toolbar buttons
    document.getElementById('format-strong').addEventListener('click',
      () => this.formatInline('strong'));
    document.getElementById('format-emphasis').addEventListener('click',
      () => this.formatInline('em'));
    document.getElementById('format-code').addEventListener('click',
      () => this.formatInline('code'));
    document.getElementById('format-link').addEventListener('click',
      () => this.formatLink());
    document.getElementById('format-removeformat').addEventListener('click',
      () => this.formatRemoveFormat());
    document.getElementById('insert-image').addEventListener('click',
      () => this.openImageDialog());
    document.getElementById('format-ul').addEventListener('click',
      () => this.formatUl());
    document.getElementById('format-ol').addEventListener('click',
      () => this.formatOl());
    document.getElementById('increase-list-level').addEventListener('click',
      () => this.increaseListLevel());
    document.getElementById('decrease-list-level').addEventListener('click',
      () => this.decreaseListLevel());
    document.getElementById('block-format').addEventListener('change',
      e => this.setBlockFormat(e.target.value));
    document.getElementById('edit-class').addEventListener('click',
      () => this.openClassDialog('selection'));
    document.getElementById('make-table').addEventListener('click',
      () => this.makeTable());
    document.getElementById('add-header-row').addEventListener('click',
      () => this.addHeaderRow());
    document.getElementById('add-row').addEventListener('click',
      () => this.addRow());
    document.getElementById('add-column').addEventListener('click',
      () => this.addColumn());
    document.getElementById('delete-rows').addEventListener('click',
      () => this.deleteRows());
    document.getElementById('delete-columns').addEventListener('click',
      () => this.deleteColumns());
    document.getElementById('toggle-header-cell').addEventListener('click',
      () => this.toggleHeaderCell());

    // Stylesheet dialog
    document.getElementById('apply-stylesheet').addEventListener('click', () => this.applyStylesheet());
    document.getElementById('browse-stylesheet').addEventListener('click', () => this.browseStylesheet());

    // Image dialog
    document.getElementById('apply-image').addEventListener('click', () => this.applyImage());
    document.getElementById('browse-image').addEventListener('click', () => this.browseImage());

    // Open File dialog
    document.getElementById('apply-open-file').addEventListener('click', () => this.applyOpenFile());
    document.getElementById('browse-open-file').addEventListener('click', () => this.browseOpenFile());

    // Save As dialog
    document.getElementById('apply-save-as').addEventListener('click', () => this.applySaveAs());
    document.getElementById('browse-save-as').addEventListener('click', () => this.browseSaveAs());

    // Class dialog
    document.getElementById('apply-class').addEventListener('click', () => this.applyClass());
    document.getElementById('remove-class').addEventListener('click', () => this.removeClass());

    // Language dialog
    document.getElementById('apply-language').addEventListener('click', () => this.applyLanguage());
    document.getElementById('remove-language').addEventListener('click', () => this.removeLanguage());

    // Password dialog
    document.getElementById('apply-password').addEventListener('click', () => this.applyPassword());

    // Link dialog
    document.getElementById('apply-link').addEventListener('click', () => this.applyLink());
    document.getElementById('remove-link').addEventListener('click', () => this.removeLink());

    // Custom CSS modal
    document.getElementById('save-custom-css').addEventListener('click', () => this.saveCustomCss());

    // Style class selector
    document.getElementById('slide-style').addEventListener('change', e => {
      this.setSlideStyleClass(e.target.value);
    });

    // Clear checkbox
    document.getElementById('slide-clear').addEventListener('change', e =>
      this.setClear(e.target.checked));

    // Textfit checkbox
    document.getElementById('slide-textfit').addEventListener('change', e =>
      this.setTextfit(e.target.checked));

    // B6+ checkbox
    document.getElementById('include-b6plus').addEventListener('change', e => {
      this.includeB6plus = e.target.checked;
    });

    // HTML editor changes
    document.getElementById('html-editor').addEventListener('input',
      () => this.setEdited());

    // Handle window close with unsaved changes check
    window.electronAPI.onCheckUnsavedChanges(() => {
      if (this.hasUnsavedChanges) {
        if (confirm('You have unsaved changes. Are you sure you want to quit?'))
          window.electronAPI.proceedWithClose();
	else
          window.electronAPI.cancelClose();
      } else {
        window.electronAPI.proceedWithClose();
      }
    });
  }

  // addInitialSlide -- make an initial slide for a new slide deck
  addInitialSlide()
  {
    this.addSlide();
    // Reset unsaved changes flag since this is just initialization
    this.setEdited(false);
  }

  // addSlide -- add an empty slide after the current slide
  addSlide()
  {
    const slide = {
      type: 'slide',
      content: '<p>New slide content</p>',
    };

    // Find the insertion point: after the current slide and its notes
    let insertIndex = this.slides.length === 0 ? 0 : this.currentSlideIndex + 1;
    while (this.slides[insertIndex]?.type === 'notes') insertIndex++;

    this.slides.splice(insertIndex, 0, slide);
    this.currentSlideIndex = insertIndex;
    this.setEdited();
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  // addNotes -- add new, empty speaker notes after the current slide or notes
  addNotes()
  {
    const slideIndex = this.currentSlideIndex;

    const notes = {
      type: 'notes',
      content: '<p>Speaker notes</p>',
    };

    // Insert notes after the slide
    this.slides.splice(slideIndex + 1, 0, notes);
    this.currentSlideIndex = slideIndex + 1;
    this.setEdited();
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  // deleteSlide -- remove the current slide
  deleteSlide()
  {
    if (this.slides.length === 0) return;

    if (confirm('Delete this slide?')) {
      this.slides.splice(this.currentSlideIndex, 1);
      this.setEdited();

      if (this.slides.length === 0)
        this.addSlide();
      else if (this.currentSlideIndex >= this.slides.length)
        this.currentSlideIndex = this.slides.length - 1;

      this.updateSlidesList();
      this.loadCurrentSlide();
    }
  }

  // updateSlidesList -- renumber and regenerate thumbnails for all slides
  updateSlidesList()
  {
    // If there is an update waiting, cancel it.
    if (this.slides[this.currentSlideIndex].thumbnailtimer !== null)
      clearTimeout(this.slides[this.currentSlideIndex].thumbnailtimer);

    const list = document.getElementById('slides-list');
    list.innerHTML = '';

    let slideNumber = 0;
    this.slides.forEach((slide, index) => {
      const item = document.createElement('div');
      item.className = 'slide-item';
      item.id = `slide-item-${index}`;

      // Only create thumbnail container for slides, not notes
      if (slide.type === 'slide') {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'slide-item-thumbnail';
        thumbnail.id = `thumbnail-${index}`;
        item.appendChild(thumbnail);
      }

      // Create label
      const label = document.createElement('div');
      label.className = 'slide-item-label';

      if (slide.type === 'slide') {
        slideNumber++;
        label.textContent = `Slide ${slideNumber}`;
      } else {
        label.textContent = `Notes ${slideNumber}`;
        item.classList.add('notes');
      }

      if (index === this.currentSlideIndex)
        item.classList.add('active');

      item.appendChild(label);

      item.addEventListener('click', () => {
        // Update active class efficiently
        const previousIndex = this.currentSlideIndex;
        this.currentSlideIndex = index;

        if (previousIndex !== index) {
          // Remove active from previous item
          const previousItem = document.getElementById(
	    `slide-item-${previousIndex}`);
          if (previousItem) previousItem.classList.remove('active');

          // Add active to new item
          item.classList.add('active');

          this.loadCurrentSlide();
        }
      });

      list.appendChild(item);
    });

    // Generate thumbnails asynchronously
    this.generateThumbnails();
  }

  // generateThumbnails -- generate the thumbnails for all slides in the list
  async generateThumbnails()
  {
    // Load html2canvas if not already loaded
    if (!window.html2canvas) {
      const script = document.createElement('script');
      // Load from local bundled file
      const basePath = window.location.href.substring(0,
	window.location.href.lastIndexOf('/'));
      script.src = `${basePath}/html2canvas.js`;
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
      });
    }

    // Generate thumbnail for each slide
    for (let i = 0; i < this.slides.length; i++)
      this.generateThumbnail(i);
  }

  // generateThumbnail -- generate the thumbnail for one slide
  async generateThumbnail(slideIndex)
  {
    const slide = this.slides[slideIndex];
    const thumbnailContainer = document.getElementById(`thumbnail-${slideIndex}`);
    if (!thumbnailContainer) return; // Speaker notes don't have thumbnails

    // console.log(`generateThumbnail(${slideIndex})`);

    // Calculate slide number
    let slideNumber = 0;
    for (let i = 0; i <= slideIndex; i++)
      if (this.slides[i].type === 'slide') slideNumber++;

    // Create an iframe, if there isn't one yet.
    // if (!thumbnailContainer.firstElementChild)
    //   thumbnailContainer.append(document.createElement('iframe'));
    // const frame = thumbnailContainer.firstElementChild;

    // if (!frame.style.zoom) frame.style.zoom = 0.2; // Will be adjusted

    // Create a temporary iframe to render the slide
    const frame = document.createElement('iframe');
    frame.style.position = 'absolute';
    frame.style.left = '-9999px';
    document.body.appendChild(frame);

    // Build the slide HTML with styles
    const lang = typeof this.lang === 'string'
	  ? ` lang="${this.escapeHTML(this.lang)}"` : '';
    // let html = `<!DOCTYPE html><html${lang} style="overflow: hidden">`
    let html = `<!DOCTYPE html><html${lang}>`
	+ '<head><meta charset=UTF-8>'
	+ '<meta name=viewport content="width=device-width">';

    // Add base tag if we have a file path. Add "file://" before a local path.
    const base = this.currentFilePath;
    if (this.isUrl(base)) html += `<base href="${base}">`;
    else if (base) html += `<base href="${new URL('file://' + base).href}">`;
    // console.log(`  ${slideIndex}: base href = ${base}`);

    // Add external CSS if available
    if (this.cssUrl) html += `<link rel="stylesheet" href="${this.cssUrl}">`;
    // console.log(`  ${slideIndex}: stylesheet = ${this.cssUrl}`);

    // Add custom CSS
    // TODO: Escape any occurrence of "</style>"
    if (this.customCss) html += '<style>' + this.customCss + '</style>';

    html += '<style>';
    html += 'body { margin: 0; padding: 0 }';
    html += 'section.slide { margin: 0 }';
    html += '</style>';

    html += '</head><body class="b6plus">';

    const classes = this.makeClassName(slide);
    const id = slide.id ? ` id="${slide.id}"` : '';
    const sLang = typeof slide.lang === 'string'
	  ? ` lang="${this.escapeHTML(slide.lang)}"` : '';

    html += `<section${id}${sLang} class="${classes}"`;
    html += ` style="counter-reset: slide ${slideNumber - 1}" inert>`;
    html += `${slide.content}</section>`;
    html += '</body></html>';

    frame.srcdoc = html;

    // Wait for styles and images to load
    await new Promise(resolve => {frame.addEventListener('load', resolve)});

    // console.log(`  ${slideIndex}: readyState = ${frame.contentDocument?.readyState}`);

    // const sliderect = frame.contentDocument.body.firstElementChild.
    // 	  getBoundingClientRect();
    // frame.width = sliderect.width;
    // frame.height = sliderect.height;
    // const containerrect = thumbnailContainer.getBoundingClientRect();
    // frame.style.zoom = containerrect.width / sliderect.width;

    const slideElement = frame.contentDocument.body.firstElementChild;
    // console.log(`  ${slideIndex}: slideElement = ${slideElement}`);
    try {
      // Render to canvas. Use the section element directly.
      const canvas = await window.html2canvas(slideElement, {
        scale: 0.2,
        logging: false,
	windowWidth: 1920,
	windowHeight: 1080,
        useCORS: true,
	allowTaint: true
      });

      // Clear thumbnail and add canvas
      thumbnailContainer.innerHTML = '';
      thumbnailContainer.appendChild(canvas);
    } catch (err) {
      console.error('Error generating thumbnail:', slideIndex, err);
      thumbnailContainer.innerHTML =
	'<div style="color: #999; font-size: 10px;">Preview unavailable</div>';
    }

    // Remove temporary iframe
    document.body.removeChild(frame);
  }

  // loadCurrentSlide -- start editing the current slide
  loadCurrentSlide()
  {
    if (this.slides.length === 0 || !this.slides[this.currentSlideIndex])
      return;

    const slide = this.slides[this.currentSlideIndex];

    // Update slide info
    const typeSpan = document.getElementById('current-slide-type');
    const numberSpan = document.getElementById('current-slide-number');

    let slideNumber = 0;
    for (let i = 0; i <= this.currentSlideIndex; i++)
      if (this.slides[i].type === 'slide') slideNumber++;

    if (slide.type === 'slide') {
      typeSpan.textContent = 'Slide';
      numberSpan.textContent = `#${slideNumber}`;
    } else {
      typeSpan.textContent = 'Speaker Notes';
      numberSpan.textContent = `(Slide #${slideNumber})`;
    }

    // Load content based on view mode
    if (this.isHtmlView)
      document.getElementById('html-editor').value = slide.content;
    else
      this.initializeSquire();

    // Update the wrapper class in the iframe
    if (this.editorFrame && this.editorFrame.contentDocument) {
      const wrapper = this.editorFrame.contentDocument.getElementById(
	'slide-wrapper');
      if (wrapper) {
	const lang = slide.lang ?? this.lang;
	if (typeof lang === 'string') wrapper.lang = lang;
	else wrapper.removeAttribute('lang');
	wrapper.className = this.makeClassName(slide);

        // Reset CSS counter to make slide numbers display correctly
        wrapper.style.counterReset = `slide ${slideNumber - 1}`;
      }
    }

    // Update the style selector dropdown
    const styleSelect = document.getElementById('slide-style');
    if (styleSelect) styleSelect.value = slide.styleClass || '';

    // Update "clear" checkbox and menu item
    const clearButton = document.getElementById('slide-clear');
    if (clearButton) clearButton.checked = slide.slideClear;
    window.electronAPI.setClear(slide.slideClear);

    // Update "textfit" checkbox and menu item
    const textfitButton = document.getElementById('slide-textfit');
    if (textfitButton) textfitButton.checked = slide.slideTextfit;
    window.electronAPI.setTextfit(slide.slideTextfit);

    this.applyCssToFrame();
  }

  // updateCurrentSlideContent -- copy content from editor into slides list
  updateCurrentSlideContent()
  {
    if (this.slides.length === 0) return;

    if (this.isHtmlView) {
      this.slides[this.currentSlideIndex].content =
	document.getElementById('html-editor').value;
    } else {
      if (this.editor)
	this.slides[this.currentSlideIndex].content =
	this.editor.getHTML(false, this.prettifyContents);
    }

    if (this.slides[this.currentSlideIndex].thumbnailtimer !== null)
      clearTimeout(this.slides[this.currentSlideIndex].thumbnailtimer);
    this.slides[this.currentSlideIndex].thumbnailtimer = setTimeout((i) => {
      this.generateThumbnail(i)}, 2000, this.currentSlideIndex);
  }

  // toggleView -- switch between WYSIWYG and HTML editors
  toggleView()
  {
    this.updateCurrentSlideContent();

    this.isHtmlView = !this.isHtmlView;

    const wysiwygContainer = document.getElementById('wysiwyg-container');
    const htmlContainer = document.getElementById('html-container');
    const toggleButton = document.getElementById('toggle-view');

    if (this.isHtmlView) {
      wysiwygContainer.style.display = 'none';
      htmlContainer.style.display = 'flex';
      toggleButton.textContent = '🔄 WYSIWYG view';

      const currentSlide = this.slides[this.currentSlideIndex];
      document.getElementById('html-editor').value =
	currentSlide ? currentSlide.content : '';
    } else {
      wysiwygContainer.style.display = 'flex';
      htmlContainer.style.display = 'none';
      toggleButton.textContent = '🔄 HTML view';

      this.initializeSquire();
    }

    this.updateElementPath();
  }

  // openStylesheetDialog -- show the dialog to enter a style sheet URL
  openStylesheetDialog()
  {
    document.getElementById('stylesheet-url').value =
      this.cssUrl?.replace(/^file:\/\//i, '') || '';
    document.getElementById('stylesheet-dialog').showModal();
    document.getElementById('stylesheet-url').focus();
  }

  // browseStylesheet -- get the result of a file selection dialog and store it
  async browseStylesheet()
  {
    const filePath = await window.electronAPI.selectCssFile();
    if (filePath) document.getElementById('stylesheet-url').value = filePath;
  }

  // applyStylesheet -- handle the closing of the style sheet URL dialog
  async applyStylesheet()
  {
    this.cssUrl = await this.makeAbsolute(
      document.getElementById('stylesheet-url').value, this.currentFilePath);
    this.applyCssToFrame();
    document.getElementById('stylesheet-dialog').close();
    document.editor?.focus();
    this.setEdited();
    await this.updateLayoutsAndTransitions();
  }

  // openOpenFileDialog -- show the dialog to open a file
  openOpenFileDialog()
  {
    document.getElementById('open-file-url').value =
      this.currentFilePath?.replace(/^file:\/\//i, '') || '';
    document.getElementById('open-file-dialog').showModal();
    document.getElementById('open-file-url').focus();
  }

  // browseOpenFile -- get the result of a file selection dialog and store it
  async browseOpenFile()
  {
    const filePath = await window.electronAPI.openFile();
    if (filePath) document.getElementById('open-file-url').value = filePath;
  }

  // applyOpenFile -- handle the closing of the open-file dialog
  async applyOpenFile()
  {
    const filePath = document.getElementById('open-file-url').value;
    document.getElementById('open-file-dialog').close();
    if (filePath) {
      const realpath = await this.makeAbsolute(filePath);
      console.log(`applyOpenFile: realpath = ${realpath}`);
      const result = await this.readFileWithAuth(realpath);
      if (result.success) {
	this.fileOpened({ url: result.url, body: result.body });
      } else {
	alert('Error opening file: ' + result.error);
      }
    }
    document.editor?.focus();
  }

  // openImageDialog -- show the dialog to enter an image URL
  openImageDialog()
  {
    document.getElementById('image-dialog').showModal();
    document.getElementById('image-url').focus();
  }

  // browseImage -- get the result of a file selection dialog and store it
  async browseImage()
  {
    const filePath = await window.electronAPI.selectImageFile();
    if (filePath) document.getElementById('image-url').value = filePath;
  }

  // applyImage -- handle the closing of the style sheet URL dialog
  async applyImage()
  {
    const filePath = document.getElementById('image-url').value;
    const altText = document.getElementById('alt-text').value;
    document.getElementById('image-dialog').close();
    document.editor?.focus();
    this.setEdited();
    this.editor.insertImage(filePath, { alt: altText });
    this.editor.saveUndoState();
  }

  // updateLayoutsAndTransitions - update slide layouts and transitions menus
  async updateLayoutsAndTransitions()
  {
    let json = {}, jsonPath = null;

    if (this.cssUrl) {
      jsonPath = await this.makeAbsolute(
	this.cssUrl.replace(/\.css$/i, '') + '.json', this.currentFilePath);

      const result = await this.readFileWithAuth(jsonPath);
      if (!result.success) {
	console.log(`Info: No style sheet meta data found at ${jsonPath}. Error was: ${result.error}\nUsing defaults`);
	result.body = '{}';
      }

      try {
	if (typeof result.body === 'string') {
	  json = JSON.parse(result.body);
	} else {
	  const decoder = new TextDecoder();
	  const text = decoder.decode(result.body);
	  json = JSON.parse(text);
	}
      } catch (err) {
	window.alert(`Found a JSON file with layouts and transitions,\n\n${jsonPath}\n\nbut it has an error:\n\n${err.message}\n\nUsing defaults instead.`);
      }
    }

    // Update the stored information about the current style.
    // Use defaults for values that are not provided.
    this.cssUrlInfo.documentation = URL.parse(json.documentation,
      URL.parse(jsonPath)?.href ?? URL.parse('file://'+jsonPath)?.href)?.href;
    this.cssUrlInfo["supports-clear"] = json['supports-clear'] ?? false;
    this.cssUrlInfo.layouts = json.layouts ?? SlideEditor.defaultLayouts;
    this.cssUrlInfo.transitions = json.transitions
      ?? SlideEditor.defaultTransitions;

    // Make sure all the class fields contain arrays, not single strings.
    for (const layout of this.cssUrlInfo.layouts)
      if (!layout.class) layout.class = [];
    else if (!Array.isArray(layout.class)) layout.class = [layout.class];

    // Update the menus
    window.electronAPI.updateLayoutAndTransitionsMenus(this.cssUrlInfo);

    // Update the dropdown menu of slide layouts
    const styleSelect = document.getElementById('slide-style');
    if (styleSelect) {
      styleSelect.innerText = '';
      for (const layout of this.cssUrlInfo.layouts) {
	const option = document.createElement('option');
	option.setAttribute('value', layout.class[0] ?? '');
	option.append('' + layout.name ?? layout.class[0] ?? '');
	styleSelect.append(option);
      }
      const currentSlide = this.slides[this.currentSlideIndex];
      styleSelect.value = currentSlide?.styleClass ?? '';
    }

    // Show or hide the Clear button and menu
    const clearLabel = document.getElementById('slide-clear-label');
    if (clearLabel)
      clearLabel.style.display = this.cssUrlInfo['supports-clear']
      ? null : 'none';
    window.electronAPI.showHideClear(this.cssUrlInfo['supports-clear']);
  }

  // applyCssToFrame -- set current style URL and custom CSS in the editor frame
  applyCssToFrame()
  {
    if (!this.editorFrame || !this.editorFrame.contentDocument) return;

    const frameDoc = this.editorFrame.contentDocument;

    // Remove existing custom stylesheets
    const existingLinks = frameDoc.querySelectorAll('link[data-custom-css]');
    existingLinks.forEach(link => link.remove());

    const existingStyles = frameDoc.querySelectorAll('style[data-custom-css]');
    existingStyles.forEach(style => style.remove());

    // Add external CSS
    if (this.cssUrl) {
      const link = frameDoc.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('href', this.cssUrl);
      link.setAttribute('data-custom-css', 'true');
      frameDoc.head.appendChild(link);
    }

    // Add custom CSS
    if (this.customCss) {
      const style = frameDoc.createElement('style');
      style.setAttribute('data-custom-css', 'true');
      style.textContent = this.customCss;
      frameDoc.head.appendChild(style);
    }
  }

  // openCustomCssModal -- handle the click to open the custom CSS dialog
  openCustomCssModal()
  {
    document.getElementById('custom-css-editor').value = this.customCss;
    document.getElementById('css-modal').showModal();
  }

  // saveCustomCss -- handle click on the save button of the custom CSS dialog
  saveCustomCss()
  {
    this.customCss = document.getElementById('custom-css-editor').value;
    this.applyCssToFrame();
    document.getElementById('css-modal').close();
    document.editor?.focus();
  }

  // setSlideStyleClass -- handle click on slide layout button or menu
  setSlideStyleClass(styleClass)
  {
    if (this.slides.length === 0) return;

    const currentSlide = this.slides[this.currentSlideIndex];
    currentSlide.styleClass = styleClass;

    // Update the dropdown to reflect the new value
    const dropdown = document.getElementById('slide-style');
    if (dropdown) dropdown.value = styleClass;

    // Update the wrapper in the iframe
    if (this.editorFrame && this.editorFrame.contentDocument) {
      const wrapper = this.editorFrame.contentDocument.getElementById('slide-wrapper');
      if (wrapper) wrapper.className = this.makeClassName(currentSlide);
    }
  }

  // setDefaultTransition -- handle click on default transitions menu
  setDefaultTransition(transition)
  {
    this.defaultTransition = transition;
  }

  // setSlideTransition -- handle click on slide transitions menu
  setSlideTransition(transition)
  {
    if (this.slides.length === 0) return;

    const currentSlide = this.slides[this.currentSlideIndex];
    currentSlide.transition = transition;
  }

  // setClear -- "clear" was selected in the menu or the checkbox was clicked
  setClear(value)
  {
    if (this.slides.length === 0) return;
    const currentSlide = this.slides[this.currentSlideIndex];

    // If value is undefined, it means toggle the current value
    value ??= !currentSlide.slideClear;

    // If the slide's value is different (can it be otherwise?) update the slide
    if (currentSlide.slideClear != value) {
      currentSlide.slideClear = value;
      this.setEdited();

      // Update the slide in the editor
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      if (wrapper) wrapper.classList.toggle('clear');
    }

    // Update menu entry
    window.electronAPI.setClear(value);

    // Update "clear" checkbox
    const clearButton = document.getElementById('slide-clear');
    if (clearButton) clearButton.checked = currentSlide.slideClear;
  }

  // setTextfit -- "textfit" was selected in the menu or checkbox was clicked
  setTextfit(value)
  {
    if (this.slides.length === 0) return;
    const currentSlide = this.slides[this.currentSlideIndex];

    // If value is undefined, it means toggle the current value
    value ??= !currentSlide.slideTextfit;

    // If the slide's value is different (can it be otherwise?) update the slide
    if (currentSlide.slideTextfit != value) {
      currentSlide.slideTextfit = value;
      this.setEdited();

      // Update the slide in the editor
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      if (wrapper) wrapper.classList.toggle('textfit');
    }

    // Update menu entry
    window.electronAPI.setTextfit(value);

    // Update "clear" checkbox
    const textfitButton = document.getElementById('slide-textfit');
    if (textfitButton) textfitButton.checked = currentSlide.slideTextfit;

  }

  // newFile -- handle click on "new file" menu item (or equivalent keypress)
  newFile()
  {
    if (this.hasUnsavedChanges && !confirm('Create a new file? Unsaved changes will be lost.')) {
      return;
    }

    this.slides = [];
    this.currentSlideIndex = 0;
    this.currentFilePath = null;
    window.electronAPI.setTitle(null);
    this.addInitialSlide();
  }

  // saveFile -- handle click on "save file" menu item
  async saveFile()
  {

    if (!this.currentFilePath) {
      this.openSaveAsDialog();
    } else {
      document.getElementById('save-as-url').value = this.currentFilePath;
      this.applySaveAs();
    }
  }

  // openSaveAsDialog -- show the dialog to save the slides under a new name
  openSaveAsDialog()
  {
    document.getElementById('save-as-url').value =
      this.currentFilePath?.replace(/^file:\/\//i, '') ?? '';
    document.getElementById('save-as-dialog').showModal();
    document.getElementById('stylesheet-url').focus();
  }

  // browseSaveAs -- get the result of a file selection dialog
  async browseSaveAs()
  {
    const filePath = await window.electronAPI.saveFileDialog(
      this.currentFilePath);
    if (filePath) document.getElementById('save-as-url').value = filePath;
  }

  // applySaveAs -- handle the closing of the Save As dialog
  async applySaveAs()
  {
    const filePath = document.getElementById('save-as-url').value;
    const notifications = document.getElementById('notifications')
    const notificationsText = document.getElementById('notifications-text')
    document.getElementById('save-as-dialog').close();
    document.editor?.focus();
    if (filePath) {
      notificationsText.innerText = '…';
      notifications.style.display = 'flex';
      const realpath = await this.makeAbsolute(filePath);
      await this.writeToFile(realpath);
      notifications.style.display = 'none';
    }
  }

  // getOrigin -- get the "origin" (protocol, host and port) of a path or URL
  getOrigin(url)
  {
    if (this.isUrl(url)) return URL.parse(url).origin;
    return URL.parse('file://' + url).origin;
  }

  // getRealm -- get the realm from a WWW-Authenticate header
  getRealm(headerValue)
  {
    if (!headerValue) return '';
    const m = headerValue.match(
      /\bBasic +realm *= *(?:"((?:\\.|[^"\\])*)"|([-!#$%&'*+.^_`|~0-9a-z]+))/i);
    if (!m) return '';
    else if (m[2]) return m[2];
    else return m[1].replaceAll(/\\(.)/g, '$1');
  }

  // writeFileWithAuth -- write a file, handle authentication if needed
  async writeFileWithAuth(url, body)
  {
    let result;

    console.log(`writeFileWithAuth(${url},...)`);
    result = await window.electronAPI.writeFile(url, body);
    console.log(`- ${JSON.stringify(result)}`);

    // If authentication is requested, see if we have a password or
    // ask the user for one. Repeat until we have a password that
    // works or the user cancelled the password dialog.
    while (result.status === 401) {
      const url = result.url;
      const origin = this.getOrigin(url);
      const realm = this.getRealm(result.authenticate);
      const key = origin + '/' + realm;
      let auth = this.auths.get(key);
      if (!auth) {		// We don't have a password, ask the user
	const { promise, resolve } = Promise.withResolvers();
	this.openPasswordDialog(url, realm, resolve);
	auth = await promise;
      }
      if (!auth) {		// User cancelled the password dialog
	console.log(`- Cancelled`);
	result = {success: false, status: 0, error: 'Cancelled'}
      } else {			// Try with the password
	console.log(`- Trying new authentication ${auth.substring(0, 5)}...`);
	result = await window.electronAPI.writeFile(url, body, auth);
	console.log(`- ${JSON.stringify(result)}`);
	// If the password worked, remember it, if not, forget it. (It
	// may already have been stored or deleted, but that is OK.)
	if (result.success) this.auths.set(key, auth);
	else this.auths.delete(key);
      }
    }

    return result;
  }

  // readFileWithAuth -- download a file, handle authentication if needed
  async readFileWithAuth(url)
  {
    let result;

    console.log(`readFileWithAuth(${url},...)`);
    result = await window.electronAPI.readFile(url);
    console.log(`- ${JSON.stringify(result)}`);

    // If authentication is requested, see if we have a password or
    // ask the user for one. Repeat until we have the password works
    // or the user cancels the password dialog.
    while (result.status === 401) {
      const url = result.url;
      const origin = this.getOrigin(url);
      const realm = this.getRealm(result.authenticate);
      const key = origin +'/'+ realm;
      let auth = this.auths.get(key);
      if (!auth) {		// We don't have a stored passw, ask the user
	const {promise, resolve} = Promise.withResolvers();
	this.openPasswordDialog(url, realm, resolve);
	auth = await promise;
      }
      if (!auth) {		// User cancelled the password dialog
	console.log(`- Cancelled`);
	result = { success: false, status: 0, error: 'Cancelled' };
      } else {			// Try with this password
	console.log(`- Trying new authentication ${auth.substring(0, 5)}...`);
	result = await window.electronAPI.readFile(url, auth);
	console.log(`- ${JSON.stringify(result)}`);
        // If the password worked, remember it. If not, forget it. (It
	// may already have been entered or deleted, but that is OK.)
	if (result.success) this.auths.set(key, auth);
	else this.auths.delete(key);
      }
    }

    return result;
  }

  // makeFileName -- make a unique path from an old filename and a directory
  makeFileName(oldName, dir, newNames, uniqueNames)
  {
    // The dir ends in '/'.
    // Check if we already made a name previously. If so, return it.
    if (newNames.get(oldName)) return newNames.get(oldName);

    // As a first try, concatenate the dir with the old base name.
    const baseName = URL.parse(oldName, 'file:///').pathname.replace(/.*\//, '');
    let fullName = dir + baseName;

    // If that name is already used, try prefixing the base name with
    // a number, until we have an unused name.
    let n = 0;
    while (uniqueNames.has(fullName)) fullName = dir + n++ + baseName;

    // Remember this mapping of old to new names.
    newNames.set(oldName, fullName);
    uniqueNames.add(fullName);

    return fullName;
  }

  // rewriteStyleResources -- rewrite occurrences of url() and save resources
  async rewriteStyleResources(content, oldBase, newBase, absUploadDir,
    newNames, uniqueNames)
  {
    const notificationsText = document.getElementById('notifications-text')
    let errorOccurred = false;

    // If the content isn't a string, it is a byte array. We assume it
    // is UTF-8-encoded text.
    const decoder = new TextDecoder;
    const old = typeof content === 'string' ? content : decoder.decode(content);

    const regex = /("(?:[^"]|\\")*")|('(?:[^']|\\')*')|(\/\*(?:[^/]|[^*]\/)*\*\/)|url\(\s*"((?:[^"]|\\")*)"\s*\)|url\(\s*'((?:[^']|\\')*)'\s*\)|url\(\s*([^\s)]+)\s*\)/ig;

    // Find all occurrences of url(...) in the style sheet that do not
    // occur inside a string or a comment. Check if the resources they
    // point to need to be uploaded and determine their new URLs. Save
    // the new URLs in the newNames map.
    for (const match of old.matchAll(regex)) {
      const oldUrl = match[4] ?? match[5] ?? match[6];
      if (!oldUrl) continue;	// Matched a string or comment
      const absOldUrl = this.absolute(oldUrl, oldBase);
      if (newNames.has(absOldUrl)) continue; // Already handled
      if (this.isLocal(absOldUrl) && absUploadDir) {
	// Need to put the resource online.
	const absNewUrl = this.makeFileName(absOldUrl, absUploadDir,
	  newNames, uniqueNames);
	notificationsText.innerText = 'Reading ' + absOldUrl;
	const readResult = await this.readFileWithAuth(absOldUrl);
	if (!readResult.success) {
	  if (!errorOccurred) {
	    notificationsText.innerText = readResult.error + ' reading '
	      + absOldUrl;
	    alert('Error reading ' + absOldUrl
		+ '\n(' + readResult.error + ')\n'
		+ 'Saved style sheet will probably not work');
	  }
	  errorOccurred = true;
	} else {		// Read successfully
	  notificationsText.innerText = 'Writing ' + absNewUrl;
	  const writeResult = await this.writeFileWithAuth(absNewUrl,
	    readResult.body);
	  if (!writeResult.success) {
	    if (!errorOccurred) {
	      notificationsText.innerText = writeResult.error + ' writing '
		+ absNewUrl;
	      alert('Error writing ' + absNewUrl
		  + '\n(' + writeResult.error + ')\n'
		  + 'Saved style sheet will probably not work');
	    }
	    errorOccurred = true;
	  }
	}
	const newUrl = this.relative(newBase, absNewUrl);
	newNames.set(absOldUrl, newUrl); // Overwrite with relative URL
      } else if (this.isAbsolute(oldUrl)) {
	// Resource is a URL or has an absolute path. No need to rewrite.
	newNames.set(absOldUrl, oldUrl);
      } else {
	// Need to rewrite the relative URL
	newNames.set(absOldUrl, this.relative(newBase, oldAbsUrl));
      }
    }

    // Now rewrite all url() in the style sheet to the their new URLs.
    const newContent = old.replaceAll(regex,
      (match, dqstring, sqstring, comment, dqurl, squrl, url) => {
	const oldURL = dqurl ?? squrl ?? url;
	if (!oldURL) return match;
	const oldAbsUrl = this.absolute(oldURL, oldBase);
	const newUrl = newNames.get(oldAbsUrl);
	if (!newUrl) return match;
	else if (dqurl) return `url("${newUrl}")`;
	else if (squrl) return `url('${newUrl}')`;
	else return `url(${newUrl})`;
      });

    return errorOccurred ? old : newContent;
  }

  // writeToFile -- save the current document to the named file or URL
  async writeToFile(filePath)
  {
    // filePath is a URL (which may be a "file:" URL).
    const notificationsText = document.getElementById('notifications-text')

    this.updateCurrentSlideContent();

    // Create a temporary copy of the slide deck (with only the data
    // needed for generating an HTML file.)
    const newDoc = {};
    this.copySlideDeckData(this, newDoc);
    newDoc.currentFilePath = filePath;

    if (newDoc.currentFilePath === this.currentFilePath) {
      // Saving to same location as last read or save. No need to
      // adjust links.
    } else if (!this.isLocal(newDoc.currentFilePath)) {
      // If we are saving to the web, we need to upload all local
      // resources and rewrite their URLs.
      // TO DO: Handle srcset and other URL-values attributes.
      const newNames = new Map();
      const uniqueNames = new Set();
      const fileUrl = URL.parse(filePath);
      if (!fileUrl) {alert(`Error parsing the URL ${filePath}`); return}
      const relUploadDir = fileUrl.pathname.replace(/^.*\//, '').replace(
       	/\.html?$/i, '') + '-files/';
      const absUploadDir = URL.parse(relUploadDir, fileUrl).href;
      if (!absUploadDir) {alert(`Bug? ${relUploadDir}`); return}

      const oldBase = this.currentFilePath;
      const newBase = newDoc.currentFilePath;

      const absOldCssUrl = this.absolute(this.cssUrl, oldBase);
      let newCssUrl;
      if (this.isLocal(absOldCssUrl)) {
	// The style sheet is local. We need to upload it.
	const absNewCssUrl = this.makeFileName(absOldCssUrl, absUploadDir,
	  newNames, uniqueNames);
	notificationsText.innerText = 'Reading ' + absOldCssUrl;
	const readResult = await this.readFileWithAuth(absOldCssUrl);
	if (!readResult.success) {
	  notificationsText.innerText = readResult.error + ' reading '
	    + absOldCssUrl;
	  alert('Error reading ' + absOldCssUrl
	      + '\n(' + readResult.error + ')\nGiving up');
	  return;
	}
	const styleContent = await this.rewriteStyleResources(readResult.body,
	  absOldCssUrl, absNewCssUrl, absUploadDir, newNames, uniqueNames);
	notificationsText.innerText = 'Writing ' + absNewCssUrl;
	const writeResult = await this.writeFileWithAuth(absNewCssUrl,
	  styleContent);
	if (!writeResult) {
	  notificationsText.innerText = writeResult.error + ' writing '
	    + absNewCssUrl;
	  alert('Error writing ' + absNewCssUrl
	      + '\n(' + writeResult.error + ')\nGiving up');
	  return;
	}
	newCssUrl = this.relative(newBase, absNewCssUrl);
      } else {
	// The style sheet is on the web. Just make its URL relative.
	newCssUrl = this.relative(newBase, this.absolute(absOldCssUrl,oldBase));
      }
      newDoc.cssUrl = newCssUrl;

      const parser = new DOMParser;
      for (const slide of newDoc.slides) {
	// Look for all src attributes, upload their target, if
	// needed, and update the attribute.
	let html = '<!DOCTYPE html><base href=""><body>' + slide.content;
	const doc = parser.parseFromString(html, 'text/html');
	doc.getElementsByTagName('base')[0].href = oldBase;
	for (const e of doc.querySelectorAll('[src]')) {
	  const old = e.src;
	  let relNewUrl;
	  if (this.isLocal(old)) {
	    // The resource is local. We need to upload it.
	    const absNewUrl = this.makeFileName(old, absUploadDir,
	      newNames, uniqueNames);
	    notificationsText.innerText = 'Reading ' + old;
	    const readResult = await this.readFileWithAuth(old);
	    if (!readResult.success) {
	      notificationsText.innerText = readResult.error + ' reading '
		+ old;
	      alert('Error while reading the style sheet (' + readResult.error
		  + ')\nGiving up');
	      return;
	    }
	    notificationsText.innerText = 'Writing ' + absNewUrl;
	    const writeResult = await this.writeFileWithAuth(absNewUrl,
	      readResult.body);
	    if (!writeResult.success) {
	      notificationsText.innerText = writeResult.error + ' writing '
		+ absNewUrl;
	      alert('Error while saving the style sheet (' + writeResult.error
		  + ')\nGiving up');
	      return;
	    }
	    relNewUrl = this.relative(newBase, absNewUrl);
	  } else {
	    // The resource is on the web. Just make its URL relative.
	    relNewUrl = this.relative(newBase, old);
	  }
	  e.setAttribute('src', relNewUrl);
	}
	for (const e of doc.querySelectorAll('a[href]'))
	  e.setAttribute('href', this.relative(newBase, e.href));
	// Update the text now that the links have been rewritten.
	slide.content = doc.body.innerHTML;
      }
    } else {
      // We are writing to a local file. Need to rewrite
      // relative path name of images, style sheets, etc.
      // TO DO: Handle srcset attributes.
      // TO DO: Save (some) remote resources to local files?
      const oldBase = this.currentFilePath;
      const newBase = newDoc.currentFilePath;
      newDoc.cssUrl = this.relative(newBase,
	this.absolute(this.cssUrl, oldBase));
      const parser = new DOMParser;
      for (const slide of newDoc.slides) {
	let html = '<!DOCTYPE html><base href=""><body>' + slide.content;
	const doc = parser.parseFromString(html, 'text/html');
	doc.getElementsByTagName('base')[0].href = oldBase;
	for (const e of doc.querySelectorAll('[src]'))
	  e.src = this.relative(newBase, e.src);
	for (const e of doc.querySelectorAll('a[href]'))
	  e.href = this.relative(newBase, e.href);
	// Update the text now that the links have been rewritten.
	slide.content = doc.body.innerHTML;
      }
    }

    // Now save the document itself.
    notificationsText.innerText = 'Writing ' + filePath;
    const html = await this.generateHtml(newDoc);
    const result = await this.writeFileWithAuth(filePath, html);

    if (result.success) {
      this.copySlideDeckData(newDoc, this);
      const baseTag =
	    this.editorFrame.contentDocument.getElementById('base-url');
      const realfile = await this.makeAbsolute(this.currentFilePath);
      if (baseTag && realfile) baseTag.setAttribute('href', realfile);
      this.setEdited(false);
      alert('File saved successfully!');
    } else {
      notificationsText.innerText = result.error + ' writing ' + filePath;
      alert('Error writing ' + filePath + '\n(' + result.error + ')');
    }
  }

  // openPasswordDialog -- show the password dialog
  openPasswordDialog(filePath, realm, nextAction)
  {
    if (!this.editor || this.isHtmlView) return;
    this.nextAction = nextAction;
    const dialog = document.getElementById('password-dialog');
    const urlLabel = document.getElementById('password-dialog-url');
    const realmLabel = document.getElementById('password-dialog-realm');
    const username = document.getElementById('password-dialog-username-input');
    const password = document.getElementById('password-dialog-password-input');
    const origin = this.getOrigin(filePath);
    const auth = this.auths.get(origin);
    urlLabel.innerText = filePath;
    realmLabel.innerText = realm;
    dialog.showModal();
    username.focus();
  }

  // applyPassword -- use the entered username+password to save the current file
  applyPassword()
  {
    const username = document.getElementById('password-dialog-username-input');
    const password = document.getElementById('password-dialog-password-input');
    console.log(`applyPassword() -> ${username.value}:...`);
    this.nextAction(username.value + ':' + password.value);
    document.getElementById('password-dialog').close();
    // this.nextAction(null);
    document.editor?.focus();
  }

  // askPassword -- ask user for a username and password on behalf of the app
  askPassword(url, realm)
  {
    this.openPasswordDialog(url, realm, window.electronAPI.replyPassword);
  }

  async playSlides()
  {
    // Save current content
    this.updateCurrentSlideContent();

    // Get the temp file path first
    const tempPath = await window.electronAPI.getTempFilePath();

    // Generate HTML with base tag (if we have a current file path)
    const html = await this.generateHtmlForPlay();

    // Write to temporary file
    const tempResult = await window.electronAPI.writeTempFile(html);

    if (tempResult.success) {

      // Open in browser
      const openResult = await window.electronAPI.openInBrowser('file://'
	  + tempResult.path);

      if (!openResult.success)
        alert('Error opening browser: ' + openResult.error);
    } else {
      alert('Error writing temporary file: ' + tempResult.error);
    }
  }

  async generateHtmlForPlay()
  {
    const realfile = await this.makeAbsolute(this.currentFilePath);
    const lang = typeof this.lang === 'string'
	  ? ` lang="${this.escapeHTML(this.lang)}"` : '';

    let html = `<!DOCTYPE html>\n<html${lang}>\n<head>\n`;
    html += '<meta charset=UTF-8>\n';
    html += '<meta name=viewport content="width=device-width,initial-scale=1.0">\n';
    html += '<title>Slide Deck</title>\n';

    // Add base tag if we have a current file directory
    if (realfile) html += `<base href="${realfile}">\n`;

    // Add CSS link, if we have a style sheet.
    if (this.cssUrl)
      html += `<link rel="stylesheet" href="${this.cssUrl}">\n`;

    if (this.customCss)
      html += `<style>\n${this.customCss}\n</style>\n`;

    if (this.includeB6plus) {
      html += '<script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';
    }

    // Add default transition to body if set
    const bodyClass = this.defaultTransition ? `b6plus ${this.defaultTransition}` : 'b6plus';
    html += `</head>\n<body class="${bodyClass}">\n`;

    this.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      const lang = typeof slide.lang === 'string'
	    ? ` lang="${this.escapeHTML(slide.lang)}"` : '';
      html += `\n<section${id}${lang} class="${this.makeClassName(slide)}">`;
      // html += slide.content.split('\n').map(line => '        ' + line).join('\n');
      html += slide.content + '</section>\n';
    });

    html += '\n</body>\n</html>';

    return html;
  }

  async generateHtml(doc)
  {
    const lang = typeof doc.lang === 'string'
	  ? ` lang="${this.escapeHTML(doc.lang)}"` : '';

    let html = `<!DOCTYPE html>\n<html${lang}>\n<head>\n`;
    html += '<meta charset="UTF-8">\n';
    html += '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n';
    html += '<title>Slide Deck</title>\n';

    if (doc.cssUrl)
      html += `<link rel="stylesheet" href="${doc.cssUrl}">\n`;

    if (doc.customCss)
      html += `<style>\n${doc.customCss}\n</style>\n`;

    if (doc.includeB6plus)
      html += '<script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';

    // Add default transition to body if set
    const bodyClass = doc.defaultTransition ? ` class="b6plus ${doc.defaultTransition}"` : ' class="b6plus"';
    html += `</head>\n<body${bodyClass}>\n`;

    doc.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      const lang = typeof slide.lang === 'string'
	    ? ` lang="${this.escapeHTML(slide.lang)}"` : '';
      html += `\n<section${id}${lang} class="${this.makeClassName(slide)}">`;
      // html += slide.content.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += slide.content + '</section>\n';
    });

    html += '\n</body>\n</html>';

    return html;
  }

  async fileOpened(data)
  {
    console.log(`fileOpened({${data.url},...})`);
    if (this.hasUnsavedChanges
	&& !confirm('Open a file? Unsaved changes will be lost.'))
      return;

    const { url, body } = data;
    const realfile = await this.makeAbsolute(url);
    console.log(`  realfile = ${realfile}`);

    // Update base URL in iframe for relative paths
    if (this.editorFrame?.contentDocument) {
      const baseTag =
	    this.editorFrame.contentDocument.getElementById('base-url');
      if (baseTag && realfile) baseTag.setAttribute('href', realfile);
    }

    this.currentFilePath = realfile;
    const decoder = new TextDecoder();
    const html = decoder.decode(body);
    await this.parseHtml(html);
    console.log(`  parsed ${this.slides.length} slides`);
    this.setEdited(false);
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  // fileToOpen -- handle file passed on the command line or drag & dropped
  fileToOpen(path)
  {
    document.getElementById('open-file-url').value = path;
    this.applyOpenFile();
  }

  async parseHtml(html)
  {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract language. (Don't use .lang, because it doesn't
    // distinguish the empty string from the absence of the
    // attribute.)
    this.lang = doc.documentElement.getAttribute('lang');

    // Extract CSS URL
    const linkElement = doc.querySelector('link[rel="stylesheet"]');
    this.cssUrl = linkElement?.getAttribute('href');

    // Update the menu of layouts defined by the style sheet.
    this.updateLayoutsAndTransitions();

    // Extract custom CSS
    const styleElement = doc.querySelector('style');
    if (styleElement) this.customCss = styleElement.textContent.trim();

    // Check for b6plus script
    const b6plusScript = doc.querySelector('script[src*="b6plus"]');
    this.includeB6plus = !!b6plusScript;
    document.getElementById('include-b6plus').checked = this.includeB6plus;

    // Extract default transition from body
    this.defaultTransition = '';
    for (const t of this.cssUrlInfo.transitions)
      if (t.class
	  && t.class.split(' ').every(c => doc.body.classList.contains(c))) {
	this.defaultTransition = t.class;
	break;
      }

    // Extract slides
    this.slides = [];
    const sections = doc.querySelectorAll('body > .slide, body > .comment');

    sections.forEach(section => {
      // Find the language, if any.
      const lang = section.lang;

      // Find the type and remove it from the classes.
      const type = section.classList.contains('comment') ? 'comment' : 'slide';
      section.classList.remove(type);

      // Find if the slide uses class=clear, and remove it from the classes.
      let clear = section.classList.contains('clear');
      if (clear) section.classList.remove('clear');

      // Find if the slide uses class=textfit, and remove it from the classes.
      let textfit = section.classList.contains('textfit');
      if (textfit) section.classList.remove('textfit');

      // Find the slide's transition, if any, and remove it from the classes.
      let transition = '';
      for (const t of this.cssUrlInfo.transitions)
	if (t.class
	    && t.class.split(' ').every(c => section.classList.contains(c)))
	  transition = t.class;
      if (transition)
	for (const c of transition.split(' ')) section.classList.remove(c);

      // Find the slide's layout class, if any, and remove it from the classes.
      let layout = '', classes;
      for (const h of this.cssUrlInfo.layouts)
	for (const x of h.class)
	  if (x && x.split(' ').every(c => section.classList.contains(c))) {
	    classes = x;
	    layout = h.class[0]; // The zeroth entry is the canonical one
	  }
      if (layout)
	for (const c of classes.split(' ')) section.classList.remove(c);

      this.slides.push({
        type: type,
        content: section.innerHTML.trim(),
	lang: lang,
	styleClass: layout,
        transition: transition,
        slideTextfit: textfit,
        slideClear: clear,
	otherClasses: section.className,
	id: section.id
      });
    });

    if (this.slides.length === 0) this.addInitialSlide();
    else this.currentSlideIndex = 0;
  }

  zoomIn()
  {
    this.zoomLevel = Math.min(this.zoomLevel + 0.1, 3.0);
    this.applyZoom();
  }

  zoomOut()
  {
    this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.3);
    this.applyZoom();
  }

  zoomReset()
  {
    this.zoomLevel = 1.0;
    this.applyZoom();
  }

  applyZoom()
  {
    if (this.editorFrame && this.editorFrame.contentDocument) {
      const body = this.editorFrame.contentDocument.body;
      if (body) body.style.zoom = this.zoomLevel;
    }
  }

  undo()
  {
    if (this.editor && !this.isHtmlView) this.editor.undo();
  }

  redo()
  {
    if (this.editor && !this.isHtmlView) this.editor.redo();
  }

  // selectAll -- handle a click on the "select all" menu or key press
  selectAll()
  {
    if (!this.editor || this.isHtmlView) return;

    const frameDoc = this.editorFrame.contentDocument;
    const wrapper = frameDoc.getElementById('slide-wrapper');

    if (wrapper) {
      const selection = frameDoc.getSelection();
      const range = frameDoc.createRange();
      range.selectNodeContents(wrapper);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // styleHelp -- user selected the Style Help menu item
  async styleHelp()
  {
    if (this.cssUrlInfo.documentation) {
      const result = await
      window.electronAPI.openInBrowser(this.cssUrlInfo.documentation);
      if (!result.success) alert('Error opening browser: ' + result.error);
    }
  }

  // updateFormatButtonStates -- update the active state of the format buttons
  updateFormatButtonStates()
  {
    if (!this.editor || this.isHtmlView) return;

    // Get current format state from Squire
    const isStrong = this.editor.hasFormat('strong');
    const isEmphasis = this.editor.hasFormat('em');
    const isBold = this.editor.hasFormat('b');
    const isItalic = this.editor.hasFormat('i');
    const isUnderline = this.editor.hasFormat('u');
    const isStrikethrough = this.editor.hasFormat('s') || this.editor.hasFormat('strike');
    const isCode = this.editor.hasFormat('code');
    const isTh = this.editor.hasFormat('th');

    // Update button states
    const strongBtn = document.getElementById('format-strong');
    const emphasisBtn = document.getElementById('format-emphasis');
    const boldBtn = document.getElementById('format-bold');
    const italicBtn = document.getElementById('format-italic');
    const underlineBtn = document.getElementById('format-underline');
    const strikeBtn = document.getElementById('format-strikethrough');
    const codeBtn = document.getElementById('format-code');
    const thBtn = document.getElementById('toggle-header-cell');

    if (strongBtn) strongBtn.classList.toggle('active', isStrong);
    if (emphasisBtn) emphasisBtn.classList.toggle('active', isEmphasis);
    if (boldBtn) boldBtn.classList.toggle('active', isBold);
    if (italicBtn) italicBtn.classList.toggle('active', isItalic);
    if (underlineBtn) underlineBtn.classList.toggle('active', isUnderline);
    if (strikeBtn) strikeBtn.classList.toggle('active', isStrikethrough);
    if (codeBtn) codeBtn.classList.toggle('active', isCode);
    if (thBtn) thBtn.classList.toggle('active', isTh);
  }

  // formatInline -- handle click on a formatting button or menu item
  formatInline(format)
  {
    if (!this.editor || this.isHtmlView) return;
    if (this.editor.hasFormat(format))
      this.editor.changeFormat(null, {tag: format});
    else
      this.editor.changeFormat({tag: format});
    this.updateFormatButtonStates();
  }

  // formatlink -- handle a click on the Link button or menu
  formatLink()
  {
    if (!this.editor || this.isHtmlView) return;

    // Check if there's already a link and get its URL
    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) return;

    let currentUrl = '';
    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;

    if (element.nodeType === 3) element = element.parentNode;

    // Find if we're inside a link
    while (element && element !== frameDoc.body) {
      if (element.tagName && element.tagName.toLowerCase() === 'a') {
        currentUrl = element.getAttribute('href') || '';
        break;
      }
      element = element.parentNode;
    }

    document.getElementById('link-url').value = currentUrl;
    document.getElementById('link-dialog').showModal();
  }

  applyLink()
  {
    document.getElementById('link-dialog').close();
    document.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    const url = document.getElementById('link-url').value.trim();

    if (url) {
      this.editor.makeLink(url);
      this.updateCurrentSlideContent();
    }
  }

  removeLink()
  {
    document.getElementById('link-dialog').close();
    document.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    this.editor.removeLink();
    this.updateCurrentSlideContent();
  }

  formatRemoveFormat()
  {
    if (this.editor && !this.isHtmlView) this.editor.removeAllFormatting();
  }

  formatUl()
  {
    if (this.editor && !this.isHtmlView) this.editor.makeUnorderedList();
  }

  formatOl()
  {
    if (this.editor && !this.isHtmlView) this.editor.makeOrderedList();
  }

  increaseListLevel()
  {
    if (this.editor && !this.isHtmlView) this.editor.increaseListLevel();
  }

  decreaseListLevel()
  {
    if (this.editor && !this.isHtmlView) this.editor.decreaseListLevel();
  }

  // renameElement -- replace an element by one with same content but a new name
  renameElement(element, newName)
  {
    const newElement = element.ownerDocument.createElement(newName);
    for (const attr of element.attributes)
      newElement.setAttribute(attr.name, attr.value);
    newElement.append(...element.childNodes);
    if (element.parentNode) element.replaceWith(newElement);
    return newElement;
  }

  // setBlockFormat -- handle a click on the block format menus
  setBlockFormat(format)
  {
    if (!this.editor || this.isHtmlView) return;

    if (format === 'unwrap') {

      const frameDoc = this.editorFrame.contentDocument;
      const editorElement = frameDoc.getElementById('slide-wrapper');
      const selection = this.editor.getSelection();
      let container, e = selection.commonAncestorContainer;
      while (!container && e && e !== editorElement && e !== frameDoc)
	if (['BLOCKQUOTE', 'DIV', 'DETAILS', 'ARTICLE', 'SECTION', 'ASIDE']
	    .includes(e.nodeName)) container = e;
      else e = e.parentNode;
      if (container) {
	this.editor.modifyBlocks(frag => {
	  if (container.firstElementChild?.tagName === 'SUMMARY')
	    this.renameElement(container.firstElementChild, 'p');
	  if (frag.firstChild !== container)
	    container.replaceWith(...container.childNodes);
	  else
	    frag.replaceChildren(...container.childNodes);
	  return frag;
	});
      } // else no container found, so do nothing.

    } else if (format === 'blockquote') {

      this.editor.increaseQuoteLevel();

    } else if (format === 'div' || format === 'details' || format === 'article'
	|| format == 'section' || format === 'aside') {

      this.editor.modifyBlocks(fragment => {
	const newElt = fragment.ownerDocument.createElement(format);
	newElt.appendChild(fragment);
	if (format === 'details')
      	  this.renameElement(newElt.firstChild, 'summary');
	return newElt;
      });

    } else {

      this.editor.removeList();
      this.editor.forEachBlock(block => {
	if (block.tagName.toLowerCase() !== format) {
	  if (block.parentElement?.tagName === 'DETAILS')
	    this.renameElement(block.parentElement, 'div');
	  this.renameElement(block, format);
	};
	return false;
      },
	true);
    }

    this.updateElementPath();
    this.editor.focus();
  }

  // countColumns -- return the number of columns of a table
  countColumns(table)
  {
    let columns = 0;
    for (const rowgroup of table.children)
      if (rowgroup.tagName === 'THEAD' || rowgroup.tagName === 'TBODY'
	  || rowgroup.tagName === 'TFOOT') {
	for (const row of rowgroup.children) {
	  let n = 0;
	  for (const cell of row.children) n += cell.colSpan;
	  if (n > columns) columns = n;
	}
      }
    return columns;
  }

  // addTable -- handle a click on the "add table" button or menu
  makeTable()
  {
    const selection = this.editor.getSelection();
    const selectedText = this.editor.getSelectedText();
    this.editor.insertHTML('<table><tr><td>' + (selectedText || '<br>')
	+ '</td><td><br></tr><tr><td><br></td><td><br></tr></table>');
  }

  // addHeaderRow -- handle a click on the "add header row" button or menu
  addHeaderRow()
  {
    const selection = this.editor.getSelection();
    const cursor = selection.cloneRange();
    cursor.collapse();		// The end of the selection

    // Find the element to insert the row in or after.
    let target = cursor.commonAncestorContainer;
    if (target.nodeType !== 1) target = target.parentNode;
    target = target.closest('thead > tr, table');
    if (!target) return;	// We're not in a table

    this.editor.saveUndoState();

    // Make a new row with the right number of columns.
    const newRow = table.ownerDocument.createElement('tr');
    for (let i = this.countColumns(table); i > 0; i--)
      newRow.append(table.ownerDocument.createElement('th'));

    // Insert the row.
    if (target.tagName === 'TR') {
      // Selection was in a header row. Insert the new row after it.
      target.after(newRow);
    } else {			// 'TABLE'
      // Selection was elsewhere in a table. Find or make a thead and
      // insert the row at its end.
      let thead = table.firstElementChild;
      if (!thead || thead.tagName !== 'THEAD') {
	thead = target.ownerDocument.createElement('thead');
	target.prepend(thead);
      }
      thead.append(newRow);
    }
    this.editor.focus();
  }

  // addRow -- handle a click on the "add row" button or menu
  addRow()
  {
    const selection = this.editor.getSelection();
    const cursor = selection.cloneRange();
    cursor.collapse();		// The end of the selection

    // Find an element to insert the new row in or after.
    let target = cursor.commonAncestorContainer;
    if (target.nodeType !== 1) target = target.parentNode;
    target = target.closest('tbody > tr, table');
    if (!target) return;	// We're not in a table
    const table = target.closest('table');

    this.editor.saveUndoState();

    // Make a new row with the right number of columns.
    const newRow = target.ownerDocument.createElement('tr');
    for (let i = this.countColumns(table); i > 0; i--)
      newRow.append(target.ownerDocument.createElement('td'));

    if (target.tagName === 'TR') {
      // Selection was in a body row. Insert the new row after it.
      target.after(newRow);
    } else {			// 'TABLE'
      // Selection was in a table, but not in a tbody. Find or make a
      // tbody and insert the new row at the end of it.
      let tbody = target.querySelector('> tbody');
      if (!tbody) {
	tbody = target.ownerDocument.createElement('tbody');
	target.apppend(tbody);
      }
      tbody.append(newRow);
    }

    this.editor.focus();
  }

  // addColumn -- handle a click on the "add column" button or menu
  addColumn()
  {
    const selection = this.editor.getSelection();
    const cursor = selection.cloneRange();
    cursor.collapse();		// The end of the selection

    let target = cursor.commonAncestorContainer;
    if (target.nodeType !== 1) target = target.parentNode;
    if (target.tagName !== 'TD' && target.tagName !== 'TH') return;

    // Calculate the column index of the new column.
    let col = 0;
    for (let e = target; e; e = e.previousElementSibling)
      col += e.colSpan;

    this.editor.saveUndoState();

    // Insert a new cell in each row of each rowgroup.
    const table = target.closest('table');
    for (const rowgroup of table.children)
      if (rowgroup.tagName === 'THEAD' || rowgroup.tagName === 'TBODY'
	  || rowgroup.tagName === 'TFOOT') {
	for (const row of rowgroup.children) {

	  // Create a new cell
	  const newCell = target.ownerDocument.createElement(
	    rowgroup.tagName === 'TBODY' ? 'td' : 'th');

	  // Find the last cell before, or overlapping, the intended column.
	  let c = row.firstElementChild;
	  let i = 0
	  while (i < col) {
	    if (i + c.colSpan >= col || !c.nextElementSibling) {
	      const rest = Math.max(i + c.colSpan - col, 0);
	      newCell.colSpan = 1 + rest;
	      c.colSpan = col - i;
	      c.after(newCell);
	    }
	    i += c.colSpan;
	    c = c.nextElementSibling;
	  }
	}
      }

    this.editor.focus();
  }

  // deleteRows -- handle a click on the "delete rows" button or menu
  deleteRows()
  {
    const selection = this.editor.getSelection();

    // Find the row in which the selection starts.
    const startSelection = selection.cloneRange();
    startSelection.collapse(true);
    let startRow = startSelection.commonAncestorContainer;
    if (startRow.nodeType !== 1) startRow = startRow.parentNode;
    startRow = startRow.closest('tr');
    if (!startRow) return;		// Selection is not inside a table

    // Find the row in which the selection ends.
    const endSelection = selection.cloneRange();
    endSelection.collapse(false);
    let endRow = endSelection.commonAncestorContainer;
    if (endRow.nodeType !== 1) endRow = endRow.parentNode;
    endRow = endRow.closest('tr');
    if (!endRow) return;		// Selection is not inside a table

    // Check that the selection is all within a single table.
    let startTable = startRow.closest('table');
    let endTable = endRow.closest('table');
    if (startTable !== endTable) return;

    this.editor.saveUndoState();

    // TODO: Adjust rowspan attributes.
    const startIndex = startRow.rowIndex;
    const endIndex = endRow.rowIndex;
    for (let i = endIndex; i >= startIndex; i--) startTable.deleteRow(i);

    // // Remove the rows between startRow and endRow, inclusive.
    // let row, next = startRow;
    // do {
    //   row = next;
    //   next = next.nextElementSibling;
    //   if (!next) next = row.parentNode.nextElementSibling?.firstElementChild;
    //   row.remove();
    // } while (next && next.tagName === 'TR' && row !== endRow);

    this.editor.focus();
  }

  // deleteColumns -- handle a click on the "delete columns" button or menu
  deleteColumns()
  {
    const selection = this.editor.getSelection();

    // Find the cell or row in which the selection starts.
    const startSelection = selection.cloneRange();
    startSelection.collapse(true);
    let startColumn = startSelection.commonAncestorContainer;
    if (startColumn.nodeType !== 1) startColumn = startColumn.parentNode;
    startColumn = startColumn.closest('td, th');
    if (!startColumn) return;		// Selection is not inside a table

    // Find the cell or row in which the selection ends.
    const endSelection = selection.cloneRange();
    endSelection.collapse(false);
    let endColumn = endSelection.commonAncestorContainer;
    if (endColumn.nodeType !== 1) endColumn = endColumn.parentNode;
    endColumn = endColumn.closest('td, th');
    if (!endColumn) return;		// Selection is not inside a table

    // Check that the selection is all within a single table.
    let startTable = startColumn.closest('table');
    let endTable = endColumn.closest('table');
    if (startTable !== endTable) return;

    // Calculate the column index of the start column.
    let startIndex = 0;
    for (let e = startColumn.previousSibling; e; e = e.previousSibling)
      startIndex += e.colSpan;

    // Calculate the index of the column after the end column.
    let endIndex = 1;
    for (let e = endColumn.previousSibling; e; e = e.previousSibling)
      endIndex += e.colSpan;

    // Loop over all rowgroups and all rows and delete the right cells.
    for (const rowgroup of startTable.children)
      if (rowgroup.tagName === 'THEAD' || rowgroup.tagName === 'TBODY'
	  || rowgroup.tagName === 'TFOOT')
	for (const row of rowgroup.children) {
	  let c = row.firstElementChild;
	  let i = 0;
	  while (c) {
	    let next = c.nextElementSibling;
	    let j = i + c.colSpan;
	    if (i < startIndex) {
	      if (j >= endIndex) c.colSpan -= endIndex - startIndex;
	      else if (j > startIndex) c.colSpan -= j - startIndex;
	    } else if (i < endIndex) {
	      if (j > endIndex) c.colSpan -= j - endIndex;
	      else c.remove();
	    }
	    i = j;
	    c = next;
	  }
	}

    this.editor.focus();
  }

  // toggleHeaderCell -- handle click on toggle TH button
  toggleHeaderCell()
  {
    const selection = this.editor.getSelection();

    // Find the cell in which the selection starts.
    const startSelection = selection.cloneRange();
    startSelection.collapse(true);
    let start = startSelection.commonAncestorContainer;
    if (start.nodeType !== 1) start = start.parentNode;
    start = start.closest('td, th, tr, thead, tbody, tfoot, table');
    if (!start) return;		// Selection is not inside a table
    if (start.tagName !== 'TD' && start.tagName !== 'TH')
      start = start.querySelector('td, th');

    // Find the cell, row or rowgroup in which the selection ends.
    const endSelection = selection.cloneRange();
    endSelection.collapse(false);
    let end = endSelection.commonAncestorContainer;
    if (end.nodeType !== 1) end = end.parentNode;
    end = end.closest('td, th, tr, thead, tbody, tfoot, table');
    if (!end) return;		// Selection is not inside a table
    if (end.tagName !== 'TD' && end.tagName !== 'TH') {
      const h = end.querySelectorAll('td, th');
      end = h[h.length - 1];
    }

    // Check that the selection is all within a single table.
    let startTable = start.closest('table');
    let endTable = end.closest('table');
    if (startTable !== endTable) return;

    // Toggle all cells between startCell and endCell, inclusive.
    const walker = startTable.ownerDocument.createTreeWalker(startTable,
      NodeFilter.SHOW_ELEMENT);
    let c = walker.nextNode();
    while (c && c !== start) c = walker.nextNode();
    while (c) {
      let next = walker.nextNode();
      if (c.tagName === 'TD') this.renameElement(c, 'TH');
      else if (c.tagName === 'TH') this.renameElement(c, 'TD');
      if (c === end) break;
      c = next;
    }

    this.updateFormatButtonStates();
    this.editor.focus();
  }

  // coveredElement -- the element of which all content is selected, or null
  coveredElement()
  {
    const range = this.editor.getSelection();
    const {commonAncestorContainer, startContainer, startOffset,
      endContainer, endOffset} = range;
    const container = this.selectedElement();
    let e;

    if (startContainer != container && startOffset !== 0) return null;
    e = startContainer;
    while (e !== container) {
      if (e !== e.parentNode.firstChild) return null;
      e = e.parentNode;
    }
    const endLength = endContainer.length ?? endContainer.childNodes.length;
    if (endContainer != container && endOffset !== endLength) return null;
    e = endContainer;
    while (e != container) {
      if (e !== e.parentNode.lastChild) return null;
      e = e.parentNode;
    }
    return container;
  }

  // selectedElement -- get selected element, or ancestor if multiple selected
  selectedElement()
  {
    // If the selection contains exactly one element, return that
    // element, Otherwise, return the deepest element that is a common
    // ancestor of everything that is selected.
    const range = this.editor.getSelection();
    const {commonAncestorContainer, startContainer, startOffset,
      endContainer, endOffset} = range;

    if (commonAncestorContainer.nodeType === Node.TEXT_NODE)
      return commonAncestorContainer.parentNode;
    if (startContainer.nodeType === Node.TEXT_NODE)
      return commonAncestorContainer;
    if (commonAncestorContainer === startContainer
	&& startContainer === endContainer
	&& endOffset === startOffset + 1
	&& startContainer.childNodes[startOffset].nodeType ===Node.ELEMENT_NODE)
      return startContainer.childNodes[startOffset];
    return commonAncestorContainer;
  }

  openClassDialog(what)
  {
    if (!this.editor || this.isHtmlView) return;

    const element = this.selectedElement();
    const currentClass = element.className || '';

    const input = document.getElementById('class-input');
    input.value = currentClass;
    document.getElementById('class-what').value = what;
    document.getElementById('class-dialog').showModal();
    input.focus();
  }

  // setClassAttribute -- helper for applyClass and removeClass
  setClassAttribute(what, className)
  {
    // If className is null, it means to remove the class attribute.

    if (what === 'block') {

      this.editor.saveUndoState();
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      let node = this.selectedElement();
      let block = null;
      while (!block && node && node !== frameDoc && node !== wrapper) {
	const tagName = node.tagName.toLowerCase();
	if (SlideEditor.blockElements.includes(tagName)) block = node;
	node = node.parentNode;
      }
      if (block) {
	if (typeof className === 'string') block.className = className;
	else block.removeAttribute('class');
      }
      this.updateElementPath();
      this.updateCurrentSlideContent();

    } else if (!this.editor.getSelection().collapsed) {

      console.assert(what === 'selection');
      this.editor.saveUndoState();
      const container = this.coveredElement();
      if (container && typeof className === 'string') {
	container.className = className;
      } else if (typeof className === 'string') {
	this.editor.changeFormat({tag:'span', attributes:{'class':className}});
      } else if (container) {
	container.removeAttribute('class');
	if (container.tagName === 'SPAN' && container.attributes.length === 0)
	  container.replaceWith(...container.childNodes);
      }
      this.updateElementPath();
      this.updateCurrentSlideContent();

    } else {

      console.assert(what === 'selection');
      const elt = this.selectedElement();
      if (typeof className === 'string') elt.className = className;
      else elt.removeAttribute('class');
      this.updateElementPath();
      this.updateCurrentSlideContent();

    }
  }

  // applyClass -- handle click on "apply" in the class dialog
  applyClass()
  {
    document.getElementById('class-dialog').close();
    this.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    const className = document.getElementById('class-input').value.trim();
    const what = document.getElementById('class-what').value;
    this.setClassAttribute(what, className);
  }

  // removeClass -- handle click on "remove class" button in the class dialog
  removeClass()
  {
    document.getElementById('class-dialog').close();
    this.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    const what = document.getElementById('class-what').value;
    this.setClassAttribute(what, null);
  }

  // currentLanguage -- find language of current selection
  currentLanguage()
  {
    let elt = this.selectedElement();
    while (elt && !elt.lang) elt = elt.parentNode;
    return elt ? elt.lang : '';
  }

  // openLanguageDialog -- show the dialog for setting a language
  openLanguageDialog(what)
  {
    if (!this.editor || this.isHtmlView) return;

    const input = document.getElementById('language-input');
    input.value = this.currentLanguage();
    document.getElementById('language-what').value = what;
    document.getElementById('language-dialog').showModal();
    input.focus();
  }

  // setLangAttribute -- helper for applyLanguage and removeLanguage
  setLangAttribute(what, lang)
  {
    // If lang is null, it means to remove the lang attribute.

    if (what === 'document') {

      this.lang = lang;
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      if (wrapper) {
	if (typeof lang === 'string') wrapper.lang = lang;
	else wrapper.removeAttribute('lang');
      }
      this.updateSlidesList();

    } else if (what === 'slide') {

      const slide = this.slides[this.currentSlideIndex];
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      if (slide) slide.lang = lang;
      if (wrapper) {
	if (typeof lang === 'string') wrapper.lang = lang;
	else wrapper.removeAttribute('lang');
      }
      this.updateSlidesList();

    } else if (what === 'block') {

      this.editor.saveUndoState();
      const frameDoc = this.editorFrame.contentDocument;
      const wrapper = frameDoc.getElementById('slide-wrapper');
      let node = this.selectedElement();
      let block = null;
      while (!block && node && node !== frameDoc && node !== wrapper) {
	const tagName = node.tagName.toLowerCase();
	if (SlideEditor.blockElements.includes(tagName)) block = node;
	node = node.parentNode;
      }
      if (block) {
	if (typeof lang === 'string') block.lang = lang;
	else block.removeAttribute('lang');
      }
      this.updateCurrentSlideContent();

    } else if (!this.editor.getSelection().collapsed) {

      console.assert(what === 'selection');
      this.editor.saveUndoState();
      const container = this.coveredElement();
      if (container && typeof lang === 'string') {
	container.lang = lang;
      } else if (typeof lang === 'string') {
	this.editor.changeFormat({tag:'span', attributes:{'lang':lang}});
      } else if (container) {
	container.removeAttribute('lang');
	if (container.tagName === 'SPAN' && container.attributes.length === 0)
	  container.replaceWith(...container.childNodes);
      }
      this.updateCurrentSlideContent();

    } else {

      console.assert(what === 'selection');
      const elt = this.selectedElement();
      if (typeof lang === 'string') elt.lang = lang;
      else elt.removeAttribute('lang');
      this.updateCurrentSlideContent();

    }
  }

  // applyLanguage -- set the chosen language on the element indicated by what
  applyLanguage()
  {
    document.getElementById('language-dialog').close();
    this.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    const lang = document.getElementById('language-input').value.trim().
	  toLowerCase();
    const what = document.getElementById('language-what').value;
    this.setLangAttribute(what, lang);
  }

  // removeLanguage -- handle click on Remove Language button
  removeLanguage()
  {
    document.getElementById('language-dialog').close();
    this.editor?.focus();
    if (!this.editor || this.isHtmlView) return;

    const what = document.getElementById('language-what').value;
    this.setLangAttribute(what, null);
  }

} 				// end of class SlideEditor


// Initialize the editor when DOM is ready
let editorInstance;
document.addEventListener('DOMContentLoaded', () => {
  editorInstance = new SlideEditor();

  // Handle drag and drop of files onto the window
  document.body.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const path = window.electronAPI.getPath(file);
      if (path.match(/\.html?$/i)) {
	editorInstance.fileToOpen(path);
      } else {
        alert('Please drop an HTML file');
      }
    }
  });
});

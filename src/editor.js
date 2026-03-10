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
      "supports-clear": true,
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
    this.editorFrame.addEventListener('load', () => this.initializeSquire());

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

  // makeAbsolute -- make a relative path an absolute URL or a real path
  async makeAbsolute(urlRef, base = null)
  {
    return await window.electronAPI.makeAbsolute(urlRef, base);
  }

  // absolute -- combine a relative path with a base
  absolute(path, base)
  {
    if (this.isUrl(base)) return URL.parse(path, base)?.href;
    else if (base) return URL.parse(path, 'file://' + base)?.href;
    else if (path.match(/^[\/\\]/)) return URL.parse('file://' + path)?.href;
    else return URL.parse(path)?.href;
  }

  // relative -- return a relative path from base to path
  relative(base, path)
  {
    // base and path must be URLs or paths that start at "/"
    const baseUrl = URL.parse(this.isUrl(base) ? base : 'file://' + base);
    const pathUrl = URL.parse(this.isUrl(path) ? path : 'file://' + path);
    if (baseUrl.origin !== pathUrl.origin) return path;
    const b = baseUrl.path.split('/'); b.pop();
    const p = pathUrl.path.split('/');
    while (b.length && b[0] === p[0]) {b.shift(); p.shift()}
    if (b.length === 0) pathUrl.path = p.join('/');
    else pathUrl.path = b.map(s => '..').join('/') + p.join('/');
    return pathUrl.href;
  }

  // rewritePath -- return a path that is relative to newBase instead of oldBase
  rewritePath(path, oldBase, newBase)
  {
    return this.relative(newBase, this.absolute(path, oldBase));
  }

  // setEdited -- flag the current document as edited or not and update the window title
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

    // Add undo/redo keyboard shortcuts and ESC for selection expansion
    this.editor.addEventListener('keydown', event => {
      const mod = this.isMac ? event.metaKey : event.ctrlKey;

      if (mod && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.editor.redo();
	else this.editor.undo();
      }

      if (mod && event.key === 'y') {
        event.preventDefault();
        this.editor.redo();
      }

      // ESC key to expand selection
      if (event.key === 'Escape') {
        event.preventDefault();
        this.expandSelection();
      }
    });

    // Add a handler for when an image is copy-pasted
    this.editor.addEventListener('pasteImage', event => {
      // this.insertImages(event.detail.clipboardData);
    });

    // Initial path update
    this.updateElementPath();
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
    const selection = frameDoc.getSelection();

    const pathContainer = document.getElementById('element-path');

    if (pathContainer) {

      pathContainer.innerHTML = '';

      if (!this.isHtmlView && selection.focusNode) {

	// Build path

	let node = selection.focusNode;

	// If it's a text node, get the parent element
	if (node.nodeType === 3) node = node.parentNode;

	// Build path from current node up to the section wrapper
	const path = [];
	const wrapper = frameDoc.getElementById('slide-wrapper');

	while (node && node !== wrapper && node !== frameDoc.body) {
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

      if (this.isHtmlView || !selection.focusNode) {
	blockMenu.value = '';
      } else {
	let node = selection.focusNode;
	if (node.nodeType === 3) node = node.parentNode;
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

    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();
    const range = frameDoc.createRange();

    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    // Update path display
    this.updateElementPath();
  }

  // expandSelection -- handle the Esc key
  expandSelection()
  {
    if (!this.editor) return;

    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;

    // If it's a text node, get the parent element
    if (container.nodeType === 3) container = container.parentNode;

    // Check if the entire element is already selected
    const isFullySelected = (
      range.startContainer === container &&
        range.endContainer === container &&
        range.startOffset === 0 &&
        range.endOffset === container.childNodes.length
    ) || (
      // Or if the range surrounds the entire element
      range.startContainer === container.parentNode &&
        range.endContainer === container.parentNode &&
        range.startOffset === Array.from(container.parentNode.childNodes).indexOf(container) &&
        range.endOffset === Array.from(container.parentNode.childNodes).indexOf(container) + 1
    );

    if (isFullySelected) {
      // Element is fully selected, expand to parent
      const parentElement = container.parentNode;
      if (parentElement && parentElement !== frameDoc.body &&
	  parentElement.id !== 'slide-wrapper')
        this.selectElement(parentElement);
    } else {
      // Element is not fully selected, select the whole element first
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
    window.electronAPI.onFileOpened((event, data) => this.fileOpened(data));

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
    window.electronAPI.onEditClass(() => this.openClassDialog());

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
    // document.getElementById('format-bold').addEventListener('click',
    //   () => this.formatInline('b'));
    // document.getElementById('format-italic').addEventListener('click',
    //   () => this.formatInline('i'));
    // document.getElementById('format-underline').addEventListener('click',
    //   () => this.formatInline('u'));
    // document.getElementById('format-strikethrough').addEventListener('click',
    //   () => this.formatInline('s'));
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
      () => this.openClassDialog());
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
    document.getElementById('cancel-stylesheet').addEventListener('click', () => this.closeStylesheetDialog());
    document.getElementById('close-stylesheet-dialog').addEventListener('click', () => this.closeStylesheetDialog());
    document.getElementById('browse-stylesheet').addEventListener('click', () => this.browseStylesheet());

    // Image dialog
    document.getElementById('apply-image').addEventListener('click', () => this.applyImage());
    document.getElementById('cancel-image').addEventListener('click', () => this.closeImageDialog());
    document.getElementById('close-image-dialog').addEventListener('click', () => this.closeImageDialog());
    document.getElementById('browse-image').addEventListener('click', () => this.browseImage());

    // Open File dialog
    document.getElementById('apply-open-file').addEventListener('click', () => this.applyOpenFile());
    document.getElementById('cancel-open-file').addEventListener('click', () => this.closeOpenFileDialog());
    document.getElementById('close-open-file-dialog').addEventListener('click', () => this.closeOpenFileDialog());
    document.getElementById('browse-open-file').addEventListener('click', () => this.browseOpenFile());

    // Save As dialog
    document.getElementById('apply-save-as').addEventListener('click', () => this.applySaveAs());
    document.getElementById('cancel-save-as').addEventListener('click', () => this.closeSaveAsDialog());
    document.getElementById('close-save-as-dialog').addEventListener('click', () => this.closeSaveAsDialog());
    document.getElementById('browse-save-as').addEventListener('click', () => this.browseSaveAs());

    // Class dialog
    document.getElementById('apply-class').addEventListener('click', () => this.applyClass());
    document.getElementById('remove-class').addEventListener('click', () => this.removeClass());
    document.getElementById('cancel-class').addEventListener('click', () => this.closeClassDialog());
    document.getElementById('close-class-dialog').addEventListener('click', () => this.closeClassDialog());

    // Password dialog
    document.getElementById('apply-password').addEventListener('click', () => this.applyPassword());
    document.getElementById('cancel-password').addEventListener('click', () => this.closePasswordDialog());
    document.getElementById('close-password-dialog').addEventListener('click', () => this.closePasswordDialog());

    // Link dialog
    document.getElementById('apply-link').addEventListener('click', () => this.applyLink());
    document.getElementById('remove-link').addEventListener('click', () => this.removeLink());
    document.getElementById('cancel-link').addEventListener('click', () => this.closeLinkDialog());
    document.getElementById('close-link-dialog').addEventListener('click', () => this.closeLinkDialog());

    // Custom CSS modal
    document.getElementById('close-css-modal').addEventListener('click', () => this.closeCustomCssModal());
    document.getElementById('save-custom-css').addEventListener('click', () => this.saveCustomCss());
    document.getElementById('cancel-custom-css').addEventListener('click', () => this.closeCustomCssModal());

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
    this.loadCurrentSlide();
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

    console.log(`generateThumbnail(${slideIndex})`);

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
    const lang = this.lang ? ` lang="${this.escapeHTML(this.lang)}"` : '';
    // let html = `<!DOCTYPE html><html${lang} style="overflow: hidden">`
    let html = `<!DOCTYPE html><html${lang}>`
	+ '<head><meta charset=UTF-8>'
	+ '<meta name=viewport content="width=device-width">';

    // Add base tag if we have a file path. Add "file://" before a local path.
    const base = this.currentFilePath;
    if (this.isUrl(base)) html += `<base href="${base}">`;
    else if (base) html += `<base href="${new URL('file://' + base).href}">`;
    console.log(`  ${slideIndex}: base href = ${base}`);

    // Add external CSS if available
    if (this.cssUrl) html += `<link rel="stylesheet" href="${this.cssUrl}">`;
    console.log(`  ${slideIndex}: stylesheet = ${this.cssUrl}`);

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
    const sLang = slide.lang ? ` lang="${this.escapeHTML(slide.lang)}"` : '';

    html += `<section${id}${sLang} class="${classes}"`;
    html += ` style="counter-reset: slide ${slideNumber - 1}" inert>`;
    html += `${slide.content}</section>`;
    html += '</body></html>';

    frame.srcdoc = html;

    // Wait for styles and images to load
    // // await new Promise(resolve => setTimeout(resolve, 100));
    // do {await new Promise(resolve => setTimeout(resolve, 50))}
    // while (!(frame.contentDocument?.readyState === 'complete'));
    await new Promise(resolve => {frame.addEventListener('load', resolve)});

    console.log(`  ${slideIndex}: readyState = ${frame.contentDocument?.readyState}`);

    // const sliderect = frame.contentDocument.body.firstElementChild.
    // 	  getBoundingClientRect();
    // frame.width = sliderect.width;
    // frame.height = sliderect.height;
    // const containerrect = thumbnailContainer.getBoundingClientRect();
    // frame.style.zoom = containerrect.width / sliderect.width;

    const slideElement = frame.contentDocument.body.firstElementChild;
    console.log(`  ${slideIndex}: slideElement = ${slideElement}`);
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

    // Update the wrapper class in the iframe
    if (this.editorFrame && this.editorFrame.contentDocument) {
      const wrapper = this.editorFrame.contentDocument.getElementById(
	'slide-wrapper');
      if (wrapper) {
	wrapper.lang = slide.lang ?? this.lang;
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

    // Load content based on view mode
    if (this.isHtmlView)
      document.getElementById('html-editor').value = slide.content;
    else
      this.initializeSquire();

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
    document.getElementById('stylesheet-dialog').style.display = 'flex';
    document.getElementById('stylesheet-url').focus();
  }

  // closeStylesheetDialog -- close the dialog to enter a style sheet URL
  closeStylesheetDialog()
  {
    document.getElementById('stylesheet-dialog').style.display = 'none';
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
    this.closeStylesheetDialog();
    this.setEdited();
    await this.updateLayoutsAndTransitions();
  }

  // openOpenFileDialog -- show the dialog to open a file
  openOpenFileDialog()
  {
    document.getElementById('open-file-url').value =
      this.currentFilePath?.replace(/^file:\/\//i, '') || '';
    document.getElementById('open-file-dialog').style.display = 'flex';
    document.getElementById('open-file-url').focus();
  }

  // closeOpenFileDialog -- close the dialog to open a file
  closeOpenFileDialog()
  {
    document.getElementById('open-file-dialog').style.display = 'none';
  }

  // browseOpenFile -- get the result of a file selection dialog and store it
  async browseOpenFile()
  {
    const filePath = await window.electronAPI.openFile();
    if (filePath) document.getElementById('open-file-url').value = filePath;
  }

  // applyOpenFile -- handle the closing of the style sheet URL dialog
  async applyOpenFile()
  {
    const filePath = document.getElementById('open-file-url').value;
    this.closeOpenFileDialog();
    if (filePath) {
      const realpath = await this.makeAbsolute(filePath);
      console.log(`applyOpenFile: realpath = ${realpath}`);
      const origin = this.getOrigin(realpath);
      const auth = this.auths.get(origin);
      const result = await window.electronAPI.readFile(realpath, auth);
      if (result.success) {
	this.fileOpened({ path: filePath, content: result.content });
      } else if (result.status === 401) {
	const textInput = document.getElementById('save-as-url');
	textInput.value = result.url; // It may have been redirected
	this.nextAction = 'open';
	this.openPasswordDialog(result.url);
      } else {
	alert('Error opening file: ' + result.error);
      }
    }
  }

  // openImageDialog -- show the dialog to enter an image URL
  openImageDialog()
  {
    // document.getElementById('image-url').value = '';
    document.getElementById('image-dialog').style.display = 'flex';
    document.getElementById('image-url').focus();
  }

  // closeImageDialog -- close the dialog to enter a style sheet URL
  closeImageDialog()
  {
    document.getElementById('image-dialog').style.display = 'none';
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
    this.closeImageDialog();
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

      const result = await window.electronAPI.readFile(jsonPath);
      if (!result.success) {
	console.log(`Info: No style sheet meta data found at ${jsonPath}. Error was: ${result.error}\nUsing defaults`);
	result.content = '{}';
      }

      try {
	json = JSON.parse(result.content);
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
    document.getElementById('css-modal').style.display = 'flex';
  }

  // closeCustomCssModal -- handle closing of the cusom CSS dialog
  closeCustomCssModal()
  {
    document.getElementById('css-modal').style.display = 'none';
  }

  // saveCustomCss -- handle click on the save button of the custom CSS dialog
  saveCustomCss()
  {
    this.customCss = document.getElementById('custom-css-editor').value;
    this.applyCssToFrame();
    this.closeCustomCssModal();
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
    this.setEdited(false);
    this.addInitialSlide();
  }

  // saveFile -- handle click on "save file" menu item
  async saveFile()
  {
    if (this.currentFilePath) await this.writeToFile(this.currentFilePath);
    else await this.openSaveAsDialog();
  }

  // openSaveAsDialog -- show the dialog to save the slides under a new name
  openSaveAsDialog()
  {
    document.getElementById('save-as-url').value =
      this.currentFilePath.replace(/^file:\/\//i, '');
    document.getElementById('save-as-dialog').style.display = 'flex';
    document.getElementById('stylesheet-url').focus();
  }

  // closeSaveAsDialog -- close the dialog to enter a file name for saving to
  closeSaveAsDialog()
  {
    document.getElementById('save-as-dialog').style.display = 'none';
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
    this.closeSaveAsDialog();
    if (filePath) {
      const realpath = await this.makeAbsolute(filePath);
      await this.writeToFile(realpath);
    }
  }

  // getOrigin -- get the "origin" (protocol, host and port) of a path or URL
  getOrigin(url)
  {
    if (this.isUrl(url)) return new URL(url).origin;
    return new URL('file://' + url).origin;
  }

  // writeToFile -- save the current document to the named file or URL
  async writeToFile(filePath)
  {
    // filePath is a URL (which may be a "file:" URL).
    this.updateCurrentSlideContent();

    const origin = this.getOrigin(filePath);
    const auth = this.auths.get(origin);

    // Create a temporary copy of the slide deck (with only the data
    // needed for generating an HTML file.)
    const newDoc = {};
    this.copySlideDeckData(this, newDoc);
    newDoc.currentFilePath = filePath;

    if (newDoc.currentFilePath === this.currentFilePath) {
      // Saving to same location as last read of save. No need to
      // adjust links.
    } else if (this.isUrl(newDoc.currentFilePath)) {
      // If we are saving to the web, we need to upload all local
      // resources and rewrite their URLs.
      // TO DO: Handle srcset attributes.
      const newNames = new Map();
      const uniqueNames = new Set();
      const fileUrl = new URL(filePath);
      const relUploadDir = fileUrl.pathname.replace(/^.*\//, '').replace(
       	/\.html?$/i, '') + '-files/';
      const absUploadDir = new URL(relUploadDir, fileUrl).href;

      const oldBase = this.currentFilePath;
      const newBase = newDoc.currentFilePath;

      if (!this.isUrl(this.cssUrl)) {
	// TO DO: upload the style sheet
      } else {
	newDoc.cssUrl = this.rewritePath(newDoc.cssUrl, oldBase, newBase);
      }

      for (const slide of newDoc.slides)
	slide.content = slide.content.replaceAll(
	  /(<[^>]*\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/ig,
	  (match, tag, dquoted, squoted, unquoted) => {
	    const old = this.absolute(dquoted ?? squoted ?? unquoted, oldBase);
	    if (!this.isUrl(old)) {
	      // TO DO: Upload the resource
	    } else {
	      if (dquoted)
		return `${tag}"${this.rewritePath(dquoted, oldBase, newBase)}"`;
	      else if (squoted)
		return `${tag}'${this.rewritePath(squoted, oldBase, newBase)}'`;
	      else
		return `${tag}${this.rewritePath(unquoted, oldBase, newBase)}`;
	    }
	  });

      // for (resource of resources) {
      // 	const abspath = await this.makeAbsolute(
      // 	  resource.getAttribute('src') ?? resource.getAttribute('href'),
      // 	  this.currentFilePath);
      // 	if (this.isUrl(abspath)) continue;
      // 	const content = await window.electronAPI.readFile(abspath);
      // 	if (!content.success) continue;
      // 	const baseName = abspath.replace(/^.*[\/\\]/, '');
      // 	let relUrl = newNames.get(abspath);
      // 	if (!relUrl) {
      // 	  // We haven't uploaded this resource yet.
      // 	  // Make relUrl a unique name for the resource.
      // 	  let n = 0;
      // 	  relUrl = relUploadDir + baseName;
      // 	  while (uniqueNames.has(relUrl)) relUrl = relUploadDir + n++ + relUrl;
      // 	  uniqueNames.add(relUrl);
      // 	  newNames.set(abspath, relUrl);
      // 	  const absUrl = new URL(relUrl, fileUrl).href;
      // 	  const mediaType = await window.electronAPI.getMediaType(abspath) ||
      // 		'application/octet-stream';
      // 	  const result = await window.electronAPI.writeFile(absUrl,
      // 	    content.content, mediaType, auth);
      // 	  if (result.status === 401) {
      // 	    this.openPasswordDialog(result.url);
      // 	    return false; // Abort saving the document and its resources
      // 	  } else if (!result.success) {
      // 	    alert(`Error uploading file ${baseName}: ${result.error}`);
      // 	    return false;
      // 	  }
      // 	}
      // 	// Rewrite src or href attribute.
      // 	if (resource.src) resource.setAttribute('src', relUrl);
      // 	else resource.setAttribute('href', relUrl);
      // }
    } else {
      // We are writing to a local file. Need to rewrite
      // relative path name of images, style sheets, etc.
      // TO DO: Handle srcset attributes.
      // TO DO: Save (some) remote resources to local files?
      const oldBase = this.currentFilePath;
      const newBase = newDoc.currentFilePath;
      newDoc.cssUrl = this.rewritePath(newDoc.cssUrl, oldBase, newBase);
      for (const slide of newDoc.slides)
	slide.content = slide.content.replaceAll(
	  /(<[^>]*\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/ig,
	  (match, tag, dquoted, squoted, unquoted) => {
	    if (dquoted)
	      return `${tag}"${this.rewritePath(dquoted, oldBase, newBase)}"`;
	    else if (squoted)
	      return `${tag}'${this.rewritePath(squoted, oldBase, newBase)}'`;
	    else
	      return `${tag}${this.rewritePath(unquoted, oldBase, newBase)}`;
	  });
    }

    // Now save the document itself.
    const html = await this.generateHtml(newDoc);
    const result = await window.electronAPI.writeFile(filePath, html,
      'text/html', auth);

    if (result.success) {
      this.copySlideDeckData(newDoc, this);
      const baseTag =
	    this.editorFrame.contentDocument.getElementById('base-url');
      const realfile = await this.makeAbsolute(this.currentFilePath);
      if (baseTag && realfile) baseTag.setAttribute('href', realfile);
      this.setEdited(false);
      alert('File saved successfully!');
      return true;
    } else if (result.status === 401) {
      const textInput = document.getElementById('save-as-url');
      textInput.value = result.url; // It may have been redirected
      this.nextAction = 'save';
      this.openPasswordDialog(result.url);
      return false;
    } else {
      alert('Error saving file: ' + result.error);
      return false;
    }
  }

  // openPasswordDialog -- show the password dialog
  openPasswordDialog(filePath)
  {
    if (!this.editor || this.isHtmlView) return;
    const dialog = document.getElementById('password-dialog');
    const label = document.getElementById('password-dialog-label');
    const username = document.getElementById('password-dialog-username-input');
    const password = document.getElementById('password-dialog-password-input');
    const origin = this.getOrigin(filePath);
    const auth = this.auths.get(origin);
    const colon = auth ? auth.indexOf(':') : -1;
    username.value = colon >= 0 ? auth.substring(0, colon) : '';
    password.value = colon >= 0 ? auth.substring(colon + 1) : '';
    label.innerText = filePath;
    dialog.style.display = 'flex';
    username.focus();
  }

  // closePasswordDialog -- hide the password dialog
  closePasswordDialog()
  {
    document.getElementById('password-dialog').style.display = 'none';
  }

  // applyPassword -- use the entered username+password to save the current file
  applyPassword()
  {
    this.closePasswordDialog();
    const username = document.getElementById('password-dialog-username-input');
    const password = document.getElementById('password-dialog-password-input');
    const label = document.getElementById('password-dialog-label');
    const origin = this.getOrigin(label.innerText);
    this.auths.set(origin, username.value + ':' + password.value);
    if (this.nextAction === 'save') this.applySaveAs();
    else if (this.nextAction === 'open') this.applyOpenFile();
    else console.error(`this.nextAction cannot be ${this.nextAction}`);
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
    const lang = this.lang ? ` lang="${this.escapeHTML(this.lang)}"` : '';

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
      // html += this.customCss.split('\n').map(line => '        ' + line).join('\n') + '\n';

    if (this.includeB6plus) {
      html += '<script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';
    }

    // Add default transition to body if set
    const bodyClass = this.defaultTransition ? `b6plus ${this.defaultTransition}` : 'b6plus';
    html += `</head>\n<body class="${bodyClass}">\n`;

    this.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      const lang = slide.lang ? ` lang="${this.escapeHTML(slide.lang)}"` : '';
      html += `\n<section${id}${lang} class="${this.makeClassName(slide)}">`;
      // html += slide.content.split('\n').map(line => '        ' + line).join('\n');
      html += slide.content + '</section>\n';
    });

    html += '\n</body>\n</html>';

    return html;
  }

  async generateHtml(doc)
  {
    const lang = doc.lang ? ` lang="${this.escapeHTML(doc.lang)}"` : '';

    let html = `<!DOCTYPE html>\n<html${lang}>\n<head>\n`;
    html += '<meta charset="UTF-8">\n';
    html += '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n';
    html += '<title>Slide Deck</title>\n';

    if (doc.cssUrl)
      html += `<link rel="stylesheet" href="${doc.cssUrl}">\n`;

    if (doc.customCss)
      html += `<style>\n${doc.customCss}\n</style>\n`;
      // html += doc.customCss.split('\n').map(line => '        ' + line).join('\n') + '\n';

    if (doc.includeB6plus)
      html += '<script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';

    // Add default transition to body if set
    const bodyClass = doc.defaultTransition ? ` class="b6plus ${doc.defaultTransition}"` : ' class="b6plus"';
    html += `</head>\n<body${bodyClass}>\n`;

    doc.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      const lang = slide.lang ? ` lang="${this.escapeHTML(slide.lang)}"` : '';
      html += `\n<section${id}${lang} class="${this.makeClassName(slide)}">`;
      // html += slide.content.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += slide.content + '</section>\n';
    });

    html += '\n</body>\n</html>';

    return html;
  }

  async fileOpened(data)
  {
    console.log(`fileOpened({${data.path},...})`);
    if (this.hasUnsavedChanges
	&& !confirm('Open a file? Unsaved changes will be lost.'))
      return;

    const { path, content } = data;
    const realfile = await this.makeAbsolute(path);
    console.log(`  realfile = ${realfile}`);

    // Update base URL in iframe for relative paths
    if (this.editorFrame?.contentDocument) {
      const baseTag =
	    this.editorFrame.contentDocument.getElementById('base-url');
      if (baseTag && realfile) baseTag.setAttribute('href', realfile);
    }

    await this.parseHtml(content);
    console.log(`  parsed ${this.slides.length} slides`);
    this.currentFilePath = realfile;
    this.setEdited(false);
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  async parseHtml(html)
  {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract language.
    this.lang = doc.documentElement.lang;

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
    document.getElementById('link-dialog').style.display = 'flex';
  }

  closeLinkDialog()
  {
    document.getElementById('link-dialog').style.display = 'none';
  }

  applyLink()
  {
    if (!this.editor || this.isHtmlView) {
      this.closeLinkDialog();
      return;
    }

    const url = document.getElementById('link-url').value.trim();

    if (url) {
      this.editor.makeLink(url);
      this.updateCurrentSlideContent();
    }

    this.closeLinkDialog();
  }

  removeLink()
  {
    if (!this.editor || this.isHtmlView) {
      this.closeLinkDialog();
      return;
    }

    this.editor.removeLink();
    this.updateCurrentSlideContent();
    this.closeLinkDialog();
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

  openClassDialog()
  {
    if (!this.editor || this.isHtmlView) return;

    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;
    if (element.nodeType === 3) element = element.parentNode;
    const currentClass = element.className || '';

    const dialog = document.getElementById('class-dialog');
    const input = document.getElementById('class-input');
    input.value = currentClass;
    dialog.style.display = 'flex';
    input.focus();
  }

  closeClassDialog()
  {
    document.getElementById('class-dialog').style.display = 'none';
  }

  applyClass()
  {
    if (!this.editor || this.isHtmlView) {
      this.closeClassDialog();
      return;
    }

    const className = document.getElementById('class-input').value.trim();
    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) {
      this.closeClassDialog();
      return;
    }

    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;

    if (element.nodeType === 3) element = element.parentNode;

    if (className) element.className = className;
    else element.removeAttribute('class');

    this.updateCurrentSlideContent();
    this.closeClassDialog();
  }

  // removeClass -- handle click on "remove class" button in the class dialog
  removeClass()
  {
    if (!this.editor || this.isHtmlView) {
      this.closeClassDialog();
      return;
    }

    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) {
      this.closeClassDialog();
      return;
    }

    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;

    if (element.nodeType === 3) element = element.parentNode;

    element.removeAttribute('class');

    this.updateCurrentSlideContent();
    this.closeClassDialog();
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
      if (file.name.endsWith('.html')) {
        const content = await file.text();
        const filePath = file.path; // Electron provides the file path
        editorInstance.fileOpened({ path: filePath, content: content });
      } else {
        alert('Please drop an HTML file');
      }
    }
  });
});

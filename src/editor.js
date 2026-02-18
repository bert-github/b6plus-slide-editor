class SlideEditor {

  // This list of block elements should be the same as the
  // block-format drop down and the Format menu.
  static blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'div', 'address', 'details', 'article', 'aside'];
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
    this.slides = [];
    this.currentSlideIndex = 0;
    this.currentFilePath = null;
    this.fileDirectory = null;
    this.cssUrl = '';
    this.cssUrlInfo = {
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
    this.editorFrame.addEventListener('load', () => {
      this.initializeSquire();
    });

    // Get the base path for loading Squire
    // In development: file:///.../src/
    // In production: app.asar or unpacked
    const basePath = window.location.href.substring(0,
      window.location.href.lastIndexOf('/'));

    // Initialize iframe with basic structure
    const frameDoc = this.editorFrame.contentDocument;
    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <base href="${basePath}/" id="base-url">
          <script src="${basePath}/dompurify.js"></script>
          <script src="${basePath}/squire-patched.js"></script>
          <style>
            body {margin: 0; padding: 0}
          </style>
        </head>
        <body class="b6plus">
          <section id="slide-wrapper"></section>
        </body>
      </html>`);
    frameDoc.close();
  }

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
      tagAttributes: {}
    });

    // Set initial content
    if (currentSlide) this.editor.setHTML(currentSlide.content);

    // Listen for changes
    this.editor.addEventListener('input', () => {
      this.updateCurrentSlideContent();
      this.hasUnsavedChanges = true;
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
      const isMac = /Mac/.test(navigator.platform);
      const mod = isMac ? event.metaKey : event.ctrlKey;

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

    // Initial path update
    this.updateElementPath();
  }

  // Construct the class attribute for a slide
  makeClassName(slide)
  {
    let classes = slide.type === 'slide' ? 'slide' : 'comment';
    if (slide.styleClass) classes += ' ' + slide.styleClass;
    if (slide.slideClear) classes += ' clear';
    if (slide.slideTextfit) classes += ' textfit';
    if (slide.otherClasses) classes += ' ' + slide.otherClasses;
    return classes;
  }

  updateElementPath()
  {
    if (!this.editor) return;

    const frameDoc = this.editorFrame.contentDocument;
    const editorElement = frameDoc.getElementById('slide-wrapper');
    const selection = this.editor.getSelection();

    const pathContainer = document.getElementById('element-path');

    if (pathContainer) {

      pathContainer.innerHTML = '';

      if (!this.isHtmlView) {

	// Build path

	let node = selection.startContainer;

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

      if (this.isHtmlView) {
	blockMenu.value = '';
      } else {
	let node = selection.commonAncestorContainer;
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

  setupEventListeners()
  {
    // Electron IPC listeners, menu commands
    window.electronAPI.onNewFile(() => this.newFile());
    window.electronAPI.onSaveFile(() => this.saveFile());
    window.electronAPI.onSaveFileAs(() => this.saveFileAs());
    window.electronAPI.onFileOpened((data) => this.openFile(data));

    window.electronAPI.onAddSlide(() => this.addSlide());
    window.electronAPI.onAddNotes(() => this.addNotes());
    window.electronAPI.onDeleteSlide(() => this.deleteSlide());
    window.electronAPI.onSetSlideLayout((event, layout) => this.setSlideStyleClass(layout));
    window.electronAPI.onSetDefaultTransition((event, transition) => this.setDefaultTransition(transition));
    window.electronAPI.onSetSlideTransition((event, transition) => this.setSlideTransition(transition));
    window.electronAPI.onSetClear(() => this.setClear());
    window.electronAPI.onSetTextfit(() => this.setTextfit());

    window.electronAPI.onToggleView(() => this.toggleView());
    window.electronAPI.onEditCustomCss(() => this.openCustomCssModal());
    window.electronAPI.onPlaySlides(() => this.playSlides());
    window.electronAPI.onChangeStylesheet(() => this.openStylesheetDialog());

    window.electronAPI.onUndo(() => this.undo());
    window.electronAPI.onRedo(() => this.redo());
    window.electronAPI.onSelectAll(() => this.selectAll());

    window.electronAPI.onFormatBold(() => this.formatBold());
    window.electronAPI.onFormatItalic(() => this.formatItalic());
    window.electronAPI.onFormatUnderline(() => this.formatUnderline());
    window.electronAPI.onFormatStrikethrough(() => this.formatStrikethrough());
    window.electronAPI.onFormatCode(() => this.formatCode());
    window.electronAPI.onFormatLink(() => this.formatLink());
    window.electronAPI.onFormatRemoveFormat(() => this.formatRemoveFormat());
    window.electronAPI.onFormatBlock((data) => this.setBlockFormat(data)),
    window.electronAPI.onFormatUl(() => this.formatUl());
    window.electronAPI.onFormatOl(() => this.formatOl());
    window.electronAPI.onEditClass(() => this.openClassDialog());

    window.electronAPI.onZoomIn(() => this.zoomIn());
    window.electronAPI.onZoomOut(() => this.zoomOut());
    window.electronAPI.onZoomReset(() => this.zoomReset());

    // Toolbar buttons
    document.getElementById('play-slides').addEventListener('click', () => this.playSlides());
    document.getElementById('add-slide').addEventListener('click', () => this.addSlide());
    document.getElementById('add-notes').addEventListener('click', () => this.addNotes());
    document.getElementById('delete-slide').addEventListener('click', () => this.deleteSlide());
    document.getElementById('toggle-view').addEventListener('click', () => this.toggleView());
    document.getElementById('change-stylesheet').addEventListener('click', () => this.openStylesheetDialog());
    document.getElementById('edit-custom-css').addEventListener('click', () => this.openCustomCssModal());

    // Formatting toolbar buttons
    document.getElementById('format-bold').addEventListener('click',
      () => this.formatBold());
    document.getElementById('format-italic').addEventListener('click',
      () => this.formatItalic());
    document.getElementById('format-underline').addEventListener('click',
      () => this.formatUnderline());
    document.getElementById('format-strikethrough').addEventListener('click',
      () => this.formatStrikethrough());
    document.getElementById('format-code').addEventListener('click',
      () => this.formatCode());
    document.getElementById('format-link').addEventListener('click',
      () => this.formatLink());
    document.getElementById('format-removeformat').addEventListener('click',
      () => this.formatRemoveFormat());
    document.getElementById('format-ul').addEventListener('click',
      () => this.formatUl());
    document.getElementById('format-ol').addEventListener('click',
      () => this.formatOl());
    document.getElementById('block-format').addEventListener('change',
      e => this.setBlockFormat(e.target.value));
    document.getElementById('edit-class').addEventListener('click',
      () => this.openClassDialog());

    // Stylesheet dialog
    document.getElementById('apply-stylesheet').addEventListener('click', () => this.applyStylesheet());
    document.getElementById('cancel-stylesheet').addEventListener('click', () => this.closeStylesheetDialog());
    document.getElementById('close-stylesheet-dialog').addEventListener('click', () => this.closeStylesheetDialog());
    document.getElementById('browse-stylesheet').addEventListener('click', () => this.browseStylesheet());

    // Class dialog
    document.getElementById('apply-class').addEventListener('click', () => this.applyClass());
    document.getElementById('remove-class').addEventListener('click', () => this.removeClass());
    document.getElementById('cancel-class').addEventListener('click', () => this.closeClassDialog());
    document.getElementById('close-class-dialog').addEventListener('click', () => this.closeClassDialog());

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
    document.getElementById('html-editor').addEventListener('input', () => {
      this.hasUnsavedChanges = true;
    });

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

  addInitialSlide()
  {
    this.addSlide();
    // Reset unsaved changes flag since this is just initialization
    this.hasUnsavedChanges = false;
  }

  addSlide()
  {
    const slide = {
      type: 'slide',
      content: '<p>New slide content</p>',
    };

    // Find the insertion point: after the current slide and its notes
    let insertIndex = this.currentSlideIndex + 1;

    // If we're currently on speaker notes, stay at the same position
    // Otherwise, skip past any notes that follow the current slide
    if (this.slides[this.currentSlideIndex]?.type === 'slide') {
      // Skip past notes that follow this slide
      while (insertIndex < this.slides.length && this.slides[insertIndex].type === 'notes') {
        insertIndex++;
      }
    } else if (this.slides[this.currentSlideIndex]?.type === 'notes') {
      // If on notes, skip past any additional notes
      while (insertIndex < this.slides.length && this.slides[insertIndex].type === 'notes') {
        insertIndex++;
      }
    }

    this.slides.splice(insertIndex, 0, slide);
    this.currentSlideIndex = insertIndex;
    this.hasUnsavedChanges = true;
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

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
    this.hasUnsavedChanges = true;
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  deleteSlide()
  {
    if (this.slides.length === 0) return;

    if (confirm('Delete this slide?')) {
      this.slides.splice(this.currentSlideIndex, 1);
      this.hasUnsavedChanges = true;

      if (this.slides.length === 0)
        this.addSlide();
      else if (this.currentSlideIndex >= this.slides.length)
        this.currentSlideIndex = this.slides.length - 1;

      this.updateSlidesList();
      this.loadCurrentSlide();
    }
  }

  updateSlidesList()
  {
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
          const previousItem = document.getElementById(`slide-item-${previousIndex}`);
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

  async generateThumbnails()
  {
    // Load html2canvas if not already loaded
    if (!window.html2canvas) {
      const script = document.createElement('script');
      // Load from local bundled file
      const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
      script.src = `${basePath}/html2canvas.js`;
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
      });
    }

    // Generate thumbnail for each slide
    for (let i = 0; i < this.slides.length; i++)
      await this.generateThumbnail(i);
  }

  async generateThumbnail(slideIndex)
  {
    const slide = this.slides[slideIndex];
    const thumbnailContainer = document.getElementById(`thumbnail-${slideIndex}`);

    if (!thumbnailContainer) return;

    // Calculate slide number
    let slideNumber = 0;
    for (let i = 0; i <= slideIndex; i++)
      if (this.slides[i].type === 'slide') slideNumber++;

    // Create a temporary iframe to render the slide
    const tempFrame = document.createElement('iframe');
    tempFrame.style.position = 'absolute';
    tempFrame.style.left = '-9999px';
    // tempFrame.style.width = '654px';
    // tempFrame.style.height = '368px';
    document.body.appendChild(tempFrame);

    const tempDoc = tempFrame.contentDocument;
    tempDoc.open();

    // Build the slide HTML with styles
    let html = '<html><head>';

    // Add base tag if we have a file directory (same as editor)
    if (this.fileDirectory)
      html += `<base href="file://${this.fileDirectory}/">`;

    html += '<style>';
    html += 'body { margin: 0; padding: 0; }';
    html += '</style>';

    // Add external CSS if available
    if (this.cssUrl) {
      let cssPath = this.cssUrl;

      // If it's a file:// URL, make it relative to the base directory
      if (cssPath.startsWith('file://') && this.fileDirectory) {
        const cleanPath = cssPath.replace('file://', '');
        cssPath = await window.electronAPI.makeRelativePath(
          this.fileDirectory + '/dummy.html',
          cleanPath
        );
      }
      html += `<link rel="stylesheet" href="${cssPath}">`;
    }

    // Add custom CSS
    if (this.customCss) html += '<style>' + this.customCss + '</style>';

    html += '</head><body class="b6plus">';

    const classes = this.makeClassName(slide);
    const id = slide.id ? ` id="${slide.id}"` : '';

    html += `<section${id} class="${classes}" style="counter-reset: slide ${slideNumber - 1}">${slide.content}</section>`;
    html += '</body></html>';

    tempDoc.write(html);
    tempDoc.close();

    // Wait for styles and images to load
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Render to canvas - use the section element directly
      const canvas = await window.html2canvas(tempDoc.body.firstElementChild, {
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
      console.error('Error generating thumbnail:', err);
      thumbnailContainer.innerHTML = '<div style="color: #999; font-size: 10px;">Preview unavailable</div>';
    }

    // Remove temporary iframe
    document.body.removeChild(tempFrame);
  }

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
      const wrapper = this.editorFrame.contentDocument.getElementById('slide-wrapper');
      if (wrapper) {
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

  updateCurrentSlideContent() {
    if (this.slides.length === 0) return;

    if (this.isHtmlView) {
      this.slides[this.currentSlideIndex].content = document.getElementById('html-editor').value;
    } else {
      if (this.editor)
        this.slides[this.currentSlideIndex].content = this.editor.getHTML();
    }

    if (this.slides[this.currentSlideIndex].thumbnailtimer !== null)
      clearTimeout(this.slides[this.currentSlideIndex].thumbnailtimer);
    this.slides[this.currentSlideIndex].thumbnailtimer = setTimeout((i) => {
      this.generateThumbnail(i)}, 2000, this.currentSlideIndex);
  }

  toggleView() {
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
      document.getElementById('html-editor').value = currentSlide ? currentSlide.content : '';
    } else {
      wysiwygContainer.style.display = 'flex';
      htmlContainer.style.display = 'none';
      toggleButton.textContent = '🔄 HTML view';

      this.initializeSquire();
    }

    this.updateElementPath();
  }

  openStylesheetDialog() {
    document.getElementById('stylesheet-url').value = this.cssUrl || '';
    document.getElementById('stylesheet-dialog').style.display = 'flex';
  }

  closeStylesheetDialog() {
    document.getElementById('stylesheet-dialog').style.display = 'none';
  }

  async browseStylesheet() {
    const filePath = await window.electronAPI.selectCssFile();
    if (filePath)
      document.getElementById('stylesheet-url').value = 'file://' + filePath;
  }

  async applyStylesheet() {
    this.cssUrl = document.getElementById('stylesheet-url').value;
    this.applyCssToFrame();
    this.closeStylesheetDialog();
    this.hasUnsavedChanges = true;
    await this.updateLayoutsAndTransitions();
  }

  // Update the slide layouts and slide transitions menus
  async updateLayoutsAndTransitions()
  {
    let json = {};

    if (this.cssUrl) {
      const jsonPath = this.cssUrl.replace(/\.css$/i, '') + '.json';

      const result = await window.electronAPI.readFile(jsonPath);
      if (!result.success) {
	console.log(`No menu config found at ${jsonPath}. Error was:\n${result.error}\nUsing defaults`);
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
    this.cssUrlInfo["supports-clear"] = json['supports-clear'] ?? true;
    this.cssUrlInfo.layouts = json.layouts ?? SlideEditor.defaultLayouts;
    this.cssUrlInfo.transitions = json.transitions
      ?? SlideEditor.defaultTransitions;

    // Make sure all the class fields contain arrays, not single strings.
    for (const layout of this.cssUrlInfo.layouts)
      if (!Array.isArray(layout.class)) layout.class = [layout.class];

    // Update the menus
    window.electronAPI.updateLayoutAndTransitionsMenus(this.cssUrlInfo);

    // Update the dropdown menu of slide layouts
    const styleSelect = document.getElementById('slide-style');
    if (styleSelect) {
      styleSelect.innerText = '';
      for (const layout of this.cssUrlInfo.layouts) {
	const option = document.createElement('option');
	option.setAttribute('value', layout.class);
	option.append("" + layout.name);
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

  applyCssToFrame() {
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
      link.href = this.cssUrl;
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

  openCustomCssModal() {
    document.getElementById('custom-css-editor').value = this.customCss;
    document.getElementById('css-modal').style.display = 'flex';
  }

  closeCustomCssModal() {
    document.getElementById('css-modal').style.display = 'none';
  }

  saveCustomCss() {
    this.customCss = document.getElementById('custom-css-editor').value;
    this.applyCssToFrame();
    this.closeCustomCssModal();
  }

  setSlideStyleClass(styleClass) {
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

  setDefaultTransition(transition)
  {
    this.defaultTransition = transition;
  }

  setSlideTransition(transition)
  {
    if (this.slides.length === 0) return;

    const currentSlide = this.slides[this.currentSlideIndex];
    currentSlide.transition = transition;
  }

  // "clear" was selected in the menu or the checkbox was clicked
  setClear(value)
  {
    if (this.slides.length === 0) return;
    const currentSlide = this.slides[this.currentSlideIndex];

    // If value is undefined, it means toggle the current value
    value ??= !currentSlide.slideClear;

    // If the slide's value is different (can it be otherwise?) update the slide
    if (currentSlide.slideClear != value) {
      currentSlide.slideClear = value;
      this.hasUnsavedChanges = true;

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

  // "textfit" was selected in the menu or the checkbox was clicked
  setTextfit(value)
  {
    if (this.slides.length === 0) return;
    const currentSlide = this.slides[this.currentSlideIndex];

    // If value is undefined, it means toggle the current value
    value ??= !currentSlide.slideTextfit;

    // If the slide's value is different (can it be otherwise?) update the slide
    if (currentSlide.slideTextfit != value) {
      currentSlide.slideTextfit = value;
      this.hasUnsavedChanges = true;

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

  newFile() {
    if (this.hasUnsavedChanges && !confirm('Create a new file? Unsaved changes will be lost.')) {
      return;
    }

    this.slides = [];
    this.currentSlideIndex = 0;
    this.currentFilePath = null;
    this.fileDirectory = null;
    this.hasUnsavedChanges = false;
    this.addInitialSlide();
  }

  async saveFile()
  {
    if (this.currentFilePath) await this.writeToFile(this.currentFilePath);
    else await this.saveFileAs();
  }

  async saveFileAs() {
    const filePath = await window.electronAPI.saveFileDialog(this.currentFilePath);
    if (filePath) {
      this.currentFilePath = filePath;
      // Extract directory from the file path (simple approach - get everything before last slash/backslash)
      const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      this.fileDirectory = filePath.substring(0, lastSlash);
      await this.writeToFile(filePath);
    }
  }

  async writeToFile(filePath) {
    this.updateCurrentSlideContent();

    const html = await this.generateHtml();
    const result = await window.electronAPI.writeFile(filePath, html);

    if (result.success) {
      this.hasUnsavedChanges = false;
      alert('File saved successfully!');
    } else {
      alert('Error saving file: ' + result.error);
    }
  }

  async playSlides() {
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

  async generateHtmlForPlay() {
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>Slide Deck</title>\n';

    // Add base tag if we have a current file directory
    if (this.fileDirectory)
      html += `    <base href="file://${this.fileDirectory}/">\n`;

    // Add CSS link (now just the filename or relative path as-is)
    if (this.cssUrl) {
      let cssPath = this.cssUrl;

      // If it's a file:// URL, make it relative to the base directory
      if (cssPath.startsWith('file://') && this.fileDirectory) {
        const cleanPath = cssPath.replace('file://', '');
        cssPath = await window.electronAPI.makeRelativePath(
          this.fileDirectory + '/dummy.html',
          cleanPath
        );
      }
      // If it's http/https, use as-is
      // If it's already a relative path, use as-is

      html += `    <link rel="stylesheet" href="${cssPath}">\n`;
    }

    if (this.customCss) {
      html += '    <style>\n';
      html += this.customCss.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += '    </style>\n';
    }

    if (this.includeB6plus) {
      html += '    <script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';
    }

    // Add default transition to body if set
    const bodyClass = this.defaultTransition ? `b6plus ${this.defaultTransition}` : 'b6plus';
    html += `</head>\n<body class="${bodyClass}">\n`;

    this.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      html += `    <section${id} class="${this.makeClassName(slide)}">\n`;
      html += slide.content.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += '    </section>\n';
    });

    html += '</body>\n</html>';

    return html;
  }

  async generateHtml(targetPath) {
    // Use provided targetPath or fall back to currentFilePath
    const filePath = targetPath || this.currentFilePath;

    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>Slide Deck</title>\n';

    if (this.cssUrl) {
      // Convert CSS URL to be relative to the save location if it's a local absolute path
      let cssUrlToWrite = this.cssUrl;

      if (filePath) {
        const isAbsolute = await window.electronAPI.isAbsolutePath(this.cssUrl);

        // If it's a local absolute path (not a URL), make it relative
        if (isAbsolute && !this.cssUrl.startsWith('http://') && !this.cssUrl.startsWith('https://')) {
          // Remove file:// prefix if present
          let cleanCssPath = this.cssUrl.replace('file://', '');
          cssUrlToWrite = await window.electronAPI.makeRelativePath(filePath, cleanCssPath);
        }
      }

      html += `    <link rel="stylesheet" href="${cssUrlToWrite}">\n`;
    }

    if (this.customCss) {
      html += '    <style>\n';
      html += this.customCss.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += '    </style>\n';
    }

    if (this.includeB6plus) {
      html += '    <script src="https://www.w3.org/Talks/Tools/b6plus/b6plus.js"></script>\n';
    }

    // Add default transition to body if set
    const bodyClass = this.defaultTransition ? ` class="b6plus ${this.defaultTransition}"` : ' class="b6plus"';
    html += `</head>\n<body${bodyClass}>\n`;

    this.slides.forEach(slide => {
      const id = slide.id ? ` id="${slide.id}"` : '';
      html += `    <section${id} class="${this.makeClassName(slide)}">\n`;
      html += slide.content.split('\n').map(line => '        ' + line).join('\n') + '\n';
      html += '    </section>\n';
    });

    html += '</body>\n</html>';

    return html;
  }

  async openFile(data) {
    if (this.hasUnsavedChanges && !confirm('Open a file? Unsaved changes will be lost.')) {
      return;
    }

    const { path, directory, content } = data;

    this.currentFilePath = path;
    this.fileDirectory = directory;

    // Update base URL in iframe for relative paths
    if (this.editorFrame && this.editorFrame.contentDocument) {
      const baseTag = this.editorFrame.contentDocument.getElementById('base-url');
      if (baseTag && directory) baseTag.href = 'file://' + directory + '/';
    }

    await this.parseHtml(content, path);
    this.hasUnsavedChanges = false;
    this.updateSlidesList();
    this.loadCurrentSlide();
  }

  async parseHtml(html, filePath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract CSS URL
    const linkElement = doc.querySelector('link[rel="stylesheet"]');
    if (linkElement) {
      let cssHref = linkElement.getAttribute('href');

      // If it's a relative path, resolve it to absolute
      if (cssHref && filePath) {
        const isAbsolute = await window.electronAPI.isAbsolutePath(cssHref);

        if (!isAbsolute) {
          // Resolve relative path to absolute path
          const absolutePath = await window.electronAPI.resolvePath(filePath, cssHref);
          // Convert to file:// URL for use in the editor
          this.cssUrl = 'file://' + absolutePath;
        } else {
          this.cssUrl = cssHref;
        }
      } else {
        this.cssUrl = cssHref || '';
      }
      this.updateLayoutsAndTransitions();

      // Don't need to update the input here since it's in a dialog
      // The dialog will be populated when opened
    }

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
      let layout = '';
      for (const layout of this.cssUrlInfo.layouts)
	for (const x of layout.class)
	  if (x && x.split(' ').every(c => section.classList.contains(c)))
	    layout = layout.class[0]; // The first entry is the canonical one
      if (layout)
	for (const c of layout.split(' ')) section.classList.remove(c);

      this.slides.push({
        type: type,
        content: section.innerHTML.trim(),
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

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + 0.1, 3.0);
    this.applyZoom();
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.3);
    this.applyZoom();
  }

  zoomReset() {
    this.zoomLevel = 1.0;
    this.applyZoom();
  }

  applyZoom() {
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

  selectAll() {
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

  updateFormatButtonStates() {
    if (!this.editor || this.isHtmlView) return;

    // Get current format state from Squire
    const isBold = this.editor.hasFormat('b') || this.editor.hasFormat('strong');
    const isItalic = this.editor.hasFormat('i') || this.editor.hasFormat('em');
    const isUnderline = this.editor.hasFormat('u');
    const isStrikethrough = this.editor.hasFormat('s') || this.editor.hasFormat('strike');
    const isCode = this.editor.hasFormat('code');

    // Update button states
    const boldBtn = document.getElementById('format-bold');
    const italicBtn = document.getElementById('format-italic');
    const underlineBtn = document.getElementById('format-underline');
    const strikeBtn = document.getElementById('format-strikethrough');
    const codeBtn = document.getElementById('format-code');

    if (boldBtn) boldBtn.classList.toggle('active', isBold);
    if (italicBtn) italicBtn.classList.toggle('active', isItalic);
    if (underlineBtn) underlineBtn.classList.toggle('active', isUnderline);
    if (strikeBtn) strikeBtn.classList.toggle('active', isStrikethrough);
    if (codeBtn) codeBtn.classList.toggle('active', isCode);
  }

  // Formatting methods
  formatBold() {
    if (this.editor && !this.isHtmlView) {
      const isBold = this.editor.hasFormat('b')
        || this.editor.hasFormat('strong');
      if (isBold) this.editor.removeBold();
      else this.editor.bold();
      this.updateFormatButtonStates();
    }
  }

  formatItalic() {
    if (this.editor && !this.isHtmlView) {
      const isItalic = this.editor.hasFormat('i')
        || this.editor.hasFormat('em');
      if (isItalic) this.editor.removeItalic();
      else this.editor.italic();
      this.updateFormatButtonStates();
    }
  }

  formatUnderline() {
    if (this.editor && !this.isHtmlView) {
      const isUnderline = this.editor.hasFormat('u');
      if (isUnderline) this.editor.removeUnderline();
      else this.editor.underline();
      this.updateFormatButtonStates();
    }
  }

  formatStrikethrough() {
    if (this.editor && !this.isHtmlView) {
      const isStrikethrough = this.editor.hasFormat('s')
        || this.editor.hasFormat('strike');
      if (isStrikethrough) this.editor.removeStrikethrough();
      else this.editor.strikethrough();
      this.updateFormatButtonStates();
    }
  }

  formatCode() {
    if (this.editor && !this.isHtmlView) {
      const isCode = this.editor.hasFormat('code');
      if (isCode) this.editor.removeCode();
      else this.editor.code();
      this.updateFormatButtonStates();
    }
  }

  formatLink() {
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

  closeLinkDialog() {
    document.getElementById('link-dialog').style.display = 'none';
  }

  applyLink() {
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

  removeLink() {
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

  setBlockFormat(format) {
    if (!this.editor || this.isHtmlView) return;

    const frameDoc = this.editorFrame.contentDocument;

    this.editor.modifyBlocks(fragment => {
      const newElement = frameDoc.createElement(format);
      const oldElement = fragment.firstChild;
      // Copy attributes
      for (let i = 0; i < oldElement.attributes.length; i++) {
	const attr = oldElement.attributes[i];
	newElement.setAttribute(attr.name, attr.value);
      }
      newElement.append(...oldElement.childNodes);
      fragment.replaceChildren(newElement);
      return fragment;
    });

    this.updateElementPath();
    this.editor.focus();
  }

  openClassDialog() {
    if (!this.editor || this.isHtmlView) return;

    const frameDoc = this.editorFrame.contentDocument;
    const selection = frameDoc.getSelection();

    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;

    if (element.nodeType === 3) element = element.parentNode;

    // Get current class
    const currentClass = element.className || '';
    document.getElementById('class-input').value = currentClass;
    document.getElementById('class-dialog').style.display = 'flex';
  }

  closeClassDialog() {
    document.getElementById('class-dialog').style.display = 'none';
  }

  applyClass() {
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

  removeClass() {
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
}

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

        // Extract directory from path
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const directory = filePath.substring(0, lastSlash);

        editorInstance.openFile({
          path: filePath,
          directory: directory,
          content: content
        });
      } else {
        alert('Please drop an HTML file');
      }
    }
  });
});

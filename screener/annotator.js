// Konva-backed annotation surface. Konva is loaded as a global (vendor/konva.min.js,
// classic <script> before this module). Coordinates live in NATURAL image pixels;
// the stage is scaled to fit (× a zoom factor), so exports come back at full
// resolution. When zoomed past the viewport, the wrap's scrollbars pan.

const REDACT_FILL = "#000000";
const TEXT_FONT_SIZE = 22; // natural px
const HISTORY_LIMIT = 60;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export class Annotator {
  constructor(container) {
    this.container = container;
    this.tool = "arrow"; // most captures just need an arrow dropped on them
    this.color = "#ef4444"; // red
    this.strokeWidth = 8; // thick
    this.zoom = 1; // user zoom, relative to fit
    this.fitScale = 1; // scale that fits the image in the viewport
    this.scale = 1; // fitScale * zoom — natural→display
    this.pixelSize = 12;
    this.natural = { w: 0, h: 0 };
    this.image = null;
    this.stage = null;
    this.imageLayer = null;
    this.annoLayer = null;
    this.tr = null;
    this.drawing = null;
    this.start = null;
    this.history = [];
    this.hIndex = -1;
    this.textarea = null;
    this.onChange = null; // (canUndo, canRedo)
    this.onZoom = null; // (percent)
  }

  async load(dataUrl) {
    const Konva = globalThis.Konva;
    const img = await loadImage(dataUrl);
    this.image = img;
    this.natural = { w: img.naturalWidth, h: img.naturalHeight };
    this.pixelSize = Math.max(8, Math.round(this.natural.w / 110)); // chunky regardless of resolution

    this.stage = new Konva.Stage({ container: this.container, width: 1, height: 1 });
    this.imageLayer = new Konva.Layer({ listening: false });
    this.annoLayer = new Konva.Layer();
    this.stage.add(this.imageLayer, this.annoLayer);

    this.imageLayer.add(new Konva.Image({ image: img, x: 0, y: 0, width: this.natural.w, height: this.natural.h }));
    this.tr = new Konva.Transformer({ rotateEnabled: false, ignoreStroke: true, padding: 2 });
    this.annoLayer.add(this.tr);

    this.fit();
    this.bindStage();
    this.setTool(this.tool); // apply the default tool's cursor
    window.addEventListener("resize", () => this.fit());

    this.history = [];
    this.hIndex = -1;
    this.snapshot(); // baseline (empty) so undo can return to a clean image
  }

  // --- zoom / fit ---

  fit() {
    // The #stage container collapses to 0×0 until Konva sizes it, so measure the
    // scrollable wrap around it instead.
    const host = this.container.parentElement || this.container;
    const availW = Math.max(64, host.clientWidth - 48);
    const availH = Math.max(64, host.clientHeight - 48);
    this.fitScale = Math.min(availW / this.natural.w, availH / this.natural.h, 1) || 1;
    this.applyScale();
  }

  applyScale() {
    this.scale = this.fitScale * this.zoom;
    this.stage.scale({ x: this.scale, y: this.scale });
    this.stage.size({
      width: Math.round(this.natural.w * this.scale),
      height: Math.round(this.natural.h * this.scale),
    });
    this.stage.batchDraw();
    this.onZoom?.(Math.round(this.scale * 100));
  }

  setZoom(z) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    this.applyScale();
  }

  zoomBy(factor) {
    this.setZoom(this.zoom * factor);
  }

  fitToWindow() {
    this.zoom = 1;
    this.fit();
  }

  // --- tool / style state ---

  setTool(name) {
    this.tool = name;
    const selectMode = name === "select";
    for (const shape of this.shapes()) shape.listening(selectMode);
    if (!selectMode) this.clearSelection();
    this.container.style.cursor = selectMode ? "default" : name === "text" ? "text" : "crosshair";
  }

  isImageRedact(node) {
    return node.name() === "redact" || node.name() === "pixelate";
  }

  setColor(color) {
    this.color = color;
    const sel = this.selected();
    if (!sel || sel.getClassName() === "Image" || this.isImageRedact(sel)) return;
    if (sel.getClassName() === "Text") sel.fill(color);
    else if (sel.getClassName() === "Arrow") sel.stroke(color), sel.fill(color);
    else sel.stroke(color);
    this.snapshot();
  }

  setStrokeWidth(w) {
    this.strokeWidth = w;
    const sel = this.selected();
    if (sel && typeof sel.strokeWidth === "function" && !this.isImageRedact(sel)) {
      sel.strokeWidth(w);
      this.snapshot();
    }
  }

  // --- selection / transformer ---

  shapes() {
    return this.annoLayer.getChildren((n) => n !== this.tr);
  }

  selected() {
    return this.tr.nodes()[0] || null;
  }

  select(shape) {
    this.tr.nodes([shape]);
    this.annoLayer.batchDraw();
  }

  clearSelection() {
    this.tr.nodes([]);
    this.annoLayer.batchDraw();
  }

  deleteSelected() {
    const sel = this.selected();
    if (!sel) return;
    this.clearSelection();
    sel.destroy();
    this.snapshot();
  }

  // --- history ---

  serialize() {
    return JSON.stringify(this.shapes().map((s) => s.toObject()));
  }

  snapshot() {
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(this.serialize());
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.hIndex = this.history.length - 1;
    this.emitChange();
  }

  restore(state) {
    const Konva = globalThis.Konva;
    this.clearSelection();
    for (const s of this.shapes()) s.destroy();
    for (const obj of JSON.parse(state)) {
      const node = Konva.Node.create(obj);
      this.annoLayer.add(node);
      // Image nodes (pixelate redactions) don't serialize their bitmap or
      // filters — re-attach and re-cache from the saved crop/size.
      if (node.getClassName() === "Image") {
        node.image(this.image);
        this.applyPixelate(node);
      }
      this.bindShape(node);
      node.listening(this.tool === "select");
    }
    this.annoLayer.batchDraw();
    this.emitChange();
  }

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this.restore(this.history[this.hIndex]);
  }

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this.restore(this.history[this.hIndex]);
  }

  canUndo() {
    return this.hIndex > 0;
  }

  canRedo() {
    return this.hIndex < this.history.length - 1;
  }

  emitChange() {
    this.onChange?.(this.canUndo(), this.canRedo());
  }

  // --- pixelate redaction ---

  // Pixelate the screenshot region the node currently covers, clamped to image
  // bounds, then cache so the filter renders.
  applyPixelate(node) {
    const Konva = globalThis.Konva;
    // Round to whole pixels — a fractional crop edge leaves a grey sub-pixel seam.
    const x = Math.round(Math.max(0, Math.min(node.x(), this.natural.w)));
    const y = Math.round(Math.max(0, Math.min(node.y(), this.natural.h)));
    const w = Math.round(Math.max(1, Math.min(node.width(), this.natural.w - x)));
    const h = Math.round(Math.max(1, Math.min(node.height(), this.natural.h - y)));
    node.setAttrs({ x, y, width: w, height: h, crop: { x, y, width: w, height: h } });
    node.strokeWidth(0); // drop the drag-preview border
    node.filters([Konva.Filters.Pixelate]);
    node.pixelSize(this.pixelSize);
    node.cache({ pixelRatio: 1 }); // integer bounds now (rounded above) — no sub-pixel seam
  }

  // Bake any transformer scale into width/height, then re-pixelate.
  refreshPixelate(node) {
    const sx = node.scaleX();
    const sy = node.scaleY();
    if (sx !== 1 || sy !== 1) {
      node.width(Math.max(1, node.width() * sx));
      node.height(Math.max(1, node.height() * sy));
      node.scale({ x: 1, y: 1 });
    }
    this.applyPixelate(node);
  }

  // --- drawing ---

  bindShape(shape) {
    shape.draggable(true);
    shape.on("dragstart", () => {
      if (this.tool === "select") this.select(shape);
    });
    shape.on("dragend transformend", () => {
      if (shape.name() === "pixelate") this.refreshPixelate(shape);
      this.snapshot();
    });
  }

  bindStage() {
    const Konva = globalThis.Konva;

    this.stage.on("wheel", (e) => {
      e.evt.preventDefault();
      this.zoomBy(e.evt.deltaY > 0 ? 0.9 : 1.1);
    });

    // Selection happens at the stage level off the event target — more reliable
    // than per-shape handlers, and clicks on the image fall through to the stage.
    this.stage.on("click tap", (e) => {
      if (this.tool !== "select") return;
      const t = e.target;
      if (t === this.stage) return this.clearSelection();
      if (t.getParent() === this.tr) return; // a transformer handle
      this.select(t);
    });

    this.stage.on("mousedown touchstart", (e) => {
      if (this.tool === "select") {
        if (e.target === this.stage) this.clearSelection();
        return;
      }
      const p = this.stage.getRelativePointerPosition();
      this.start = p;

      if (this.tool === "text") {
        this.openTextEditor(p, e.evt);
        return;
      }

      let shape;
      if (this.tool === "rect") {
        shape = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: this.color, strokeWidth: this.strokeWidth });
      } else if (this.tool === "redact") {
        shape = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, fill: REDACT_FILL, name: "redact" });
      } else if (this.tool === "pixelate") {
        // A sharp crop over the same pixels is invisible while dragging, so show
        // a border for feedback; applyPixelate drops it on release.
        shape = new Konva.Image({
          image: this.image,
          x: p.x,
          y: p.y,
          width: 0,
          height: 0,
          name: "pixelate",
          stroke: "#3b82f6",
          strokeWidth: Math.max(1, Math.round(2 / this.scale)),
        });
      } else if (this.tool === "arrow") {
        shape = new Konva.Arrow({
          points: [p.x, p.y, p.x, p.y],
          stroke: this.color,
          fill: this.color,
          strokeWidth: this.strokeWidth,
          pointerLength: Math.max(8, this.strokeWidth * 2.5),
          pointerWidth: Math.max(8, this.strokeWidth * 2.5),
        });
      } else if (this.tool === "pen") {
        shape = new Konva.Line({
          points: [p.x, p.y],
          stroke: this.color,
          strokeWidth: this.strokeWidth,
          lineCap: "round",
          lineJoin: "round",
        });
      }
      if (!shape) return;
      shape.listening(false);
      this.annoLayer.add(shape);
      this.drawing = shape;
    });

    this.stage.on("mousemove touchmove", () => {
      if (!this.drawing) return;
      const p = this.stage.getRelativePointerPosition();
      const cls = this.drawing.getClassName();
      if (cls === "Image") {
        // Normalize live and crop to the covered region — otherwise a negative
        // drag draws the whole screenshot mirrored and squished into the box.
        const x = Math.min(this.start.x, p.x);
        const y = Math.min(this.start.y, p.y);
        const w = Math.abs(p.x - this.start.x);
        const h = Math.abs(p.y - this.start.y);
        this.drawing.setAttrs({ x, y, width: w, height: h });
        if (w >= 1 && h >= 1) this.drawing.crop({ x, y, width: w, height: h });
      } else if (cls === "Rect") {
        this.drawing.width(p.x - this.start.x);
        this.drawing.height(p.y - this.start.y);
      } else if (cls === "Arrow") {
        this.drawing.points([this.start.x, this.start.y, p.x, p.y]);
      } else if (cls === "Line") {
        this.drawing.points(this.drawing.points().concat([p.x, p.y]));
      }
    });

    this.stage.on("mouseup touchend", () => {
      if (!this.drawing) return;
      const shape = this.drawing;
      this.drawing = null;
      if (this.isTooSmall(shape)) {
        shape.destroy();
        return;
      }
      this.normalizeRect(shape);
      if (shape.name() === "pixelate") this.applyPixelate(shape);
      this.bindShape(shape);
      this.snapshot();
    });
  }

  isTooSmall(shape) {
    const cls = shape.getClassName();
    if (cls === "Rect" || cls === "Image") return Math.abs(shape.width()) < 5 || Math.abs(shape.height()) < 5;
    if (cls === "Arrow") {
      const [x1, y1, x2, y2] = shape.points();
      return Math.hypot(x2 - x1, y2 - y1) < 6;
    }
    if (cls === "Line") return shape.points().length < 6; // fewer than 3 points
    return false;
  }

  // Rects/images can have negative width/height while dragging; flip to positive.
  normalizeRect(shape) {
    const cls = shape.getClassName();
    if (cls !== "Rect" && cls !== "Image") return;
    let { x, y } = shape.position();
    let w = shape.width();
    let h = shape.height();
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    shape.setAttrs({ x, y, width: w, height: h });
  }

  // --- text ---

  openTextEditor(naturalPos, evt) {
    evt?.preventDefault?.(); // keep focus off the canvas so the textarea can hold it
    if (this.textarea) this.commitText();
    const ta = document.createElement("textarea");
    ta.value = "";
    const fontPx = TEXT_FONT_SIZE * this.scale;
    Object.assign(ta.style, {
      position: "fixed",
      left: `${evt.clientX}px`,
      top: `${evt.clientY}px`,
      margin: "0",
      padding: "2px 4px",
      border: "1px solid #3b82f6",
      borderRadius: "4px",
      outline: "none",
      resize: "none",
      overflow: "hidden",
      background: "rgba(255,255,255,0.95)",
      color: this.color,
      font: `${fontPx}px sans-serif`,
      lineHeight: "1.2",
      zIndex: "2147483647",
      minWidth: "40px",
    });
    document.body.appendChild(ta);
    this.textarea = ta;
    this.textPos = naturalPos;

    const autosize = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
      ta.style.width = "auto";
      ta.style.width = Math.max(40, ta.scrollWidth + 6) + "px";
    };
    ta.addEventListener("input", autosize);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.commitText();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelText();
      }
    });

    // Focus next frame, then watch for blur — focusing during the creating
    // mousedown gets immediately undone by the browser, blurring it empty.
    requestAnimationFrame(() => {
      ta.focus();
      ta.addEventListener("blur", () => this.commitText());
    });
  }

  commitText() {
    const ta = this.textarea;
    if (!ta) return;
    this.textarea = null;
    const value = ta.value.trim();
    ta.remove();
    if (!value) return;
    const Konva = globalThis.Konva;
    const text = new Konva.Text({
      x: this.textPos.x,
      y: this.textPos.y,
      text: value,
      fontSize: TEXT_FONT_SIZE,
      fontFamily: "sans-serif",
      fill: this.color,
    });
    this.annoLayer.add(text);
    this.bindShape(text);
    text.listening(this.tool === "select");
    this.snapshot();
  }

  cancelText() {
    if (!this.textarea) return;
    this.textarea.remove();
    this.textarea = null;
  }

  // --- export ---

  isEmpty() {
    return this.shapes().length === 0;
  }

  toDataURL() {
    this.clearSelection();
    return this.stage.toDataURL({ mimeType: "image/png", pixelRatio: 1 / this.scale });
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the captured image."));
    img.src = src;
  });
}

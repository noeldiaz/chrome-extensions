// Konva-backed annotation surface. Konva is loaded as a global (vendor/konva.min.js,
// classic <script> before this module). Coordinates live in NATURAL image pixels;
// the stage is scaled to fit (× a zoom factor), so exports come back at full
// resolution. When zoomed past the viewport, the wrap's scrollbars pan.

import { t } from "./i18n.js";

const REDACT_FILL = "#000000";
const TEXT_FONT_SIZE = 22; // natural px
const HISTORY_LIMIT = 60;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const PIN_FILL = "#1e88e5"; // numbered comment pins — our blue/white scheme
const PIN_TEXT = "#ffffff";

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
    this.pinRadius = 18; // natural px; recomputed per image in load()
    this.pinCard = null; // floating comment card (DOM)
    this.editingPin = null; // pin whose card is open for editing
    this.onChange = null; // (canUndo, canRedo)
    this.onZoom = null; // (percent)
  }

  async load(dataUrl) {
    const Konva = globalThis.Konva;
    const img = await loadImage(dataUrl);
    this.image = img;
    this.natural = { w: img.naturalWidth, h: img.naturalHeight };
    this.pixelSize = Math.max(8, Math.round(this.natural.w / 110)); // chunky regardless of resolution
    this.pinRadius = Math.max(14, Math.round(this.natural.w / 70)); // readable on full-page captures

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
    for (const shape of this.shapes()) {
      shape.listening(this.shouldListen(shape));
      if (shape.name() === "pin") shape.draggable(selectMode); // pins move only in select mode
    }
    if (!selectMode) this.clearSelection();
    this.hidePinCard();
    this.container.style.cursor = selectMode ? "default" : name === "text" ? "text" : "crosshair";
  }

  // Pins stay clickable in comment mode (to re-open their card); everything is
  // clickable in select mode. Otherwise shapes ignore pointer events.
  shouldListen(shape) {
    return this.tool === "select" || (this.tool === "comment" && shape.name() === "pin");
  }

  isImageRedact(node) {
    return node.name() === "redact" || node.name() === "pixelate";
  }

  setColor(color) {
    this.color = color;
    const sel = this.selected();
    if (!sel || sel.getClassName() === "Image" || this.isImageRedact(sel) || sel.name() === "pin") return;
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
    this.tr.resizeEnabled(shape.name() !== "pin"); // pins move but don't scale
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
    const wasPin = sel.name() === "pin";
    this.clearSelection();
    sel.destroy();
    if (wasPin) this.renumberPins();
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
      node.listening(this.shouldListen(node));
      if (node.name() === "pin") node.draggable(this.tool === "select");
    }
    this.renumberPins();
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
      this.hidePinCard();
    });
    shape.on("dragend transformend", () => {
      if (shape.name() === "pixelate") this.refreshPixelate(shape);
      this.snapshot();
    });
    if (shape.name() === "pin") this.bindPinHover(shape);
  }

  // Hovering a pin reveals its comment as a read-only card (when it has text).
  bindPinHover(pin) {
    pin.on("mouseenter", () => {
      if (this.tool !== "comment" && this.tool !== "select") return;
      this.container.style.cursor = "pointer";
      if (!this.editingPin && (pin.getAttr("comment") || "").trim()) this.showPinCard(pin, false);
    });
    pin.on("mouseleave", () => {
      this.container.style.cursor = this.tool === "select" ? "default" : "crosshair";
      if (!this.editingPin) this.hidePinCard();
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
      const target = e.target;
      if (target === this.stage) return this.clearSelection();
      if (target.getParent() === this.tr) return; // a transformer handle
      this.select(target);
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

      if (this.tool === "comment") {
        // Click an existing pin to edit it; click empty space to drop the next one.
        const pin = this.pinFromTarget(e.target);
        this.showPinCard(pin || this.addPin(p), true);
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

  // --- numbered comment pins ---

  // Walk up from an event target to the enclosing pin group, if any.
  pinFromTarget(node) {
    let n = node;
    while (n && n !== this.stage) {
      if (typeof n.name === "function" && n.name() === "pin") return n;
      n = typeof n.getParent === "function" ? n.getParent() : null;
    }
    return null;
  }

  pins() {
    return this.shapes().filter((s) => s.name() === "pin");
  }

  // A pin = a group (so it moves as one) with a filled circle + centered number,
  // carrying its comment text as a custom attr that serializes with the scene.
  addPin(natural) {
    const Konva = globalThis.Konva;
    const r = this.pinRadius;
    const group = new Konva.Group({ x: natural.x, y: natural.y, name: "pin", comment: "" });
    group.add(
      new Konva.Circle({
        radius: r,
        fill: PIN_FILL,
        stroke: "#ffffff",
        strokeWidth: Math.max(2, Math.round(r * 0.18)),
        shadowColor: "#0b3a66",
        shadowBlur: r * 0.5,
        shadowOpacity: 0.35,
        shadowOffsetY: 1,
      }),
      new Konva.Text({
        text: "0",
        fontSize: Math.round(r * 1.2),
        fontStyle: "bold",
        fontFamily: "sans-serif",
        fill: PIN_TEXT,
        listening: false,
      }),
    );
    this.annoLayer.add(group);
    this.bindShape(group);
    group.listening(this.shouldListen(group));
    group.draggable(this.tool === "select");
    this.renumberPins();
    this.snapshot();
    return group;
  }

  centerPinLabel(pin) {
    const label = pin.findOne("Text");
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
    label.position({ x: 0, y: 0 });
  }

  // Pins are numbered 1..N by their order in the layer; re-run after add/delete.
  renumberPins() {
    this.pins().forEach((pin, i) => {
      pin.setAttr("pinNumber", i + 1);
      pin.findOne("Text").text(String(i + 1));
      this.centerPinLabel(pin);
    });
    this.annoLayer.batchDraw();
  }

  deletePin(pin) {
    this.hidePinCard();
    this.clearSelection();
    pin.destroy();
    this.renumberPins();
    this.snapshot();
  }

  // Viewport position just off a pin's right edge, for the floating card.
  pinScreenPos(pin) {
    const abs = pin.absolutePosition();
    const rect = this.stage.container().getBoundingClientRect();
    const gap = this.pinRadius * this.scale + 10;
    return { x: rect.left + abs.x + gap, y: rect.top + abs.y - this.pinRadius * this.scale };
  }

  hidePinCard() {
    if (this.pinCard) {
      this.pinCard.remove();
      this.pinCard = null;
    }
    this.editingPin = null;
  }

  // Floating comment card next to a pin. edit=false → read-only (hover preview);
  // edit=true → textarea with autosave on blur/Enter, Esc to cancel, trash to
  // delete the pin. Light card, blue accent — matches the workspace scheme.
  showPinCard(pin, edit) {
    this.hidePinCard();
    const pos = this.pinScreenPos(pin);
    const card = document.createElement("div");
    Object.assign(card.style, {
      position: "fixed",
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      zIndex: "2147483647",
      width: "230px",
      maxWidth: "70vw",
      padding: "10px",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
      font: "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      color: "#334155",
    });

    const header = document.createElement("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: edit ? "8px" : "4px" });
    const badge = document.createElement("span");
    badge.textContent = "#" + (pin.getAttr("pinNumber") || "");
    Object.assign(badge.style, { fontWeight: "700", color: PIN_FILL });
    header.appendChild(badge);

    if (edit) {
      const spacer = document.createElement("span");
      spacer.style.flex = "1";
      const del = document.createElement("button");
      del.type = "button";
      del.title = t("commentDeletePin");
      del.setAttribute("aria-label", t("commentDeletePin"));
      Object.assign(del.style, { border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", padding: "2px", lineHeight: "0" });
      del.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.35 9m-4.78 0L9.26 9M9.97 4.5h4.06M19.5 5.25l-.84 12.6a2.25 2.25 0 01-2.24 2.1H7.58a2.25 2.25 0 01-2.24-2.1L4.5 5.25M3.75 5.25h16.5"/></svg>';
      del.addEventListener("mousedown", (ev) => ev.preventDefault()); // keep textarea focus (don't blur-commit first)
      del.addEventListener("click", () => this.deletePin(pin));
      header.append(spacer, del);
    }
    card.appendChild(header);

    if (edit) {
      const original = pin.getAttr("comment") || "";
      const ta = document.createElement("textarea");
      ta.value = original;
      ta.placeholder = t("commentPlaceholder");
      Object.assign(ta.style, {
        width: "100%",
        boxSizing: "border-box",
        minHeight: "54px",
        resize: "none",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        padding: "6px 8px",
        outline: "none",
        font: "inherit",
        color: "#0f172a",
      });
      ta.addEventListener("focus", () => (ta.style.borderColor = PIN_FILL));
      ta.addEventListener("blur", () => this.commitPinCard(pin, ta.value, original));
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          ta.blur();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          this.hidePinCard();
        }
      });
      const hint = document.createElement("div");
      hint.textContent = t("commentHint");
      Object.assign(hint.style, { marginTop: "6px", fontSize: "11px", color: "#94a3b8" });
      card.append(ta, hint);
      this.editingPin = pin;
      document.body.appendChild(card);
      this.pinCard = card;
      requestAnimationFrame(() => {
        ta.focus();
        ta.select();
      });
    } else {
      const body = document.createElement("div");
      body.textContent = pin.getAttr("comment") || "";
      body.style.whiteSpace = "pre-wrap";
      card.appendChild(body);
      document.body.appendChild(card);
      this.pinCard = card;
    }

    // Nudge back into the viewport if the card overflows the right/top edge.
    const box = card.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) {
      card.style.left = `${Math.max(8, pos.x - box.width - 2 * (this.pinRadius * this.scale + 10))}px`;
    }
    if (box.top < 8) card.style.top = "8px";
  }

  commitPinCard(pin, value, original) {
    if (!this.pinCard) return; // already closed (Esc or delete)
    this.pinCard.remove();
    this.pinCard = null;
    this.editingPin = null;
    const v = value.trim();
    if (v === original.trim()) return; // unchanged — don't push a history entry
    pin.setAttr("comment", v);
    this.snapshot();
  }

  // --- export ---

  toDataURL() {
    this.clearSelection();
    this.hidePinCard();
    const base = this.stage.toCanvas({ pixelRatio: 1 / this.scale });
    const comments = this.pins()
      .filter((p) => (p.getAttr("comment") || "").trim())
      .map((p) => ({ n: p.getAttr("pinNumber"), text: p.getAttr("comment").trim() }))
      .sort((a, b) => a.n - b.n);
    if (!comments.length) return base.toDataURL("image/png");
    return this.composeLegend(base, comments).toDataURL("image/png");
  }

  // Append a numbered legend strip beneath the screenshot listing each pin's
  // comment. Sized in natural pixels so it matches the image's resolution.
  composeLegend(base, comments) {
    const W = base.width;
    const pad = Math.max(16, Math.round(W / 60));
    const font = Math.max(15, Math.round(W / 90));
    const lineH = Math.round(font * 1.4);
    const r = Math.round(font * 0.78);
    const rowGap = Math.round(font * 0.8);
    const textX = pad + r * 2 + Math.round(pad * 0.6);
    const maxTextW = W - textX - pad;

    const measure = document.createElement("canvas").getContext("2d");
    measure.font = `${font}px sans-serif`;
    const rows = comments.map((c) => ({ n: c.n, lines: wrapText(measure, c.text, maxTextW) }));

    let height = pad + lineH; // title row
    for (const row of rows) height += Math.max(r * 2, row.lines.length * lineH) + rowGap;
    height += pad - rowGap;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = base.height + height;
    const ctx = out.getContext("2d");
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, base.height, W, height);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, base.height, W, Math.max(1, Math.round(font / 16)));

    ctx.textBaseline = "top";
    ctx.fillStyle = "#334155";
    ctx.font = `bold ${font}px sans-serif`;
    let y = base.height + pad;
    ctx.fillText(t("commentsLegendTitle"), pad, y);
    y += lineH;

    for (const row of rows) {
      const cx = pad + r;
      const cy = y + r;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = PIN_FILL;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(row.n), cx, cy + 0.5);

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#334155";
      ctx.font = `${font}px sans-serif`;
      let ty = y;
      for (const line of row.lines) {
        ctx.fillText(line, textX, ty);
        ty += lineH;
      }
      y += Math.max(r * 2, row.lines.length * lineH) + rowGap;
    }
    return out;
  }
}

// Word-wrap `text` to `maxW` using `ctx`'s current font; honors explicit \n.
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const tentative = line ? line + " " + word : word;
      if (line && ctx.measureText(tentative).width > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = tentative;
      }
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t("couldNotLoadImage")));
    img.src = src;
  });
}

(() => {
  'use strict';

  const SCHEMA_VERSION = '1.0';
  const LANE_WIDTH = 340;
  const LANE_HEADER_H = 58;
  const LANE_DEL_BTN = 22;
  const LANE_DEL_MARGIN = 8;
  const LANE_ADD_GAP = 6;
  const LANE_ADD_SIZE = 26;
  const LANE_GUTTER_RIGHT = LANE_ADD_GAP + LANE_ADD_SIZE + 10;
  const NODE_W = 180;
  const NODE_H = 70;
  const DECISION_W = 200;
  const DECISION_H = 86;
  const NODE_LABEL_PAD_X = 10;
  const NODE_LABEL_PAD_Y = 8;
  const NODE_FONT_SIZE = 13;
  const NODE_LINE_HEIGHT = 16;
  const NODE_MAX_LABEL_LINES = 6;
  const PORT_R = 5;
  const PREFERRED_CORNER_DISTANCE = 60;
  const NODE_CLEARANCE = 14;
  const CORNER_RADIUS = 14;
  const PORT_HIT_RADIUS = 34;
  const INTERRUPT_HIT_Y = 30;
  const INTERRUPT_HIT_KEEP = 40;
  const GRID = 10;
  const NODE_VERTICAL_GAP = 80;
  // 整列の「次の行」ピッチ用。条件ノードと他ノードで親topが同じなら直下Yも揃える
  const LAYOUT_ROW_BODY_H = Math.max(NODE_H, DECISION_H);
  // 改ページ用の継続マーカー（印刷のみ描画するが、整列が避けるので寸法はここで持つ）
  const PRINT_CONTINUE_W = 120;
  const PRINT_CONTINUE_H = 52;
  const PRINT_CONTINUE_INSET = 6;  // 境界からマーカーまでの隙間
  const PRINT_CONTINUE_STEM = 12;  // エッジをマーカーへ引き込む縦の長さ
  const PRINT_CONTINUE_MIN_GAP = 10; // 直近ノードとの最小ギャップ
  // 角丸を潰さずに1コーナー描くのに必要な脚長（roundedOrthogonalPath の 0.45 係数）
  const LAYOUT_CORNER_LEG = Math.ceil(CORNER_RADIUS / 0.45);
  // 改ページ境界の前後に確保する帯。ノードはここに置かない。
  // 上下とも「マーカー接続 → 帯外でレーン移動」の2コーナーぶんを空ける。
  // （以前の ABOVE は STEM+MIN_GAP=22 しかなく、角丸に必要な ~32 未満でコーナーが潰れていた）
  const LAYOUT_PAGE_BREAK_BAND_ABOVE =
    PRINT_CONTINUE_INSET + PRINT_CONTINUE_H + Math.max(
      PRINT_CONTINUE_STEM + PRINT_CONTINUE_MIN_GAP,
      LAYOUT_CORNER_LEG * 2
    );
  const LAYOUT_PAGE_BREAK_BAND_BELOW =
    PRINT_CONTINUE_INSET + PRINT_CONTINUE_H + LAYOUT_CORNER_LEG * 2;
  const NODE_ADD_BTN_SIZE = 22;
  // bottomポートのドラッグ領域を避けてボタン中心を下げる
  const NODE_ADD_BTN_OFFSET = 24;
  const NODE_ADD_HOVER_BELOW = 44;
  const LAYOUT_CANVAS_TOP = LANE_HEADER_H + 20;
  const LAYOUT_ROUTE_SEARCH_MAX = 200;
  const MIN_CANVAS_H = 1100;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.1;
  const MEMO_W = 150;
  const MEMO_MIN_H = 120;
  const MEMO_PAD_X = 10;
  const MEMO_PAD_Y = 10;
  const MEMO_FONT_SIZE = 12;
  const MEMO_LINE_HEIGHT = 16;
  const MEMO_MAX_LINES = 12;
  const MEMO_WRAP_CHARS = 12;
  const MEMO_FOLD = 16;
  const MEMO_CANVAS_PAD = 8;
  const NODE_TYPES = ['event', 'action', 'decision', 'end'];
  const NODE_TYPE_LABELS = {
    event: 'イベント',
    action: 'アクション',
    decision: '条件',
    end: '終了'
  };
  const PORTS = ['top', 'right', 'bottom', 'left'];

  const svg = document.getElementById('canvas');
  const headerSvg = document.getElementById('laneHeaderSvg');
  // PDF印刷時に一時差し替えするため let
  let laneHeaderLayer = document.getElementById('laneHeaderLayer');
  let laneLayer = document.getElementById('laneLayer');
  let edgeLayer = document.getElementById('edgeLayer');
  let previewLayer = document.getElementById('previewLayer');
  let nodeLayer = document.getElementById('nodeLayer');
  let memoLayer = document.getElementById('memoLayer');
  let nodeAddLayer = document.getElementById('nodeAddLayer');
  let placeLayer = document.getElementById('placeLayer');
  let handlesLayer = document.getElementById('handlesLayer');
  const canvasWrap = document.getElementById('canvasWrap');
  const flowName = document.getElementById('flowName');
  const flowNameDisplay = document.getElementById('flowNameDisplay');
  const dirtyMark = document.getElementById('dirtyMark');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const fileInput = document.getElementById('fileInput');
  const startupModal = document.getElementById('startupModal');
  const emptyCanvas = document.getElementById('emptyCanvas');
  const toastEl = document.getElementById('toast');
  const laneRenameMount = document.getElementById('laneRenameMount');
  const nodeRenameMount = document.getElementById('nodeRenameMount');
  const memoRenameMount = document.getElementById('memoRenameMount');
  const edgeRenameMount = document.getElementById('edgeRenameMount');
  const canvasContent = document.getElementById('canvasContent');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInput = document.getElementById('zoomInput');
  const memoVisibleToggle = document.getElementById('memoVisibleToggle');

  let model = createScenario();
  let selection = null;
  let edgeGesture = null; // {type:'new-edge'|'rewire', ...}
  let placeGesture = null; // {type, armed, placement, interrupt}
  let placeMemoGesture = null; // {armed, placement}
  let ignorePlaceShift = false;
  let memosVisible = true;
  let undoStack = [];
  let redoStack = [];
  let modelDirty = false;
  let flowNameEditBefore = null;
  let editingFlowName = false;
  let drag = null;
  let laneDrag = null; // {actorId, pointerId, startClientX, before, moved, target}
  let toastTimer = null;
  let editingLaneId = null;
  let laneRenameBefore = null;
  let editingNodeId = null;
  let nodeRenameBefore = null;
  let editingEdgeId = null;
  let edgeRenameBefore = null;
  let editingMemoId = null;
  let memoRenameBefore = null;
  let memoClickStamp = { id: null, at: 0 };
  let zoom = 1;
  let activeTool = 'select'; // 'select' | 'zoom'
  let zoomDrag = null;
  let nodeClickStamp = { id: null, at: 0 };
  let lastCanvasWidth = 680;
  let addHoverNodeId = null;
  let quickAddNodeId = null;
  let quickAddFocusType = 'action';
  const nodePalette = document.getElementById('nodePalette');
  const quickPalette = document.getElementById('quickNodePalette');

  function createLane(order) {
    return {id: makeId('act'), label: `レーン ${order}`, order};
  }

  function createScenario() {
    return {
      schema_version: SCHEMA_VERSION,
      scenario: {
        id: makeId('scn'),
        name: '無題',
        description: ''
      },
      actors: [],
      nodes: [],
      edges: [],
      memos: []
    };
  }

  function ensureMemos(data = model) {
    if (!Array.isArray(data.memos)) data.memos = [];
    return data.memos;
  }

  let printMode = false;

  function laneOriginX() {
    if (printMode) return 0; // PDFは左詰め
    const count = orderedActors().length;
    return Math.max(0, (lastCanvasWidth - count * LANE_WIDTH) / 2);
  }

  function laneLeft(index) {
    return laneOriginX() + index * LANE_WIDTH;
  }

  function makeId(prefix) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ms}`;
    const uuid = crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
    return `${prefix}-${stamp}-${uuid}`;
  }

  function fallbackUuid() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    const h = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function stableStringify(v) { return JSON.stringify(v); }
  function isDirty() { return modelDirty; }
  function markDirty() { modelDirty = true; }
  function markClean() { modelDirty = false; }
  function modelChanged(before, after = model) {
    return !!before && stableStringify(before) !== stableStringify(after);
  }
  function snap(v) { return Math.round(v / GRID) * GRID; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // --- Pixel snapping (render-time only; model coords stay logical) ---
  // #canvas maps viewBox user units → CSS px by `zoom`.
  // strokeWidthCss: 画面上の線幅(CSS px)。奇数なら .5、偶数/塗りは整数に揃える。
  // ノード枠・エッジはズーム比例（user unit 幅 × zoom = CSS px）。
  // レーンガイド等の non-scaling-stroke は CSS px 幅をそのまま渡す。
  const STROKE_LANE = 1;
  const STROKE_NODE = 1;
  const STROKE_EDGE = 1;
  const STROKE_PORT = 1;
  const STROKE_HANDLE = 2;
  const STROKE_ADD_BTN = 1;

  // 奇数CSS px幅は .5、偶数は整数に載せてサブピクセルのにじみ（1pxが2px相当）を防ぐ
  function strokePhase(strokeWidthCss) {
    const rounded = Math.round(Number(strokeWidthCss) || 0);
    return (rounded % 2) * 0.5;
  }

  // user-unit の線幅 → 画面上の CSS px（ズーム比例ストローク用）
  function strokeCssFromUser(userStroke) {
    return (Number(userStroke) || 0) * zoom;
  }

  function snapCssPx(cssPx, strokeWidthCss = 0) {
    const phase = strokePhase(strokeWidthCss);
    return Math.round(cssPx - phase) + phase;
  }

  function pxSnapX(userX, strokeWidthCss = 0) {
    if (!Number.isFinite(userX) || !(zoom > 0)) return userX;
    return snapCssPx(userX * zoom, strokeWidthCss) / zoom;
  }

  function pxSnapY(userY, strokeWidthCss = 0) {
    if (!Number.isFinite(userY) || !(zoom > 0)) return userY;
    return snapCssPx(userY * zoom, strokeWidthCss) / zoom;
  }

  function pxSnapSize(userSize) {
    if (!Number.isFinite(userSize) || !(zoom > 0)) return userSize;
    return Math.round(userSize * zoom) / zoom;
  }

  function pxSnapPoint(p, strokeWidthCss = 0) {
    if (!p) return p;
    return { x: pxSnapX(p.x, strokeWidthCss), y: pxSnapY(p.y, strokeWidthCss) };
  }

  // Keep orthogonal segments axis-aligned after per-axis snapping
  function pxSnapOrthoPoints(points, strokeWidthCss = 0) {
    if (!points?.length) return points || [];
    const out = [{ ...pxSnapPoint(points[0], strokeWidthCss) }];
    for (let i = 1; i < points.length; i++) {
      const prev = out[i - 1];
      const cur = points[i];
      const prevSrc = points[i - 1];
      const dx = Math.abs(cur.x - prevSrc.x);
      const dy = Math.abs(cur.y - prevSrc.y);
      if (dx < dy) {
        out.push({ x: prev.x, y: pxSnapY(cur.y, strokeWidthCss) });
      } else if (dy < dx) {
        out.push({ x: pxSnapX(cur.x, strokeWidthCss), y: prev.y });
      } else {
        out.push(pxSnapPoint(cur, strokeWidthCss));
      }
    }
    return out;
  }

  // laneHeaderSvg viewBox is already in CSS px (1:1)
  function pxSnapHeader(v, strokeWidth = 0) {
    if (!Number.isFinite(v)) return v;
    return snapCssPx(v, strokeWidth);
  }

  function orderedActors() {
    return [...model.actors].sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function actorIndex(actorId) {
    return orderedActors().findIndex(a => a.id === actorId);
  }

  function actorForSelection() {
    if (selection?.kind === 'actor') return model.actors.find(a => a.id === selection.id) || null;
    if (selection?.kind === 'node') {
      const n = model.nodes.find(n => n.id === selection.id);
      return n ? model.actors.find(a => a.id === n.actor_id) || null : null;
    }
    return orderedActors()[0] || null;
  }

  function pushHistory(before) {
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    markDirty();
  }

  function mutate(fn) {
    const before = clone(model);
    fn();
    if (modelChanged(before)) {
      pushHistory(before);
      invalidateRoutes();
      renderAll();
    }
  }

  function commitDrag(before) {
    if (modelChanged(before)) {
      pushHistory(before);
    }
    invalidateRoutes();
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    clearInlineEditorState();
    redoStack.push(clone(model));
    model = undoStack.pop();
    ensureMemos();
    sanitizeSelection();
    cancelEdgeGesture();
    cancelPlaceGesture();
    cancelPlaceMemoGesture();
    markDirty();
    invalidateRoutes();
    renderAll();
  }

  function redo() {
    if (!redoStack.length) return;
    clearInlineEditorState();
    undoStack.push(clone(model));
    model = redoStack.pop();
    ensureMemos();
    sanitizeSelection();
    cancelEdgeGesture();
    cancelPlaceGesture();
    cancelPlaceMemoGesture();
    markDirty();
    invalidateRoutes();
    renderAll();
  }

  function sanitizeSelection() {
    if (!selection) return;
    const map = selection.kind === 'actor' ? model.actors
      : selection.kind === 'node' ? model.nodes
      : selection.kind === 'memo' ? ensureMemos()
      : model.edges;
    if (!map.some(x => x.id === selection.id)) selection = null;
  }

  let liveRenderRaf = 0;
  let routeCache = new Map();
  // ライブノードドラッグ中: 接続エッジ以外は前フレームの経路を再利用
  let liveStickyRoutes = false;
  let liveDragNodeId = null;

  function invalidateRoutes() {
    routeCache.clear();
  }

  function flushLiveRender() {
    liveRenderRaf = 0;
    const nodeDrag = drag?.kind === 'node' ? drag.nodeId : null;
    const memoDrag = drag?.kind === 'memo';
    liveStickyRoutes = !!(nodeDrag || memoDrag);
    liveDragNodeId = nodeDrag;
    try {
      renderCanvas({ live: true });
    } finally {
      liveStickyRoutes = false;
      liveDragNodeId = null;
    }
  }

  function scheduleLiveRender() {
    if (liveRenderRaf) return;
    liveRenderRaf = requestAnimationFrame(flushLiveRender);
  }

  function cancelScheduledLiveRender() {
    if (!liveRenderRaf) return;
    cancelAnimationFrame(liveRenderRaf);
    liveRenderRaf = 0;
  }

  function renderAll() {
    cancelScheduledLiveRender();
    liveStickyRoutes = false;
    liveDragNodeId = null;
    renderToolbar();
    renderCanvas({ live: false });
    updateFloatPalettePosition();
    syncQuickAddPalette();
  }

  function renderToolbar() {
    const name = model.scenario.name || '無題';
    if (editingFlowName) {
      flowNameDisplay.classList.add('hidden');
      flowName.classList.remove('hidden');
      if (document.activeElement !== flowName) flowName.value = name;
    } else {
      flowName.classList.add('hidden');
      flowNameDisplay.classList.remove('hidden');
      flowNameDisplay.textContent = name;
    }
    const dirty = isDirty();
    dirtyMark.style.visibility = dirty ? 'visible' : 'hidden';
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    document.title = `${name}${dirty ? ' *' : ''} - Operational Scenario Editor`;
  }

  function beginFlowNameEdit() {
    if (editingFlowName) return;
    if (editingLaneId) finishLaneRename(true);
    if (editingNodeId) finishNodeRename(true);
    if (editingEdgeId) finishEdgeLabelEdit(false);
    flowNameEditBefore = clone(model);
    editingFlowName = true;
    flowName.value = model.scenario.name || '無題';
    renderToolbar();
    requestAnimationFrame(() => {
      flowName.focus();
      flowName.select();
    });
  }

  function finishFlowNameEdit(commit) {
    if (!editingFlowName) return;
    editingFlowName = false;
    if (commit) {
      const next = flowName.value.trim() || '無題';
      if (model.scenario.name !== next) {
        model.scenario.name = next;
        if (modelChanged(flowNameEditBefore)) {
          pushHistory(flowNameEditBefore);
        }
      }
    } else if (flowNameEditBefore) {
      model.scenario.name = flowNameEditBefore.scenario.name;
    }
    flowNameEditBefore = null;
    renderToolbar();
  }

  function canvasSize() {
    const actors = orderedActors();
    const memos = ensureMemos();
    if (printMode) {
      const width = Math.max(actors.length, 1) * LANE_WIDTH;
      let maxBottom = LANE_HEADER_H + 200;
      for (const n of model.nodes) {
        const r = nodeGlobalRect(n);
        if (r) maxBottom = Math.max(maxBottom, r.y + r.h + 48);
      }
      let maxRight = width;
      if (memosVisible) {
        for (const memo of memos) {
          const r = memoRect(memo);
          if (!r) continue;
          maxBottom = Math.max(maxBottom, r.y + r.h + 48);
          maxRight = Math.max(maxRight, r.x + r.w + 40);
        }
      }
      return { width: Math.ceil(Math.max(width, maxRight)), height: Math.ceil(maxBottom) };
    }
    const laneCount = Math.max(actors.length, 1);
    const lanesWidth = laneCount * LANE_WIDTH + LANE_GUTTER_RIGHT;
    let memoRight = 0;
    let memoBottom = 0;
    for (const memo of memos) {
      const r = memoRect(memo);
      if (!r) continue;
      memoRight = Math.max(memoRight, r.x + r.w + 40);
      memoBottom = Math.max(memoBottom, r.y + r.h + 160);
    }
    let width = Math.max(canvasWrap.clientWidth / zoom, lanesWidth, 680, memoRight);
    // 左側外側メモがレーン帯に飲み込まれないよう、必要な左余白ぶん幅を確保
    if (actors.length) {
      for (let i = 0; i < 3; i++) {
        const left = Math.max(0, (width - actors.length * LANE_WIDTH) / 2);
        let next = width;
        for (const memo of memos) {
          const r = memoRect(memo);
          if (!r || r.x + r.w > left + 0.5) continue;
          const needOrigin = r.x + r.w + MEMO_CANVAS_PAD;
          next = Math.max(next, needOrigin * 2 + actors.length * LANE_WIDTH);
        }
        if (Math.abs(next - width) < 0.5) break;
        width = next;
      }
    }
    const maxY = model.nodes.reduce((m, n) => Math.max(m, Number(n.position?.y || 0) + nodeSize(n).h + 160), 0);
    const height = Math.max(canvasWrap.clientHeight / zoom, MIN_CANVAS_H, maxY, memoBottom);
    return {width, height};
  }

  function headerZoomY() {
    return Math.min(zoom, 1);
  }

  function formatZoom(value) {
    return `${Math.round(value * 100)}%`;
  }

  function parseZoomInput(raw) {
    const n = parseFloat(String(raw).replace('%', '').trim());
    if (!Number.isFinite(n)) return null;
    return n / 100;
  }

  function updateZoomUI() {
    if (document.activeElement !== zoomInput) zoomInput.value = formatZoom(zoom);
    document.documentElement.style.setProperty('--canvas-zoom', String(zoom));
    document.documentElement.style.setProperty('--lane-header-zoom-y', String(headerZoomY()));
    // サブピクセルの translateY だと SVG 全体がぼやけるので整数 CSS px に丸める
    const nudge = LANE_HEADER_H * (headerZoomY() - zoom);
    document.documentElement.style.setProperty('--canvas-y-nudge', `${Math.round(nudge)}px`);
  }

  function setZoom(next, pivotClientX, pivotClientY) {
    const prev = zoom;
    const clamped = clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    if (clamped === prev) {
      updateZoomUI();
      return;
    }

    const rect = canvasWrap.getBoundingClientRect();
    const hasPivot = Number.isFinite(pivotClientX) && Number.isFinite(pivotClientY);
    const pivotX = hasPivot ? pivotClientX : rect.left + rect.width / 2;
    const pivotY = hasPivot ? pivotClientY : rect.top + rect.height / 2;
    const offsetX = pivotX - rect.left;
    const offsetY = pivotY - rect.top;
    const contentX = (canvasWrap.scrollLeft + offsetX) / prev;
    const contentY = (canvasWrap.scrollTop + offsetY) / prev;

    zoom = clamped;
    updateZoomUI();
    renderCanvas();
    updateFloatPalettePosition();

    canvasWrap.scrollLeft = contentX * zoom - offsetX;
    canvasWrap.scrollTop = contentY * zoom - offsetY;
    updateFloatPalettePosition();
    syncQuickAddPalette();
  }

  function isSelectTool() {
    return activeTool === 'select';
  }

  function isZoomTool() {
    return activeTool === 'zoom';
  }

  function updateToolUI() {
    nodePalette.querySelectorAll('[data-tool]').forEach(btn => {
      const on = btn.dataset.tool === activeTool;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    canvasWrap.classList.toggle('tool-select', activeTool === 'select');
    canvasWrap.classList.toggle('tool-zoom', activeTool === 'zoom');
  }

  function setActiveTool(tool) {
    if (tool !== 'select' && tool !== 'zoom') return;
    if (tool === activeTool) {
      if (tool === 'select' && (placeGesture || placeMemoGesture)) {
        cancelPlaceGesture();
        cancelPlaceMemoGesture();
        renderAll();
      } else {
        updateToolUI();
      }
      return;
    }
    cancelZoomDrag();
    if (tool !== 'select' && edgeGesture) {
      cancelEdgeGesture();
    }
    if (placeGesture) cancelPlaceGesture();
    if (placeMemoGesture) cancelPlaceMemoGesture();
    activeTool = tool;
    updateToolUI();
    renderAll();
  }

  function cancelZoomDrag() {
    zoomDrag = null;
    canvasWrap.classList.remove('zooming');
  }

  function beginZoomDrag(e) {
    cancelZoomDrag();
    drag = null;
    zoomDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startZoom: zoom,
      pivotX: e.clientX,
      pivotY: e.clientY,
      moved: false,
      shiftKey: !!e.shiftKey
    };
    canvasWrap.classList.add('zooming');
    canvasWrap.setPointerCapture?.(e.pointerId);
  }

  function isLaneSelected(actorId) {
    if (selection?.kind === 'actor' && selection.id === actorId) return true;
    if (selection?.kind === 'node') {
      const n = model.nodes.find(n => n.id === selection.id);
      return !!n && n.actor_id === actorId;
    }
    return false;
  }

  function selectLane(actorId) {
    if (editingLaneId === actorId) return;
    if (editingLaneId) finishLaneRename(true);
    if (editingNodeId) finishNodeRename(true);
    if (editingEdgeId) finishEdgeLabelEdit(false);
    selection = {kind: 'actor', id: actorId};
    renderAll();
  }

  function renderCanvas(options = {}) {
    const live = !!options.live;
    const actors = orderedActors();
    const {width, height} = canvasSize();
    lastCanvasWidth = width;
    const hy = headerZoomY();
    const headerW = width * zoom;
    const headerH = LANE_HEADER_H * hy;

    svg.setAttribute('width', String(width * zoom));
    svg.setAttribute('height', String(height * zoom));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    headerSvg.setAttribute('width', String(headerW));
    headerSvg.setAttribute('height', String(headerH));
    headerSvg.setAttribute('viewBox', `0 0 ${headerW} ${headerH}`);
    headerSvg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    if (!live) updateZoomUI();

    laneHeaderLayer.innerHTML = '';
    laneHeaderLayer.removeAttribute('transform');
    laneLayer.innerHTML = '';
    edgeLayer.innerHTML = '';
    previewLayer.innerHTML = '';
    nodeLayer.innerHTML = '';
    memoLayer.innerHTML = '';
    nodeAddLayer.innerHTML = '';
    placeLayer.innerHTML = '';
    handlesLayer.innerHTML = '';

    actors.forEach((actor, i) => drawLane(actor, i, height, 'fill'));
    drawPageBreakGuides(actors, height);
    drawLaneGridLines(actors, height);
    actors.forEach((actor, i) => drawLane(actor, i, height, 'chrome'));
    drawAddLaneButton(actors.length);
    model.edges.forEach(drawEdge);
    model.nodes.forEach(drawNode);
    if (memosVisible) ensureMemos().forEach(drawMemo);
    if (!live) drawRewireHandles();
    renderEdgePreview();
    renderPlaceGhost();
    emptyCanvas.style.display = actors.length ? 'none' : 'block';
    if (!live || editingLaneId) syncLaneRenameInput();
    if (!live || editingNodeId) syncNodeRenameInput();
    if (!live || editingMemoId) syncMemoRenameInput();
    if (!live || editingEdgeId) syncEdgeLabelInput();
    updatePlaceUI();
    if (!live) renderNodeAddButtons();
  }

  function updateFloatPalettePosition() {
    const actor = actorForSelection();
    if (!actor || !orderedActors().length) {
      nodePalette.classList.add('hidden');
      return;
    }

    const idx = actorIndex(actor.id);
    if (idx < 0) {
      nodePalette.classList.add('hidden');
      return;
    }

    const ctm = svg.getScreenCTM();
    if (!ctm) {
      nodePalette.classList.add('hidden');
      return;
    }

    const topLeft = svg.createSVGPoint();
    topLeft.x = laneLeft(idx);
    topLeft.y = 0;
    const screen = topLeft.matrixTransform(ctm);

    nodePalette.classList.remove('hidden');
    const paletteW = nodePalette.offsetWidth || 48;
    const paletteH = nodePalette.offsetHeight || 200;
    const gap = 10;
    const wrapRect = canvasWrap.getBoundingClientRect();

    let left = screen.x - gap - paletteW;
    let top = screen.y;

    left = clamp(left, Math.max(8, wrapRect.left + 8), Math.max(8, window.innerWidth - paletteW - 8));
    top = clamp(top, wrapRect.top + 8, Math.max(wrapRect.top + 8, wrapRect.bottom - paletteH - 8));

    nodePalette.style.left = `${Math.round(left)}px`;
    nodePalette.style.top = `${Math.round(top)}px`;
  }

  function canQuickAddFrom(node) {
    return !!node && sourcePortsFor(node).includes('bottom');
  }

  function outgoingBottomEdges(node) {
    if (!node) return [];
    return model.edges.filter(e =>
      e.source === node.id && normalizeEdgePorts(e)?.source_port === 'bottom'
    );
  }

  function nodeAddButtonCenter(node) {
    const rect = nodeGlobalRect(node);
    if (!rect) return null;
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h + NODE_ADD_BTN_OFFSET };
  }

  // Node下半分 + 直下の帯。+ボタン自身を内包するのでホバーが途切れない
  function nodeAddHoverZone(node) {
    const rect = nodeGlobalRect(node);
    if (!rect) return null;
    const top = rect.y + rect.h * 0.55;
    return {
      x1: rect.x,
      y1: top,
      x2: rect.x + rect.w,
      y2: rect.y + rect.h + NODE_ADD_HOVER_BELOW
    };
  }

  function quickAddBlocked() {
    return !isSelectTool() || !!placeGesture || !!placeMemoGesture || !!edgeGesture || !!drag || !!laneDrag
      || !!zoomDrag || !!editingNodeId || !!editingLaneId || !!editingMemoId;
  }

  function setAddHoverNode(nodeId) {
    if (addHoverNodeId === nodeId) return;
    addHoverNodeId = nodeId;
    renderNodeAddButtons();
  }

  function updateAddHoverFromEvent(e) {
    if (quickAddBlocked()) {
      setAddHoverNode(null);
      return;
    }
    const p = eventToSvg(e);
    let found = null;
    for (const node of model.nodes) {
      if (!canQuickAddFrom(node)) continue;
      const zone = nodeAddHoverZone(node);
      if (zone && pointInsideOrOnRect(p, zone)) found = node.id;
    }
    setAddHoverNode(found);
  }

  function renderNodeAddButtons() {
    nodeAddLayer.innerHTML = '';
    if (quickAddBlocked()) return;
    const ids = [];
    const push = id => { if (id && !ids.includes(id)) ids.push(id); };
    if (selection?.kind === 'node') push(selection.id);
    push(addHoverNodeId);
    push(quickAddNodeId);
    for (const id of ids) {
      const node = model.nodes.find(n => n.id === id);
      if (canQuickAddFrom(node)) drawNodeAddButton(node);
    }
  }

  function drawNodeAddButton(node) {
    const center = nodeAddButtonCenter(node);
    if (!center) return;
    const size = NODE_ADD_BTN_SIZE;
    const x = pxSnapX(center.x - size / 2, STROKE_ADD_BTN);
    const y = pxSnapY(center.y - size / 2, STROKE_ADD_BTN);
    const g = svgEl('g', {
      class: `node-add-btn${quickAddNodeId === node.id ? ' open' : ''}`,
      transform: `translate(${x},${y})`,
      'data-node-id': node.id
    });
    g.appendChild(svgEl('rect', {x: 0, y: 0, width: size, height: size, rx: 6, ry: 6}));
    const t = svgEl('text', {x: size / 2, y: size / 2 + 0.5});
    t.textContent = '+';
    g.appendChild(t);
    const title = svgEl('title');
    title.textContent = '下にNodeを追加 (Tab)';
    g.appendChild(title);
    g.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });
    g.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      if (quickAddNodeId === node.id) closeQuickAddPalette();
      else openQuickAddPalette(node.id);
    });
    nodeAddLayer.appendChild(g);
  }

  function buildQuickPalette() {
    nodePalette.querySelectorAll('[data-node-type]').forEach(src => {
      const btn = src.cloneNode(true);
      btn.classList.remove('placing-active', 'active');
      btn.dataset.baseTitle = btn.getAttribute('title') || '';
      quickPalette.appendChild(btn);
    });
  }

  function openQuickAddPalette(nodeId) {
    const node = model.nodes.find(n => n.id === nodeId);
    if (!canQuickAddFrom(node) || quickAddBlocked()) return;
    if (editingEdgeId) finishEdgeLabelEdit(false);
    quickAddNodeId = nodeId;
    quickAddFocusType = 'action';
    selection = {kind: 'node', id: nodeId};
    renderAll();
  }

  function closeQuickAddPalette() {
    if (!quickAddNodeId) return;
    quickAddNodeId = null;
    quickAddFocusType = 'action';
    quickPalette.classList.add('hidden');
    renderNodeAddButtons();
  }

  function quickPaletteButtons() {
    return [...quickPalette.querySelectorAll('[data-node-type]')];
  }

  function quickPaletteEnabledTypes() {
    return quickPaletteButtons()
      .filter(btn => !btn.disabled)
      .map(btn => btn.dataset.nodeType);
  }

  function updateQuickAddFocusUI() {
    const enabled = quickPaletteEnabledTypes();
    if (enabled.length && !enabled.includes(quickAddFocusType)) {
      quickAddFocusType = enabled.includes('action') ? 'action' : enabled[0];
    }
    quickPaletteButtons().forEach(btn => {
      const focused = !btn.disabled && btn.dataset.nodeType === quickAddFocusType;
      btn.classList.toggle('active', focused);
      btn.setAttribute('aria-selected', focused ? 'true' : 'false');
    });
  }

  function moveQuickAddFocus(delta) {
    const enabled = quickPaletteEnabledTypes();
    if (!enabled.length) return;
    let idx = enabled.indexOf(quickAddFocusType);
    if (idx < 0) idx = enabled.indexOf('action');
    if (idx < 0) idx = 0;
    quickAddFocusType = enabled[(idx + delta + enabled.length) % enabled.length];
    updateQuickAddFocusUI();
  }

  function confirmQuickAddFocus() {
    if (!quickAddNodeId) return;
    const type = quickAddFocusType;
    const btn = quickPalette.querySelector(`[data-node-type="${type}"]`);
    if (!btn || btn.disabled || !NODE_TYPES.includes(type)) return;
    const sourceId = quickAddNodeId;
    closeQuickAddPalette();
    quickAddNodeFrom(sourceId, type);
  }

  function toggleQuickAddForSelection() {
    if (selection?.kind !== 'node') return false;
    const node = model.nodes.find(n => n.id === selection.id);
    if (!canQuickAddFrom(node) || quickAddBlocked()) return false;
    if (quickAddNodeId === selection.id) closeQuickAddPalette();
    else openQuickAddPalette(selection.id);
    return true;
  }

  function syncQuickAddPalette() {
    const node = quickAddNodeId ? model.nodes.find(n => n.id === quickAddNodeId) : null;
    const center = node ? nodeAddButtonCenter(node) : null;
    const ctm = svg.getScreenCTM();
    if (!canQuickAddFrom(node) || quickAddBlocked() || !center || !ctm) {
      quickAddNodeId = null;
      quickPalette.classList.add('hidden');
      return;
    }

    // 終了Nodeは出力ポートが無いため、既存の接続先を引き継げない
    const chained = outgoingBottomEdges(node).length > 0;
    quickPaletteButtons().forEach(btn => {
      const blocked = chained && !defaultOutgoingPort(btn.dataset.nodeType);
      btn.disabled = blocked;
      btn.setAttribute('title', blocked
        ? '接続先があるため挿入できません'
        : btn.dataset.baseTitle || '');
    });
    updateQuickAddFocusUI();

    quickPalette.classList.remove('hidden');
    const half = NODE_ADD_BTN_SIZE / 2;
    const toScreen = y => {
      const p = svg.createSVGPoint();
      p.x = center.x;
      p.y = y;
      return p.matrixTransform(ctm);
    };
    const below = toScreen(center.y + half);
    const above = toScreen(center.y - half);
    const w = quickPalette.offsetWidth || 220;
    const h = quickPalette.offsetHeight || 48;
    const gap = 8;
    const wrapRect = canvasWrap.getBoundingClientRect();

    let top = below.y + gap;
    if (top + h > wrapRect.bottom - 8) top = above.y - gap - h;
    top = clamp(top, wrapRect.top + 8, Math.max(wrapRect.top + 8, wrapRect.bottom - h - 8));
    const left = clamp(
      below.x - w / 2,
      Math.max(8, wrapRect.left + 8),
      Math.max(8, window.innerWidth - w - 8)
    );

    quickPalette.style.left = `${Math.round(left)}px`;
    quickPalette.style.top = `${Math.round(top)}px`;
  }

  // +ボタンから、元Nodeの直下に新Nodeを生成してbottom→topで接続する
  function quickAddNodeFrom(sourceId, type) {
    if (!NODE_TYPES.includes(type)) return;
    const source = model.nodes.find(n => n.id === sourceId);
    if (!canQuickAddFrom(source)) return;

    const laneIdx = actorIndex(source.actor_id);
    if (laneIdx < 0) return;

    const sourceSize = nodeSize(source);
    const { w, h } = nodeSize({
      type,
      label: defaultNodeLabel(type),
      actor_id: source.actor_id,
      position: {x: 0, y: 0}
    });
    const localX = clamp(
      snap(Number(source.position?.x || 0) + sourceSize.w / 2 - w / 2),
      10,
      LANE_WIDTH - w - 10
    );
    const y = Math.max(
      LANE_HEADER_H + 20,
      snap(Number(source.position?.y || 0) + sourceSize.h + NODE_VERTICAL_GAP)
    );

    const outPort = defaultOutgoingPort(type);
    const chainedIds = outgoingBottomEdges(source).map(e => e.id);
    if (chainedIds.length && !outPort) {
      showToast('接続先があるため、このNodeは挿入できません。', true);
      return;
    }

    // 既存の接続先、または直下の既存Nodeと重なるときは下方向へ押し下げる
    const newRect = {x: laneLeft(laneIdx) + localX, y, w, h};
    const overlaps = model.nodes.some(n => {
      const r = nodeUnshiftedRect(n);
      return r && rectsOverlap(newRect, r);
    });
    const shiftY = (chainedIds.length || overlaps) ? snap(h + NODE_VERTICAL_GAP) : 0;

    mutate(() => {
      if (shiftY) {
        model.nodes.forEach(n => {
          if (Number(n.position.y) >= y) n.position.y = snap(Number(n.position.y) + shiftY);
        });
      }

      const node = {
        id: makeId('nod'),
        actor_id: source.actor_id,
        type,
        label: defaultNodeLabel(type),
        position: {x: localX, y}
      };
      model.nodes.push(node);

      const chained = chainedIds
        .map(id => model.edges.find(e => e.id === id))
        .filter(Boolean);
      if (chained.length) {
        // 割り込み: 既存エッジ（ラベル含む）は直前→新ノードに残し、
        // 新ノード→旧接続先は新規エッジ（空ラベル）を追加する
        const outgoing = chained.map(e => ({
          target: e.target,
          target_port: e.target_port
        }));
        const primary = chained[0];
        primary.target = node.id;
        primary.target_port = 'top';

        const removeIds = new Set(chained.slice(1).map(e => e.id));
        if (removeIds.size) {
          model.edges = model.edges.filter(e => !removeIds.has(e.id));
        }
        const seenTargets = new Set();
        outgoing.forEach(t => {
          if (seenTargets.has(t.target)) return;
          seenTargets.add(t.target);
          model.edges.push({
            id: makeId('edg'),
            source: node.id,
            source_port: outPort,
            target: t.target,
            target_port: t.target_port,
            label: ''
          });
        });
      } else {
        // 通常追加: ノード + 新規エッジのみ
        model.edges.push({
          id: makeId('edg'),
          source: source.id,
          source_port: 'bottom',
          target: node.id,
          target_port: 'top',
          label: ''
        });
      }

      selection = {kind: 'node', id: node.id};
    });
  }

  // --- Inline editors (lane / node / memo / edge) ---
  const inlineEditors = [];

  function interruptInlineEditors(except) {
    for (const ed of inlineEditors) {
      if (ed === except || !ed.isEditing()) continue;
      ed.finish(ed.finishWhenInterrupted);
    }
  }

  function clearInlineEditorState() {
    for (const ed of inlineEditors) ed.clear();
  }

  function createInlineEditor(spec) {
    const api = {
      finishWhenInterrupted: spec.finishWhenInterrupted !== false,
      isEditing() { return !!spec.getId(); },
      getId() { return spec.getId(); },
      clear() {
        spec.setId(null);
        spec.setBefore(null);
      },
      begin(id) {
        if (spec.canBegin && !spec.canBegin(id)) return;
        const entity = spec.find(id);
        if (!entity) return;
        interruptInlineEditors(api);
        if (spec.getId() && spec.getId() !== id) api.finish(true);
        if (spec.beforeBegin) spec.beforeBegin(id);
        spec.setBefore(clone(model));
        spec.setId(id);
        if (spec.onBegin) spec.onBegin(id, entity);
        renderAll();
        api.focus();
      },
      finish(commit) {
        const id = spec.getId();
        if (!id) return;
        const entity = spec.find(id);
        const input = document.getElementById(spec.inputId);
        const before = spec.getBefore();
        spec.setId(null);
        if (commit && entity && input) {
          const next = spec.readValue(input, entity);
          if (spec.getValue(entity) !== next) {
            spec.setValue(entity, next);
            if (modelChanged(before)) pushHistory(before);
          }
        } else if (!commit && entity && before && spec.restore) {
          spec.restore(entity, before, id);
        }
        spec.setBefore(null);
        if (spec.onFinish) spec.onFinish(commit);
        renderAll();
      },
      focus() {
        const token = ++spec.focusTokenRef.n;
        requestAnimationFrame(() => {
          if (token !== spec.focusTokenRef.n) return;
          const input = document.getElementById(spec.inputId);
          if (!input) return;
          if (spec.onFocus) spec.onFocus(input);
          input.focus();
          input.select();
        });
      },
      sync() { spec.sync(api); }
    };
    inlineEditors.push(api);
    return api;
  }

  const laneFocusTokenRef = { n: 0 };
  const laneEditor = createInlineEditor({
    inputId: 'laneRenameInput',
    finishWhenInterrupted: true,
    focusTokenRef: laneFocusTokenRef,
    getId: () => editingLaneId,
    setId: v => { editingLaneId = v; },
    getBefore: () => laneRenameBefore,
    setBefore: v => { laneRenameBefore = v; },
    find: id => model.actors.find(a => a.id === id),
    getValue: actor => actor.label || '',
    setValue: (actor, next) => { actor.label = next; },
    readValue: input => input.value.trim() || '(名称なし)',
    restore: (actor, before, id) => {
      const prev = before.actors.find(a => a.id === id);
      if (prev) actor.label = prev.label;
    },
    onBegin: id => { selection = { kind: 'actor', id }; },
    sync(api) {
      laneRenameMount.innerHTML = '';
      const id = api.getId();
      if (!id) return;
      const actor = model.actors.find(a => a.id === id);
      const idx = actorIndex(id);
      if (!actor || idx < 0) {
        api.clear();
        return;
      }
      const input = document.createElement('input');
      input.id = 'laneRenameInput';
      input.className = 'lane-rename-input';
      input.type = 'text';
      input.value = actor.label || '';
      input.setAttribute('aria-label', 'レーン名');
      input.style.left = `${(laneLeft(idx) + 10) * zoom}px`;
      input.style.top = '';
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          api.finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          api.finish(false);
        }
      });
      input.addEventListener('blur', () => {
        if (api.getId() === id) api.finish(true);
      });
      laneRenameMount.appendChild(input);
    }
  });

  function beginLaneRename(actorId) { laneEditor.begin(actorId); }
  function finishLaneRename(commit) { laneEditor.finish(commit); }
  function syncLaneRenameInput() { laneEditor.sync(); }

  function drawAddLaneButton(laneCount) {
    const sy = headerZoomY();
    const size = LANE_ADD_SIZE;
    const xContent = laneCount > 0
      ? laneLeft(laneCount - 1) + LANE_WIDTH + LANE_ADD_GAP
      : Math.max(0, lastCanvasWidth / 2 - size / 2);
    const x = pxSnapHeader(xContent * zoom, STROKE_LANE);
    const y = pxSnapHeader((LANE_HEADER_H * sy - size * sy) / 2, STROKE_LANE);
    const g = svgEl('g', {class: 'lane-add-btn', transform: `translate(${x},${y}) scale(${sy})`});
    g.appendChild(svgEl('rect', {x: 0, y: 0, width: size, height: size, rx: 6, ry: 6}));
    const t = svgEl('text', {x: size / 2, y: size / 2 + 0.5});
    t.textContent = '+';
    g.appendChild(t);
    g.addEventListener('click', e => {
      e.stopPropagation();
      addActor();
    });
    laneHeaderLayer.appendChild(g);
  }

  function laneBoundaryXs(count) {
    if (count <= 0) return [];
    const xs = [];
    for (let i = 0; i < count; i++) xs.push(laneLeft(i));
    xs.push(laneLeft(count - 1) + LANE_WIDTH);
    return xs;
  }

  // 隣接レーンで枠が二重にならないよう、塗りと共有グリッド線を分離
  function drawLaneGridLines(actors, height) {
    if (!actors.length) return;
    const n = actors.length;
    const bounds = laneBoundaryXs(n);
    const sy = headerZoomY();
    const headerHCss = LANE_HEADER_H * sy;
    const phase = strokePhase(STROKE_LANE);

    const headerGrid = svgEl('g', { class: 'lane-grid', 'pointer-events': 'none' });
    const xsH = bounds.map(x => pxSnapHeader(x * zoom, STROKE_LANE));
    const yTop = phase;
    const yBot = Math.max(phase, headerHCss - phase);
    xsH.forEach(x => {
      headerGrid.appendChild(svgEl('line', {
        x1: x, y1: yTop, x2: x, y2: yBot, class: 'lane-grid-line'
      }));
    });
    headerGrid.appendChild(svgEl('line', {
      x1: xsH[0], y1: yTop, x2: xsH[n], y2: yTop, class: 'lane-grid-line'
    }));
    headerGrid.appendChild(svgEl('line', {
      x1: xsH[0], y1: yBot, x2: xsH[n], y2: yBot, class: 'lane-grid-line'
    }));
    laneHeaderLayer.appendChild(headerGrid);

    const bodyGrid = svgEl('g', { class: 'lane-grid', 'pointer-events': 'none' });
    const xsB = bounds.map(x => pxSnapX(x, STROKE_LANE));
    const top = pxSnapY(LANE_HEADER_H, STROKE_LANE);
    const bot = pxSnapY(height, STROKE_LANE);
    xsB.forEach(x => {
      bodyGrid.appendChild(svgEl('line', {
        x1: x, y1: top, x2: x, y2: bot, class: 'lane-grid-line'
      }));
    });
    // 上辺はヘッダー下辺と共有（二重線を避ける）
    bodyGrid.appendChild(svgEl('line', {
      x1: xsB[0], y1: bot, x2: xsB[n], y2: bot, class: 'lane-grid-line'
    }));
    laneLayer.appendChild(bodyGrid);
  }

  // 改ページ位置と継続マーカー用の確保帯（エディタのみ）
  function drawPageBreakGuides(actors, height) {
    if (printMode || !actors.length) return;
    const per = printBodyUserPerPage();
    if (!Number.isFinite(per) || per <= 0) return;
    const x0 = laneLeft(0);
    const x1 = laneLeft(actors.length);
    if (!(x1 > x0)) return;
    const g = svgEl('g', { class: 'page-break-guides', 'pointer-events': 'none' });
    for (let p = 1; p < 400; p++) {
      const b = pageBreakBoundaryY(p);
      if (b - LAYOUT_PAGE_BREAK_BAND_ABOVE > height) break;
      g.appendChild(svgEl('rect', {
        x: x0,
        y: b - LAYOUT_PAGE_BREAK_BAND_ABOVE,
        width: x1 - x0,
        height: LAYOUT_PAGE_BREAK_BAND_ABOVE + LAYOUT_PAGE_BREAK_BAND_BELOW,
        class: 'page-break-band'
      }));
      g.appendChild(svgEl('line', {
        x1: x0, y1: b, x2: x1, y2: b, class: 'page-break-line'
      }));
      const t = svgEl('text', { x: x0 + 8, y: b - 8, class: 'page-break-label' });
      t.textContent = `改ページ  P.${p} → P.${p + 1}`;
      g.appendChild(t);
    }
    if (g.childNodes.length) laneLayer.appendChild(g);
  }

  function drawLane(actor, index, height, pass = 'all') {
    const drawFill = pass === 'all' || pass === 'fill';
    const drawChrome = pass === 'all' || pass === 'chrome';
    const x = laneLeft(index);
    const sy = headerZoomY();
    const headerX = pxSnapHeader(x * zoom, STROKE_LANE);
    const headerW = pxSnapHeader((x + LANE_WIDTH) * zoom, STROKE_LANE) - headerX;
    const headerH = pxSnapHeader(LANE_HEADER_H * sy);
    const selected = isLaneSelected(actor.id);
    const selectedClass = selected ? ' selected' : '';

    if (drawFill) {
      const headerG = svgEl('g', {
        'data-actor-id': actor.id,
        class: `lane-header${selectedClass}${laneDrag?.actorId === actor.id && laneDrag.moved ? ' dragging' : ''}`
      });
      const headerBg = svgEl('rect', {
        x: headerX, y: 0, width: headerW, height: headerH,
        class: `lane-header-bg${selectedClass}`
      });
      headerBg.addEventListener('pointerdown', e => {
        if (e.target.closest('.lane-control')) return;
        startLaneDrag(e, actor.id);
      });
      headerBg.addEventListener('click', e => {
        e.stopPropagation();
        if (!isSelectTool() || laneDrag?.moved) return;
        selectLane(actor.id);
      });
      headerG.appendChild(headerBg);
      laneHeaderLayer.appendChild(headerG);

      const bodyG = svgEl('g', {'data-actor-id': actor.id});
      const bodyX = pxSnapX(x, STROKE_LANE);
      const bodyY = pxSnapY(LANE_HEADER_H, STROKE_LANE);
      const bodyW = pxSnapX(x + LANE_WIDTH, STROKE_LANE) - bodyX;
      const bodyH = pxSnapY(height, STROKE_LANE) - bodyY;
      const bodyBg = svgEl('rect', {
        x: bodyX, y: bodyY, width: bodyW, height: bodyH,
        class: `lane-bg${selectedClass}`
      });
      bodyBg.addEventListener('click', e => {
        e.stopPropagation();
        if (!isSelectTool()) return;
        selectLane(actor.id);
      });
      bodyG.appendChild(bodyBg);
      const midX = pxSnapX(x + LANE_WIDTH / 2, STROKE_LANE);
      bodyG.appendChild(svgEl('line', {
        x1: midX, y1: bodyY,
        x2: midX, y2: bodyY + bodyH,
        class: 'lane-center-guide'
      }));
      laneLayer.appendChild(bodyG);
    }

    if (drawChrome) {
      const headerG = svgEl('g', {
        'data-actor-id': actor.id,
        class: `lane-header-chrome${selectedClass}`
      });
      // 文字・ボタンは等倍スケール（拡大時も縦横比を維持）
      if (editingLaneId !== actor.id) {
        const labelG = svgEl('g', {transform: `translate(${headerX},0) scale(${sy})`});
        const label = svgEl('text', {x: 14, y: 34, class: 'lane-label'});
        label.textContent = actor.label || '(名称なし)';
        label.addEventListener('pointerdown', e => {
          startLaneDrag(e, actor.id);
        });
        label.addEventListener('click', e => {
          e.stopPropagation();
          if (!isSelectTool() || laneDrag?.moved) return;
          selectLane(actor.id);
        });
        label.addEventListener('dblclick', e => {
          e.stopPropagation();
          if (!isSelectTool()) return;
          beginLaneRename(actor.id);
        });
        labelG.appendChild(label);
        headerG.appendChild(labelG);
      }

      const controlsG = svgEl('g', {
        transform: `translate(${headerX + headerW - LANE_WIDTH * sy},0) scale(${sy})`
      });
      // 上辺・右辺からの余白が等しくなるよう配置
      const delCx = LANE_WIDTH - LANE_DEL_MARGIN - LANE_DEL_BTN / 2;
      const delCy = LANE_DEL_MARGIN + LANE_DEL_BTN / 2;
      const half = LANE_DEL_BTN / 2;
      const cg = svgEl('g', {
        class: 'lane-control',
        transform: `translate(${delCx},${delCy})`
      });
      const r = svgEl('rect', {
        x: -half, y: -half, width: LANE_DEL_BTN, height: LANE_DEL_BTN, rx: 4, ry: 4
      });
      const t = svgEl('text', { x: 0, y: 0 });
      t.textContent = '×';
      t.setAttribute('fill', '#b42318');
      cg.append(r, t);
      cg.addEventListener('click', e => {
        e.stopPropagation();
        if (!isSelectTool()) return;
        deleteActor(actor.id);
      });
      controlsG.appendChild(cg);
      headerG.appendChild(controlsG);
      laneHeaderLayer.appendChild(headerG);
    }
  }

  function nodeLabelText(node) {
    return node.label || NODE_TYPE_LABELS[node.type] || '';
  }

  function nodeWrapChars(type) {
    // 旧仕様の折り返し文字数に合わせる
    return type === 'decision' ? 12 : 16;
  }

  function nodeLabelLines(node) {
    return wrapText(nodeLabelText(node), nodeWrapChars(node.type));
  }

  function nodeSize(node) {
    const lines = nodeLabelLines(node);
    const lineCount = Math.max(1, Math.min(lines.length, NODE_MAX_LABEL_LINES));
    const contentH = NODE_LABEL_PAD_Y * 2 + lineCount * NODE_LINE_HEIGHT;
    if (node.type === 'decision') {
      return { w: DECISION_W, h: Math.max(DECISION_H, contentH), lines };
    }
    return { w: NODE_W, h: Math.max(NODE_H, contentH), lines };
  }

  function placePreviewShiftY(node) {
    if (ignorePlaceShift || !placeGesture?.interrupt) return 0;
    const insertY = placeGesture.interrupt.insertY;
    if (!Number.isFinite(insertY)) return 0;
    if (Number(node.position?.y || 0) >= insertY) {
      return Number(placeGesture.interrupt.shiftY) || 0;
    }
    return 0;
  }

  function nodeGlobalRect(node) {
    const idx = actorIndex(node.actor_id);
    if (idx < 0) return null;
    const localX = Number(node.position?.x || 0);
    const x = laneLeft(idx) + localX;
    const y = Number(node.position?.y || LANE_HEADER_H + 30) + placePreviewShiftY(node);
    const { w, h } = nodeSize(node);
    return { x, y, w, h };
  }

  function drawNode(node) {
    const rect = nodeGlobalRect(node);
    if (!rect) return;
    const { lines } = nodeSize(node);
    const nodeStrokeCss = strokeCssFromUser(STROKE_NODE);
    const x = pxSnapX(rect.x, nodeStrokeCss);
    const y = pxSnapY(rect.y, nodeStrokeCss);
    const w = pxSnapSize(rect.w);
    const h = pxSnapSize(rect.h);
    const selected = !printMode && selection?.kind === 'node' && selection.id === node.id;
    const g = svgEl('g', {class:`node${selected ? ' selected' : ''}${!printMode && editingNodeId === node.id ? ' editing' : ''}`, transform:`translate(${x},${y})`, 'data-node-id':node.id});

    const shape = nodeShape(node.type, w, h);
    shape.classList.add('node-shape');
    g.appendChild(shape);

    if (printMode || editingNodeId !== node.id) {
      const startY = h / 2 + (NODE_FONT_SIZE * 0.35) - ((lines.length - 1) * (NODE_LINE_HEIGHT / 2));
      lines.slice(0, NODE_MAX_LABEL_LINES).forEach((line, i) => {
        const t = svgEl('text', {x: w / 2, y: startY + i * NODE_LINE_HEIGHT, class: 'node-text'});
        t.textContent = line;
        g.appendChild(t);
      });
    }

    if (printMode) {
      nodeLayer.appendChild(g);
      return;
    }

    const ports = visiblePortsFor(node);
    for (const name of ports) {
      const role = portRole(node, name);
      let cx = 0, cy = 0;
      if (name === 'top') { cx = w / 2; cy = 0; }
      else if (name === 'right') { cx = w; cy = h / 2; }
      else if (name === 'bottom') { cx = w / 2; cy = h; }
      else { cx = 0; cy = h / 2; }
      // ポートはノードローカル座標。グループ原点がスナップ済みなので相対位置だけ揃える
      cx = pxSnapSize(cx);
      cy = pxSnapSize(cy);
      const c = svgEl('circle', {
        cx, cy, r: PORT_R,
        class: 'port',
        'data-port': name,
        'data-role': role || ''
      });
      const xmark = svgEl('text', {
        x: cx, y: cy + 0.5,
        class: 'port-invalid-x',
        'data-port': name
      });
      xmark.textContent = '×';
      c.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        beginNewEdgeGesture(e, node.id, name);
      });
      g.append(c, xmark);
    }

    g.addEventListener('pointerdown', e => {
      if (!isSelectTool()) return;
      if (placeGesture) return;
      if (e.target.classList.contains('port') || e.target.classList.contains('port-invalid-x') || editingNodeId === node.id) return;
      if (edgeGesture) return;
      e.stopPropagation();
      startNodeDrag(e, node.id);
    });
    g.addEventListener('click', e => {
      if (!isSelectTool()) return;
      if (placeGesture) return;
      if (drag?.moved || editingNodeId === node.id) return;
      if (e.target.classList.contains('port')) return;
      e.stopPropagation();

      // 再描画で DOM が差し替わるため、ネイティブ dblclick に頼らず判定する
      const now = performance.now();
      if (nodeClickStamp.id === node.id && now - nodeClickStamp.at < 400) {
        nodeClickStamp = { id: null, at: 0 };
        beginNodeRename(node.id);
        return;
      }
      nodeClickStamp = { id: node.id, at: now };
      selection = {kind:'node', id:node.id};
      renderAll();
    });
    g.addEventListener('dblclick', e => {
      if (!isSelectTool()) return;
      if (e.target.classList.contains('port')) return;
      e.stopPropagation();
      e.preventDefault();
      nodeClickStamp = { id: null, at: 0 };
      beginNodeRename(node.id);
    });

    nodeLayer.appendChild(g);
  }

  function resizeNodeRenameTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(20, textarea.scrollHeight)}px`;
  }

  function positionNodeRenameTextarea(input, rect) {
    const ctm = svg.getScreenCTM();
    if (!ctm || !rect) return;
    const center = svg.createSVGPoint();
    center.x = rect.x + rect.w / 2;
    center.y = rect.y + rect.h / 2;
    const screen = center.matrixTransform(ctm);
    const contentRect = canvasContent.getBoundingClientRect();
    const screenW = Math.max(72, (rect.w - NODE_LABEL_PAD_X * 2) * zoom);
    input.style.left = `${screen.x - contentRect.left}px`;
    input.style.top = `${screen.y - contentRect.top}px`;
    input.style.width = `${screenW}px`;
    input.style.fontSize = `${NODE_FONT_SIZE * zoom}px`;
    input.style.lineHeight = `${NODE_LINE_HEIGHT * zoom}px`;
    input.style.padding = `${NODE_LABEL_PAD_Y * zoom}px ${NODE_LABEL_PAD_X * zoom}px`;
    resizeNodeRenameTextarea(input);
  }

  const nodeFocusTokenRef = { n: 0 };
  const nodeEditor = createInlineEditor({
    inputId: 'nodeRenameInput',
    finishWhenInterrupted: true,
    focusTokenRef: nodeFocusTokenRef,
    getId: () => editingNodeId,
    setId: v => { editingNodeId = v; },
    getBefore: () => nodeRenameBefore,
    setBefore: v => { nodeRenameBefore = v; },
    find: id => model.nodes.find(n => n.id === id),
    getValue: node => node.label || '',
    setValue: (node, next) => { node.label = next; },
    readValue: (input, node) => input.value.trim() || NODE_TYPE_LABELS[node.type] || '',
    restore: (node, before, id) => {
      const prev = before.nodes.find(n => n.id === id);
      if (prev) node.label = prev.label;
    },
    onBegin: id => { selection = { kind: 'node', id }; },
    onFocus: input => resizeNodeRenameTextarea(input),
    sync(api) {
      const id = api.getId();
      if (!id) {
        nodeRenameMount.innerHTML = '';
        return;
      }
      const node = model.nodes.find(n => n.id === id);
      const rect = node ? nodeGlobalRect(node) : null;
      const ctm = svg.getScreenCTM();
      if (!node || !rect || !ctm) {
        api.clear();
        nodeRenameMount.innerHTML = '';
        return;
      }
      let input = document.getElementById('nodeRenameInput');
      if (
        input &&
        input.tagName === 'TEXTAREA' &&
        nodeRenameMount.contains(input) &&
        input.dataset.nodeId === id
      ) {
        positionNodeRenameTextarea(input, rect);
        return;
      }
      nodeRenameMount.innerHTML = '';
      input = document.createElement('textarea');
      input.id = 'nodeRenameInput';
      input.className = 'node-rename-input node-label-input';
      input.dataset.nodeId = id;
      input.value = nodeLabelText(node);
      input.setAttribute('aria-label', 'Node名');
      input.rows = 1;
      input.spellcheck = false;
      positionNodeRenameTextarea(input, rect);
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('input', () => {
        const current = nodeGlobalRect(node);
        if (current) positionNodeRenameTextarea(input, current);
        else resizeNodeRenameTextarea(input);
      });
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          api.finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          api.finish(false);
        }
      });
      input.addEventListener('blur', () => {
        if (api.getId() === id) api.finish(true);
      });
      nodeRenameMount.appendChild(input);
    }
  });

  function beginNodeRename(nodeId) { nodeEditor.begin(nodeId); }
  function finishNodeRename(commit) { nodeEditor.finish(commit); }
  function syncNodeRenameInput() { nodeEditor.sync(); }

  function memoText(memo) {
    return typeof memo?.text === 'string' ? memo.text : '';
  }

  function memoLabelLines(memo) {
    return wrapText(memoText(memo), MEMO_WRAP_CHARS);
  }

  function memoSize(memo) {
    const lines = memoLabelLines(memo);
    const lineCount = Math.max(1, Math.min(lines.length, MEMO_MAX_LINES));
    const contentH = MEMO_PAD_Y * 2 + lineCount * MEMO_LINE_HEIGHT;
    return { w: MEMO_W, h: Math.max(MEMO_MIN_H, contentH), lines };
  }

  function memoRect(memo) {
    if (!memo) return null;
    const { w, h } = memoSize(memo);
    return {
      x: Number(memo.position?.x || 0),
      y: Number(memo.position?.y || LANE_HEADER_H + 20),
      w,
      h
    };
  }

  // レーン非所属のキャンバス絶対座標。レーンヘッダー帯以外ならどこでも配置可
  function clampMemoPosition(x, y, w, h, canvasW, canvasH) {
    const height = Number.isFinite(canvasH) ? canvasH : canvasSize().height;
    const width = Number.isFinite(canvasW) ? canvasW : canvasSize().width;
    const minY = LANE_HEADER_H + MEMO_CANVAS_PAD;
    const maxY = Math.max(minY, height - h - MEMO_CANVAS_PAD);
    const maxX = Math.max(MEMO_CANVAS_PAD, width - w - MEMO_CANVAS_PAD);
    return {
      x: clamp(snap(x), MEMO_CANVAS_PAD, maxX),
      y: clamp(snap(y), minY, maxY)
    };
  }

  function laneStripBoundsForCount(count, canvasWidth) {
    if (count <= 0) return null;
    const width = Number.isFinite(canvasWidth) ? canvasWidth : lastCanvasWidth;
    const left = Math.max(0, (width - count * LANE_WIDTH) / 2);
    return { left, right: left + count * LANE_WIDTH };
  }

  function estimateCanvasWidthForCount(count) {
    const lanesWidth = Math.max(count, 1) * LANE_WIDTH + LANE_GUTTER_RIGHT;
    let memoRight = 0;
    for (const memo of ensureMemos()) {
      const r = memoRect(memo);
      if (r) memoRight = Math.max(memoRight, r.x + r.w + 40);
    }
    let width = Math.max(canvasWrap.clientWidth / zoom, lanesWidth, 680, memoRight);
    if (count > 0) {
      for (let i = 0; i < 3; i++) {
        const left = Math.max(0, (width - count * LANE_WIDTH) / 2);
        let next = width;
        for (const memo of ensureMemos()) {
          const r = memoRect(memo);
          if (!r || r.x + r.w > left + 0.5) continue;
          next = Math.max(next, (r.x + r.w + MEMO_CANVAS_PAD) * 2 + count * LANE_WIDTH);
        }
        if (Math.abs(next - width) < 0.5) break;
        width = next;
      }
    }
    return width;
  }

  // レーン帯の外側にあるメモを、帯端からの距離を保ったまま追従させる
  function adjustOutsideMemosForLaneCountChange(prevCount, nextCount) {
    if (prevCount <= 0 || nextCount <= 0 || prevCount === nextCount) return;
    const prevBounds = laneStripBoundsForCount(prevCount, lastCanvasWidth);
    if (!prevBounds) return;

    const tracked = [];
    for (const memo of ensureMemos()) {
      const r = memoRect(memo);
      if (!r) continue;
      if (r.x + r.w <= prevBounds.left + 0.5) {
        tracked.push({
          memo,
          side: 'left',
          gap: Math.max(0, prevBounds.left - (r.x + r.w)),
          w: r.w,
          y: r.y
        });
      } else if (r.x >= prevBounds.right - 0.5) {
        tracked.push({
          memo,
          side: 'right',
          gap: Math.max(0, r.x - prevBounds.right),
          w: r.w,
          y: r.y
        });
      }
    }
    if (!tracked.length) return;

    let width = estimateCanvasWidthForCount(nextCount);
    for (let iter = 0; iter < 5; iter++) {
      // 左側メモが canvas 左端より内側に収まるよう幅を確保
      for (const item of tracked) {
        if (item.side !== 'left') continue;
        const needOrigin = MEMO_CANVAS_PAD + item.gap + item.w;
        width = Math.max(width, needOrigin * 2 + nextCount * LANE_WIDTH);
      }

      const bounds = laneStripBoundsForCount(nextCount, width);
      if (!bounds) return;
      for (const item of tracked) {
        if (item.side === 'left') {
          item.memo.position.x = snap(bounds.left - item.gap - item.w);
        } else {
          item.memo.position.x = snap(bounds.right + item.gap);
        }
        item.memo.position.y = Math.max(LANE_HEADER_H + MEMO_CANVAS_PAD, snap(item.y));
      }

      const nextWidth = estimateCanvasWidthForCount(nextCount);
      if (Math.abs(nextWidth - width) < 0.5) break;
      width = nextWidth;
    }
  }

  function resolveMemoPlaceAt(svgPoint, memo = null) {
    const { w, h } = memo ? memoSize(memo) : { w: MEMO_W, h: MEMO_MIN_H };
    const { width, height } = canvasSize();
    const rawX = svgPoint.x - w / 2;
    const rawY = svgPoint.y - h / 2;
    const pos = clampMemoPosition(rawX, rawY, w, h, width, height);
    return { x: pos.x, y: pos.y, w, h };
  }

  function appendMemoVisual(g, w, h, lines, { showText = true } = {}) {
    g.appendChild(svgEl('rect', {
      x: 0, y: 0, width: w, height: h, rx: 2, ry: 2, class: 'memo-shape'
    }));
    const fold = MEMO_FOLD;
    g.appendChild(svgEl('polygon', {
      points: `${w - fold},${h} ${w},${h - fold} ${w},${h}`,
      class: 'memo-fold'
    }));
    if (!showText) return;
    lines.slice(0, MEMO_MAX_LINES).forEach((line, i) => {
      const t = svgEl('text', {
        x: MEMO_PAD_X,
        y: MEMO_PAD_Y + i * MEMO_LINE_HEIGHT,
        class: 'memo-text'
      });
      t.textContent = line;
      g.appendChild(t);
    });
  }

  function drawMemo(memo) {
    const rect = memoRect(memo);
    if (!rect) return;
    const { lines } = memoSize(memo);
    const strokeCss = strokeCssFromUser(1.2);
    const x = pxSnapX(rect.x, strokeCss);
    const y = pxSnapY(rect.y, strokeCss);
    const w = pxSnapSize(rect.w);
    const h = pxSnapSize(rect.h);
    const selected = !printMode && selection?.kind === 'memo' && selection.id === memo.id;
    const g = svgEl('g', {
      class: `memo${selected ? ' selected' : ''}${!printMode && editingMemoId === memo.id ? ' editing' : ''}`,
      transform: `translate(${x},${y})`,
      'data-memo-id': memo.id
    });
    appendMemoVisual(g, w, h, lines, {
      showText: printMode || editingMemoId !== memo.id
    });

    if (printMode) {
      memoLayer.appendChild(g);
      return;
    }

    g.addEventListener('pointerdown', e => {
      if (!isSelectTool() || !memosVisible) return;
      if (placeGesture || placeMemoGesture) return;
      if (editingMemoId === memo.id) return;
      if (edgeGesture) return;
      e.stopPropagation();
      startMemoDrag(e, memo.id);
    });
    g.addEventListener('click', e => {
      if (!isSelectTool() || !memosVisible) return;
      if (placeGesture || placeMemoGesture) return;
      if (drag?.moved || editingMemoId === memo.id) return;
      e.stopPropagation();
      const now = performance.now();
      if (memoClickStamp.id === memo.id && now - memoClickStamp.at < 400) {
        memoClickStamp = { id: null, at: 0 };
        beginMemoEdit(memo.id);
        return;
      }
      memoClickStamp = { id: memo.id, at: now };
      selection = { kind: 'memo', id: memo.id };
      renderAll();
    });
    g.addEventListener('dblclick', e => {
      if (!isSelectTool() || !memosVisible) return;
      e.stopPropagation();
      e.preventDefault();
      memoClickStamp = { id: null, at: 0 };
      beginMemoEdit(memo.id);
    });
    memoLayer.appendChild(g);
  }

  function resizeMemoRenameTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
  }

  function positionMemoRenameTextarea(input, rect) {
    const ctm = svg.getScreenCTM();
    if (!ctm || !rect) return;
    const topLeft = svg.createSVGPoint();
    topLeft.x = rect.x;
    topLeft.y = rect.y;
    const screen = topLeft.matrixTransform(ctm);
    const contentRect = canvasContent.getBoundingClientRect();
    input.style.left = `${screen.x - contentRect.left + MEMO_PAD_X * zoom}px`;
    input.style.top = `${screen.y - contentRect.top + MEMO_PAD_Y * zoom}px`;
    input.style.width = `${Math.max(40, (rect.w - MEMO_PAD_X * 2) * zoom)}px`;
    input.style.fontSize = `${MEMO_FONT_SIZE * zoom}px`;
    input.style.lineHeight = `${MEMO_LINE_HEIGHT * zoom}px`;
    input.style.padding = '0';
    resizeMemoRenameTextarea(input);
  }

  const memoFocusTokenRef = { n: 0 };
  const memoEditor = createInlineEditor({
    inputId: 'memoRenameInput',
    finishWhenInterrupted: true,
    focusTokenRef: memoFocusTokenRef,
    getId: () => editingMemoId,
    setId: v => { editingMemoId = v; },
    getBefore: () => memoRenameBefore,
    setBefore: v => { memoRenameBefore = v; },
    canBegin: () => memosVisible,
    find: id => ensureMemos().find(m => m.id === id),
    getValue: memo => memoText(memo),
    setValue: (memo, next) => { memo.text = next; },
    readValue: input => input.value,
    restore: (memo, before, id) => {
      const prev = before.memos?.find(m => m.id === id);
      if (prev) memo.text = prev.text;
    },
    onBegin: id => { selection = { kind: 'memo', id }; },
    onFocus: input => resizeMemoRenameTextarea(input),
    sync(api) {
      const id = api.getId();
      if (!id || !memosVisible) {
        memoRenameMount.innerHTML = '';
        return;
      }
      const memo = ensureMemos().find(m => m.id === id);
      const rect = memo ? memoRect(memo) : null;
      const ctm = svg.getScreenCTM();
      if (!memo || !rect || !ctm) {
        api.clear();
        memoRenameMount.innerHTML = '';
        return;
      }
      let input = document.getElementById('memoRenameInput');
      if (
        input &&
        input.tagName === 'TEXTAREA' &&
        memoRenameMount.contains(input) &&
        input.dataset.memoId === id
      ) {
        positionMemoRenameTextarea(input, rect);
        return;
      }
      memoRenameMount.innerHTML = '';
      input = document.createElement('textarea');
      input.id = 'memoRenameInput';
      input.className = 'memo-rename-input';
      input.dataset.memoId = id;
      input.value = memoText(memo);
      input.setAttribute('aria-label', 'メモ');
      input.rows = 3;
      input.spellcheck = false;
      positionMemoRenameTextarea(input, rect);
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('input', () => {
        const current = memoRect(memo);
        if (current) positionMemoRenameTextarea(input, current);
        else resizeMemoRenameTextarea(input);
      });
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          api.finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          api.finish(false);
        }
      });
      input.addEventListener('blur', () => {
        if (api.getId() === id) api.finish(true);
      });
      memoRenameMount.appendChild(input);
    }
  });

  function beginMemoEdit(memoId) { memoEditor.begin(memoId); }
  function finishMemoEdit(commit) { memoEditor.finish(commit); }
  function syncMemoRenameInput() { memoEditor.sync(); }

  function startMemoDrag(e, memoId) {
    if (e.button !== 0 || !isSelectTool() || !memosVisible || zoomDrag || editingMemoId || editingNodeId || editingEdgeId || edgeGesture || placeGesture || placeMemoGesture || laneDrag) return;
    const memo = ensureMemos().find(m => m.id === memoId);
    if (!memo) return;
    selection = { kind: 'memo', id: memoId };
    const p = eventToSvg(e);
    const global = memoRect(memo);
    drag = {
      kind: 'memo',
      memoId,
      pointerId: e.pointerId,
      start: p,
      startX: global.x,
      startY: global.y,
      memoW: global.w,
      memoH: global.h,
      before: clone(model),
      moved: false,
      target: e.currentTarget
    };
    renderToolbar();
  }

  function beginPlaceMemo() {
    if (editingLaneId) finishLaneRename(true);
    if (editingNodeId) finishNodeRename(true);
    if (editingEdgeId) finishEdgeLabelEdit(false);
    if (editingMemoId) finishMemoEdit(true);
    if (edgeGesture) cancelEdgeGesture();
    if (placeGesture) cancelPlaceGesture();
    if (drag) drag = null;
    if (activeTool !== 'select') setActiveTool('select');
    if (!memosVisible) {
      memosVisible = true;
      if (memoVisibleToggle) memoVisibleToggle.checked = true;
    }
    placeMemoGesture = { armed: false, placement: null };
    requestAnimationFrame(() => {
      if (placeMemoGesture) placeMemoGesture.armed = true;
    });
    updatePlaceUI();
    renderPlaceGhost();
  }

  function cancelPlaceMemoGesture() {
    if (!placeMemoGesture) return;
    placeMemoGesture = null;
    placeLayer.innerHTML = '';
    updatePlaceUI();
  }

  function updatePlaceMemoFromEvent(e) {
    if (!placeMemoGesture) return;
    placeMemoGesture.placement = resolveMemoPlaceAt(eventToSvg(e));
    renderPlaceGhost();
  }

  function commitPlaceMemo() {
    if (!placeMemoGesture?.armed || !placeMemoGesture.placement) return false;
    const { x, y } = placeMemoGesture.placement;
    placeMemoGesture = null;
    placeLayer.innerHTML = '';
    updatePlaceUI();
    let newId = null;
    mutate(() => {
      ensureMemos();
      const memo = {
        id: makeId('mem'),
        text: '',
        position: { x, y }
      };
      model.memos.push(memo);
      selection = { kind: 'memo', id: memo.id };
      newId = memo.id;
    });
    if (newId) beginMemoEdit(newId);
    return true;
  }

  function deleteMemo(id) {
    const memo = ensureMemos().find(m => m.id === id);
    if (!memo) return;
    if (editingMemoId === id) {
      editingMemoId = null;
      memoRenameBefore = null;
    }
    mutate(() => {
      model.memos = ensureMemos().filter(m => m.id !== id);
      if (selection?.kind === 'memo' && selection.id === id) selection = null;
    });
  }

  function setMemosVisible(visible) {
    memosVisible = !!visible;
    if (!memosVisible) {
      if (editingMemoId) finishMemoEdit(true);
      if (placeMemoGesture) cancelPlaceMemoGesture();
      if (selection?.kind === 'memo') selection = null;
      if (drag?.kind === 'memo') drag = null;
    }
    if (memoVisibleToggle) memoVisibleToggle.checked = memosVisible;
    renderAll();
  }

  function nodeShape(type, w, h) {
    if (type === 'decision') return svgEl('polygon', {points:`${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`});
    if (type === 'event') return svgEl('rect', {x:0,y:0,width:w,height:h,rx:24,ry:24});
    if (type === 'end') return svgEl('rect', {x:0,y:0,width:w,height:h,rx:h/2,ry:h/2});
    // action: border-radius 8px
    return svgEl('rect', {x:0,y:0,width:w,height:h,rx:8,ry:8});
  }

  function wrapText(text, maxChars) {
    const max = maxChars || 14;
    if (!text) return [''];
    const lines = [];
    for (const paragraph of String(text).split(/\r?\n/)) {
      if (!paragraph) {
        lines.push('');
        continue;
      }
      const chars = [...paragraph];
      for (let i = 0; i < chars.length; i += max) {
        lines.push(chars.slice(i, i + max).join(''));
      }
    }
    return lines.length ? lines : [''];
  }

  function visiblePortsFor(node) {
    if (!node) return [];
    if (node.type === 'action' || node.type === 'event') return ['top', 'bottom'];
    if (node.type === 'decision') return ['top', 'right', 'bottom', 'left'];
    if (node.type === 'end') return ['top'];
    return [];
  }

  function sourcePortsFor(node) {
    if (!node) return [];
    if (node.type === 'action' || node.type === 'event') return ['bottom'];
    if (node.type === 'decision') return ['left', 'right', 'bottom'];
    return [];
  }

  function targetPortsFor(node) {
    if (!node) return [];
    return visiblePortsFor(node).filter(p => p === 'top');
  }

  function portRole(node, side) {
    if (sourcePortsFor(node).includes(side)) return 'source';
    if (targetPortsFor(node).includes(side)) return 'target';
    return null;
  }

  function resolvePort(node, side, role) {
    const allowed = role === 'source' ? sourcePortsFor(node) : targetPortsFor(node);
    return allowed.includes(side) ? side : null;
  }

  function connectionFromPorts(aNodeId, aSide, bNodeId, bSide) {
    if (!aNodeId || !bNodeId || aNodeId === bNodeId) return { valid: false, reason: 'same-node' };
    const aNode = model.nodes.find(n => n.id === aNodeId);
    const bNode = model.nodes.find(n => n.id === bNodeId);
    const aRole = portRole(aNode, aSide);
    const bRole = portRole(bNode, bSide);
    if (aRole === 'source' && bRole === 'target') {
      return { valid: true, source: aNodeId, source_port: aSide, target: bNodeId, target_port: bSide };
    }
    if (aRole === 'target' && bRole === 'source') {
      return { valid: true, source: bNodeId, source_port: bSide, target: aNodeId, target_port: aSide };
    }
    return { valid: false, reason: 'role-mismatch' };
  }

  function rewirePortIsValid(edge, end, hit) {
    if (!edge || !hit) return false;
    const oppositeNode = end === 'source' ? edge.target : edge.source;
    if (hit.nodeId === oppositeNode) return false;
    const node = model.nodes.find(n => n.id === hit.nodeId);
    return portRole(node, hit.side) === end;
  }

  function normalizeEdgePorts(edge) {
    const sNode = model.nodes.find(n => n.id === edge.source);
    const tNode = model.nodes.find(n => n.id === edge.target);
    if (!sNode || !tNode || edge.source === edge.target) return null;
    const sp = resolvePort(sNode, edge.source_port, 'source');
    const tp = resolvePort(tNode, edge.target_port, 'target');
    if (!sp || !tp) return null;
    return { source_port: sp, target_port: tp };
  }

  function portPoint(node, port) {
    const r = nodeGlobalRect(node);
    if (!r) return null;
    switch (port) {
      case 'top': return {x:r.x+r.w/2, y:r.y};
      case 'right': return {x:r.x+r.w, y:r.y+r.h/2};
      case 'bottom': return {x:r.x+r.w/2, y:r.y+r.h};
      case 'left': return {x:r.x, y:r.y+r.h/2};
    }
  }

  function portVector(port) {
    return {top:{x:0,y:-1}, right:{x:1,y:0}, bottom:{x:0,y:1}, left:{x:-1,y:0}}[port];
  }

  function routingSettings() {
    return {
      preferredCornerDistance: PREFERRED_CORNER_DISTANCE,
      nodeClearance: NODE_CLEARANCE,
      cornerRadius: CORNER_RADIUS
    };
  }

  function sideAxis(side) {
    return (side === 'left' || side === 'right') ? 'h' : 'v';
  }

  function pointDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += pointDistance(points[i - 1], points[i]);
    return total;
  }

  function pointToward(from, to, d) {
    const len = pointDistance(from, to);
    if (!len) return { ...from };
    const k = Math.min(1, d / len);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  }

  function cleanPolyline(points) {
    const dedup = [];
    for (const p of points) {
      if (!dedup.length || pointDistance(dedup[dedup.length - 1], p) > 0.01) dedup.push({ ...p });
    }
    let changed = true;
    while (changed && dedup.length > 2) {
      changed = false;
      for (let i = 1; i < dedup.length - 1; i++) {
        const a = dedup[i - 1], b = dedup[i], c = dedup[i + 1];
        const collinear =
          (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
          (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
        if (collinear) { dedup.splice(i, 1); changed = true; break; }
      }
    }
    return dedup;
  }

  function roundedOrthogonalPath(points, radius) {
    const clean = cleanPolyline(points);
    if (clean.length === 1) return `M ${clean[0].x} ${clean[0].y}`;
    if (clean.length === 2) return `M ${clean[0].x} ${clean[0].y} L ${clean[1].x} ${clean[1].y}`;
    const parts = [`M ${clean[0].x} ${clean[0].y}`];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = clean[i - 1], corner = clean[i], next = clean[i + 1];
      const r = Math.max(0, Math.min(radius, pointDistance(prev, corner) * 0.45, pointDistance(corner, next) * 0.45));
      if (r < 0.5) {
        parts.push(`L ${corner.x} ${corner.y}`);
        continue;
      }
      const pin = pointToward(corner, prev, r);
      const pout = pointToward(corner, next, r);
      parts.push(`L ${pin.x} ${pin.y}`);
      parts.push(`Q ${corner.x} ${corner.y} ${pout.x} ${pout.y}`);
    }
    const last = clean[clean.length - 1];
    parts.push(`L ${last.x} ${last.y}`);
    return parts.join(' ');
  }

  function nodeObstacleRect(node, clearance) {
    const r = nodeGlobalRect(node);
    if (!r) return null;
    return {
      x1: r.x - clearance,
      x2: r.x + r.w + clearance,
      y1: r.y - clearance,
      y2: r.y + r.h + clearance,
      nodeId: node.id
    };
  }

  function segmentHitsRect(a, b, r) {
    const eps = 0.01;
    if (Math.abs(a.x - b.x) < eps) {
      const x = a.x;
      if (x <= r.x1 + eps || x >= r.x2 - eps) return false;
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      return hi > r.y1 + eps && lo < r.y2 - eps;
    }
    if (Math.abs(a.y - b.y) < eps) {
      const y = a.y;
      if (y <= r.y1 + eps || y >= r.y2 - eps) return false;
      const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
      return hi > r.x1 + eps && lo < r.x2 - eps;
    }
    return true;
  }

  function uniqueNumbers(values) {
    return [...new Set(values.filter(Number.isFinite).map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  }

  function dirFromVector(v) {
    if (Math.abs(v.x) > Math.abs(v.y)) return v.x > 0 ? 'R' : 'L';
    return v.y > 0 ? 'D' : 'U';
  }

  function oppositeDir(d) { return { R: 'L', L: 'R', U: 'D', D: 'U' }[d]; }

  function directionBetween(a, b) {
    const eps = 0.01;
    if (Math.abs(a.y - b.y) < eps && Math.abs(a.x - b.x) >= eps) return b.x > a.x ? 'R' : 'L';
    if (Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) >= eps) return b.y > a.y ? 'D' : 'U';
    return null;
  }

  function pointKey(p) { return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`; }
  function samePoint(a, b) { return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01; }
  function pointInsideRect(p, r) {
    const eps = 0.01;
    return p.x > r.x1 + eps && p.x < r.x2 - eps && p.y > r.y1 + eps && p.y < r.y2 - eps;
  }
  function pointInsideOrOnRect(p, r) {
    const eps = 0.01;
    return p.x >= r.x1 - eps && p.x <= r.x2 + eps && p.y >= r.y1 - eps && p.y <= r.y2 + eps;
  }
  function pointOnPortAxis(p, port, side) {
    const eps = 0.01;
    return (side === 'top' || side === 'bottom')
      ? Math.abs(p.x - port.x) < eps
      : Math.abs(p.y - port.y) < eps;
  }

  function sourceEscapeSegmentAllowed(a, b, r, s, sp, sourceDir) {
    const dir = directionBetween(a, b);
    return dir === sourceDir &&
      pointInsideOrOnRect(a, r) &&
      pointOnPortAxis(a, s, sp) && pointOnPortAxis(b, s, sp);
  }

  function targetEntrySegmentAllowed(a, b, r, t, tp, requiredIncoming) {
    const dir = directionBetween(a, b);
    return dir === requiredIncoming &&
      pointInsideOrOnRect(b, r) &&
      pointOnPortAxis(a, t, tp) && pointOnPortAxis(b, t, tp);
  }

  function segmentClearForSearch(a, b, edge, rects, s, t, sp, tp, sourceDir, requiredIncoming) {
    const dir = directionBetween(a, b);
    if (!dir) return false;
    for (const r of rects) {
      if (r.nodeId === edge.source && sourceEscapeSegmentAllowed(a, b, r, s, sp, sourceDir)) continue;
      if (r.nodeId === edge.target && targetEntrySegmentAllowed(a, b, r, t, tp, requiredIncoming)) continue;
      if (segmentHitsRect(a, b, r)) return false;
    }
    return true;
  }

  function intermediatePointAllowedInEndpointRect(q, dir, r, edge, s, t, sp, tp, sourceDir, requiredIncoming) {
    if (r.nodeId === edge.source && dir === sourceDir && pointOnPortAxis(q, s, sp)) return true;
    if (r.nodeId === edge.target && dir === requiredIncoming && pointOnPortAxis(q, t, tp)) return true;
    return false;
  }

  function routeClearanceViolations(points, edge, clearance, sp, tp) {
    const hits = [];
    const rects = model.nodes.map(n => nodeObstacleRect(n, clearance)).filter(Boolean);
    const s = points[0], t = points[points.length - 1];
    const sourceDir = dirFromVector(portVector(sp));
    const requiredIncoming = oppositeDir(dirFromVector(portVector(tp)));

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      for (const r of rects) {
        if (r.nodeId === edge.source && sourceEscapeSegmentAllowed(a, b, r, s, sp, sourceDir)) continue;
        if (r.nodeId === edge.target && targetEntrySegmentAllowed(a, b, r, t, tp, requiredIncoming)) continue;
        if (segmentHitsRect(a, b, r)) hits.push({ segment: i - 1, nodeId: r.nodeId });
      }
    }
    return hits;
  }

  function preferredCoordinateValues(s, t, st, tt, preferred) {
    return {
      x: [s.x, t.x, s.x + st.x * preferred, t.x + tt.x * preferred],
      y: [s.y, t.y, s.y + st.y * preferred, t.y + tt.y * preferred]
    };
  }

  function allLaneDividerXs() {
    const n = orderedActors().length;
    const xs = [];
    for (let i = 1; i < n; i++) xs.push(laneLeft(i));
    return xs;
  }

  function laneDividerXsBetweenActors(actorIdA, actorIdB) {
    const i0 = actorIndex(actorIdA);
    const i1 = actorIndex(actorIdB);
    if (i0 < 0 || i1 < 0 || i0 === i1) return [];
    const lo = Math.min(i0, i1);
    const hi = Math.max(i0, i1);
    const xs = [];
    for (let i = lo + 1; i <= hi; i++) xs.push(laneLeft(i));
    return xs;
  }

  function nearestLaneDividerX(x, dividerXs) {
    if (!dividerXs.length) return null;
    let best = dividerXs[0];
    let bestD = Math.abs(dividerXs[0] - x);
    for (let i = 1; i < dividerXs.length; i++) {
      const d = Math.abs(dividerXs[i] - x);
      if (d < bestD) {
        best = dividerXs[i];
        bestD = d;
      }
    }
    return best;
  }

  function xNearAny(x, values, tol = 0.51) {
    return values.some(v => Math.abs(v - x) <= tol);
  }

  function isVerticalDir(dir) {
    return dir === 'U' || dir === 'D';
  }

  function routingGrid(s, t, st, tt, cfg, options = {}) {
    const { width, height } = canvasSize();
    const margin = 8;
    const rects = model.nodes.map(n => nodeObstacleRect(n, cfg.nodeClearance)).filter(Boolean);
    const pref = preferredCoordinateValues(s, t, st, tt, cfg.preferredCornerDistance);
    const xs = [...pref.x, margin, Math.max(margin, width - margin)];
    const ys = [...pref.y, margin, Math.max(margin, height - margin)];

    for (const r of rects) {
      xs.push(r.x1, r.x2);
      ys.push(r.y1, r.y2);
    }

    const laneXs = options.laneDividerXs || allLaneDividerXs();
    xs.push(...laneXs);

    if (options.crossLane && (options.preferredLaneDividerXs || []).length) {
      const mid = (s.x + t.x) / 2;
      const prefer = nearestLaneDividerX(mid, options.preferredLaneDividerXs);
      if (prefer != null) xs.push(prefer);
    } else {
      xs.push((s.x + t.x) / 2);
    }
    ys.push((s.y + t.y) / 2);

    return { xs: uniqueNumbers(xs), ys: uniqueNumbers(ys), rects };
  }

  function MinHeap() { this.a = []; }
  MinHeap.prototype.push = function(item) {
    const a = this.a; a.push(item); let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= item.cost) break;
      a[i] = a[p]; i = p;
    }
    a[i] = item;
  };
  MinHeap.prototype.pop = function() {
    const a = this.a;
    if (!a.length) return null;
    const root = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let l = i * 2 + 1, r = l + 1, b = i;
        if (l < a.length && a[l].cost < (b === i ? last.cost : a[b].cost)) b = l;
        if (r < a.length && a[r].cost < (b === i ? last.cost : a[b].cost)) b = r;
        if (b === i) break;
        a[i] = a[b]; i = b;
      }
      a[i] = last;
    }
    return root;
  };

  function candidateNeighbors(p, grid, target) {
    const out = [];
    const xi = grid.xs.findIndex(v => Math.abs(v - p.x) < 0.01);
    const yi = grid.ys.findIndex(v => Math.abs(v - p.y) < 0.01);
    if (xi > 0) out.push({ x: grid.xs[xi - 1], y: p.y });
    if (xi >= 0 && xi < grid.xs.length - 1) out.push({ x: grid.xs[xi + 1], y: p.y });
    if (yi > 0) out.push({ x: p.x, y: grid.ys[yi - 1] });
    if (yi >= 0 && yi < grid.ys.length - 1) out.push({ x: p.x, y: grid.ys[yi + 1] });
    if (target && (Math.abs(target.x - p.x) < 0.01 || Math.abs(target.y - p.y) < 0.01) && !samePoint(target, p)) {
      if (!out.some(q => samePoint(q, target))) out.push({ ...target });
    }
    return out;
  }

  function findMinimalCornerRoute(edge, s, t, sp, tp, cfg) {
    const st = portVector(sp), tt = portVector(tp);
    const sourceDir = dirFromVector(st);
    const requiredIncoming = oppositeDir(dirFromVector(tt));
    const sNode = model.nodes.find(n => n.id === edge.source);
    const tNode = model.nodes.find(n => n.id === edge.target);
    const crossLane = !!(sNode && tNode && sNode.actor_id !== tNode.actor_id);
    const preferredLaneDividerXs = crossLane
      ? laneDividerXsBetweenActors(sNode.actor_id, tNode.actor_id)
      : [];
    const laneDividerXs = allLaneDividerXs();
    const grid = routingGrid(s, t, st, tt, cfg, {
      crossLane,
      laneDividerXs,
      preferredLaneDividerXs
    });
    const sKey = pointKey(s), tKey = pointKey(t);

    if (!grid.xs.some(v => Math.abs(v - s.x) < 0.01)) grid.xs = uniqueNumbers([...grid.xs, s.x]);
    if (!grid.xs.some(v => Math.abs(v - t.x) < 0.01)) grid.xs = uniqueNumbers([...grid.xs, t.x]);
    if (!grid.ys.some(v => Math.abs(v - s.y) < 0.01)) grid.ys = uniqueNumbers([...grid.ys, s.y]);
    if (!grid.ys.some(v => Math.abs(v - t.y) < 0.01)) grid.ys = uniqueNumbers([...grid.ys, t.y]);

    const heap = new MinHeap();
    const CORNER_WEIGHT = 1e6;
    // Prefer lane-gutter verticals over shorter mid-lane runs (still below one extra corner).
    const LANE_GUTTER_MISS_PENALTY = CORNER_WEIGHT * 0.5;
    const dist = new Map();
    const prev = new Map();
    const startState = `${sKey}|-`;
    dist.set(startState, 0);
    heap.push({ state: startState, p: s, dir: null, corners: 0, length: 0, cost: 0 });

    let finalState = null;
    while (heap.a.length) {
      const cur = heap.pop();
      if (cur.cost !== dist.get(cur.state)) continue;
      if (samePoint(cur.p, t)) {
        if (cur.dir === requiredIncoming) { finalState = cur.state; break; }
        continue;
      }

      for (const q of candidateNeighbors(cur.p, grid, t)) {
        const dir = directionBetween(cur.p, q);
        if (!dir) continue;
        if (cur.dir === null && dir !== sourceDir) continue;
        const qIsTarget = samePoint(q, t);
        if (qIsTarget && dir !== requiredIncoming) continue;
        const isFirst = cur.dir === null;
        if (!segmentClearForSearch(cur.p, q, edge, grid.rects, s, t, sp, tp, sourceDir, requiredIncoming)) continue;

        if (!qIsTarget) {
          let inside = false;
          for (const r of grid.rects) {
            if (!pointInsideRect(q, r)) continue;
            if (intermediatePointAllowedInEndpointRect(q, dir, r, edge, s, t, sp, tp, sourceDir, requiredIncoming)) continue;
            inside = true; break;
          }
          if (inside) continue;
        }

        // Cross-lane: corner–corner verticals must sit on a lane divider (not inside a lane).
        // Port-aligned verticals (source/target X) remain allowed for entry/exit stubs.
        const isInteriorVertical =
          crossLane &&
          preferredLaneDividerXs.length > 0 &&
          isVerticalDir(dir) &&
          cur.dir !== null &&
          !qIsTarget;
        if (isInteriorVertical) {
          const x = cur.p.x;
          const atPort = xNearAny(x, [s.x, t.x]);
          const atGutter = xNearAny(x, preferredLaneDividerXs);
          if (!atPort && !atGutter) continue;
        }

        const turn = cur.dir !== null && cur.dir !== dir ? 1 : 0;
        const corners = cur.corners + turn;
        const segLen = pointDistance(cur.p, q);
        let aestheticPenalty = 0;
        if (isFirst) aestheticPenalty += Math.abs(segLen - cfg.preferredCornerDistance) * 0.12;
        if (qIsTarget) aestheticPenalty += Math.abs(segLen - cfg.preferredCornerDistance) * 0.12;
        if (
          crossLane &&
          preferredLaneDividerXs.length > 0 &&
          isVerticalDir(dir) &&
          !xNearAny(cur.p.x, [s.x, t.x]) &&
          !xNearAny(cur.p.x, preferredLaneDividerXs)
        ) {
          aestheticPenalty += LANE_GUTTER_MISS_PENALTY;
        }
        const length = cur.length + segLen;
        const cost = corners * CORNER_WEIGHT + length + aestheticPenalty;
        const qState = `${pointKey(q)}|${dir}`;
        if (cost < (dist.get(qState) ?? Infinity)) {
          dist.set(qState, cost);
          prev.set(qState, { state: cur.state, p: cur.p });
          heap.push({ state: qState, p: q, dir, corners, length, cost });
        }
      }
    }

    if (!finalState) return null;
    const path = [];
    let state = finalState;
    let p = t;
    while (true) {
      path.push(p);
      if (state === startState) break;
      const pr = prev.get(state);
      if (!pr) return null;
      p = pr.p;
      state = pr.state;
    }
    path.reverse();
    const points = cleanPolyline(path);
    const collisions = routeClearanceViolations(points, edge, cfg.nodeClearance, sp, tp);
    if (collisions.length) return null;
    return points;
  }

  function fallbackOrthogonalRoute(s, t, sp, tp, cfg) {
    const st = portVector(sp), tt = portVector(tp);
    const sourceAxis = sideAxis(sp), targetAxis = sideAxis(tp);
    const d = Math.max(18, cfg.preferredCornerDistance);
    const { width, height } = canvasSize();
    if (sourceAxis !== targetAxis) {
      const s1 = { x: s.x + st.x * d, y: s.y + st.y * d };
      const t1 = { x: t.x + tt.x * d, y: t.y + tt.y * d };
      const mid = sourceAxis === 'h' ? { x: s1.x, y: t1.y } : { x: t1.x, y: s1.y };
      return cleanPolyline([s, s1, mid, t1, t]);
    }
    const s1 = { x: s.x + st.x * d, y: s.y + st.y * d };
    const t1 = { x: t.x + tt.x * d, y: t.y + tt.y * d };
    const detour = sourceAxis === 'v'
      ? (Math.abs(s.x - t.x) > 1 ? (s.x + t.x) / 2 : Math.min(width - 20, Math.max(20, s.x + 140)))
      : (Math.abs(s.y - t.y) > 1 ? (s.y + t.y) / 2 : Math.min(height - 20, Math.max(20, s.y + 140)));
    return sourceAxis === 'v'
      ? cleanPolyline([s, s1, { x: detour, y: s1.y }, { x: detour, y: t1.y }, t1, t])
      : cleanPolyline([s, s1, { x: s1.x, y: detour }, { x: t1.x, y: detour }, t1, t]);
  }

  function routeEdge(edge) {
    if (!edge?.id) return null;
    const sticky = liveStickyRoutes && liveDragNodeId;
    const incident = sticky && (edge.source === liveDragNodeId || edge.target === liveDragNodeId);
    if (!incident && routeCache.has(edge.id)) {
      return routeCache.get(edge.id);
    }

    const normalized = normalizeEdgePorts(edge);
    if (!normalized) return null;
    const cfg = routingSettings();
    const sp = normalized.source_port, tp = normalized.target_port;
    const sNode = model.nodes.find(n => n.id === edge.source);
    const tNode = model.nodes.find(n => n.id === edge.target);
    const s = portPoint(sNode, sp), t = portPoint(tNode, tp);
    if (!s || !t) return null;

    let points = findMinimalCornerRoute(edge, s, t, sp, tp, cfg);
    let usedFallback = false;

    if (!points) {
      usedFallback = true;
      points = findMinimalCornerRoute(edge, s, t, sp, tp, { ...cfg, nodeClearance: 0 });
      if (!points) points = fallbackOrthogonalRoute(s, t, sp, tp, cfg);
    }

    points = cleanPolyline(points);
    const collisions = routeClearanceViolations(points, edge, cfg.nodeClearance, sp, tp);
    const blocked = collisions.length > 0;
    const result = {
      source_port: sp,
      target_port: tp,
      points,
      blocked,
      usedFallback,
      d: roundedOrthogonalPath(points, cfg.cornerRadius)
    };
    routeCache.set(edge.id, result);
    return result;
  }

  // --- Node Auto Arrange (Lane-fixed / Y-compaction) ---

  function layoutNodeById(id) {
    return model.nodes.find(n => n.id === id) || null;
  }

  // 印刷1ページぶんの本文高さ（user単位）。改ページ境界の位置算出に使う
  function printBodyUserPerPage() {
    const scaleMmPerUser = (PDF_A3_W_MM - PDF_MARGIN_MM * 2) / PDF_LANE_COLUMNS / LANE_WIDTH;
    if (!(scaleMmPerUser > 0)) return Infinity;
    const bodyAvailMm = PDF_A3_H_MM
      - PDF_MARGIN_MM * 2
      - PDF_META_H_MM
      - PDF_META_GAP_MM
      - PDF_FOOTER_H_MM
      - LANE_HEADER_H * scaleMmPerUser;
    if (!(bodyAvailMm > 0)) return Infinity;
    return bodyAvailMm / scaleMmPerUser;
  }

  function pageBreakBoundaryY(pageIndex) {
    return LANE_HEADER_H + pageIndex * printBodyUserPerPage();
  }

  // 高さ h のノードを y に置くと禁止帯にかかる場合、帯の下端まで送る
  function avoidPageBreakBand(y, h) {
    const per = printBodyUserPerPage();
    if (!Number.isFinite(per) || per <= 0) return y;
    let cur = y;
    for (let guard = 0; guard < 64; guard++) {
      const idx = Math.floor((cur - LANE_HEADER_H) / per);
      let moved = false;
      for (const p of [idx, idx + 1]) {
        if (p < 1) continue;
        const b = LANE_HEADER_H + p * per;
        if (cur < b + LAYOUT_PAGE_BREAK_BAND_BELOW && cur + h > b - LAYOUT_PAGE_BREAK_BAND_ABOVE) {
          cur = Math.ceil((b + LAYOUT_PAGE_BREAK_BAND_BELOW) / GRID) * GRID;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    return cur;
  }

  function placeLayoutY(node, y) {
    return avoidPageBreakBand(snap(y), nodeSize(node).h);
  }

  function placeLayoutGroupY(members, y) {
    const tallest = Math.max(...members.map(m => nodeSize(m).h));
    return avoidPageBreakBand(snap(y), tallest);
  }

  function centerNodesInLanes() {
    model.nodes.forEach(n => {
      const { w } = nodeSize(n);
      n.position.x = clampNodeLocalX(n, snap((LANE_WIDTH - w) / 2));
    });
  }

  function findBackEdges() {
    const state = new Map();
    const back = new Set();
    const outgoing = id => model.edges.filter(e => e.source === id);

    function dfs(id) {
      state.set(id, 1);
      for (const e of outgoing(id)) {
        const s = state.get(e.target) || 0;
        if (s === 0) dfs(e.target);
        else if (s === 1) back.add(e.id);
      }
      state.set(id, 2);
    }

    model.nodes.forEach(n => {
      if ((state.get(n.id) || 0) === 0) dfs(n.id);
    });
    return back;
  }

  function classifyLayoutEdges() {
    const back = findBackEdges();
    return model.edges.filter(e => !back.has(e.id));
  }

  function topologicalOrder(forwardEdges) {
    const indeg = new Map(model.nodes.map(n => [n.id, 0]));
    forwardEdges.forEach(e => indeg.set(e.target, (indeg.get(e.target) || 0) + 1));
    const q = model.nodes
      .filter(n => indeg.get(n.id) === 0)
      .sort((a, b) => a.position.y - b.position.y);
    const out = [];
    while (q.length) {
      const n = q.shift();
      out.push(n);
      forwardEdges.filter(e => e.source === n.id).forEach(e => {
        indeg.set(e.target, indeg.get(e.target) - 1);
        if (indeg.get(e.target) === 0) {
          q.push(layoutNodeById(e.target));
          q.sort((a, b) => a.position.y - b.position.y);
        }
      });
    }
    model.nodes.forEach(n => {
      if (!out.includes(n)) out.push(n);
    });
    return out;
  }

  // 条件ノードの左右下どのポートからでも、共通の行ピッチで次の行高さを床とする
  // （実高さ基準だと条件ノードだけ DECISION_H-NODE_H 分直下が下がるため）
  function outgoingChildFloorY(sourceNode) {
    const bodyH = Math.max(nodeSize(sourceNode).h, LAYOUT_ROW_BODY_H);
    return snap(sourceNode.position.y + bodyH + NODE_VERTICAL_GAP);
  }

  function assignMinimumY(forwardEdges) {
    const order = topologicalOrder(forwardEdges);
    const minY = new Map(model.nodes.map(n => [n.id, LAYOUT_CANVAS_TOP]));
    order.forEach(n => {
      const base = minY.get(n.id);
      n.position.y = placeLayoutY(n, Math.max(LAYOUT_CANVAS_TOP, base));
      forwardEdges.filter(e => e.source === n.id).forEach(e => {
        const target = layoutNodeById(e.target);
        if (!target) return;
        const candidate = outgoingChildFloorY(n);
        minY.set(target.id, Math.max(minY.get(target.id) || LAYOUT_CANVAS_TOP, candidate));
      });
    });
  }

  function buildAlignmentGroups(forwardEdges) {
    const groups = [];
    // 同一ポートから複数ターゲットのみ揃える。
    // 条件ノードの左右/下を横断して max(Y) 揃えしない（左右は直下ノードに引きずらず独立に上詰め）。
    model.nodes.forEach(n => {
      const byPort = new Map();
      forwardEdges.filter(e => e.source === n.id).forEach(e => {
        const arr = byPort.get(e.source_port) || [];
        arr.push(e.target);
        byPort.set(e.source_port, arr);
      });
      for (const [port, ids0] of byPort) {
        const ids = [...new Set(ids0)];
        if (ids.length > 1) groups.push({ key: `port:${n.id}:${port}`, ids });
      }
    });
    return groups;
  }

  function isDecisionBranchTarget(nodeId, forwardEdges) {
    return forwardEdges.some(e => {
      if (e.target !== nodeId) return false;
      const src = layoutNodeById(e.source);
      return !!(src && src.type === 'decision');
    });
  }

  function groupCanShareY(group) {
    for (let i = 0; i < group.ids.length; i++) {
      for (let j = i + 1; j < group.ids.length; j++) {
        const a = layoutNodeById(group.ids[i]);
        const b = layoutNodeById(group.ids[j]);
        if (a && b && a.actor_id === b.actor_id) return false;
      }
    }
    return true;
  }

  function applyAlignmentGroups(groups) {
    groups.forEach(g => {
      if (!groupCanShareY(g)) return;
      const members = g.ids.map(layoutNodeById).filter(Boolean);
      if (!members.length) return;
      const y = placeLayoutGroupY(members, Math.max(...members.map(n => n.position.y)));
      members.forEach(n => { n.position.y = y; });
    });
  }

  function resolveLaneSpacing() {
    orderedActors().forEach(actor => {
      const list = model.nodes
        .filter(n => n.actor_id === actor.id)
        .sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id));
      let cursor = LAYOUT_CANVAS_TOP;
      list.forEach(n => {
        n.position.y = placeLayoutY(n, Math.max(n.position.y, cursor));
        cursor = n.position.y + nodeSize(n).h + NODE_VERTICAL_GAP;
      });
    });
  }

  function predecessorFloor(n, forwardEdges) {
    let floor = LAYOUT_CANVAS_TOP;
    forwardEdges.filter(e => e.target === n.id).forEach(e => {
      const p = layoutNodeById(e.source);
      if (!p) return;
      floor = Math.max(floor, outgoingChildFloorY(p));
    });
    return snap(floor);
  }

  function laneFloor(n) {
    const same = model.nodes
      .filter(x => x.actor_id === n.actor_id && x.id !== n.id && x.position.y < n.position.y)
      .sort((a, b) => b.position.y - a.position.y);
    if (!same.length) return LAYOUT_CANVAS_TOP;
    const p = same[0];
    return snap(p.position.y + nodeSize(p).h + NODE_VERTICAL_GAP);
  }

  function laneCeiling(n) {
    const same = model.nodes
      .filter(x => x.actor_id === n.actor_id && x.id !== n.id && x.position.y > n.position.y)
      .sort((a, b) => a.position.y - b.position.y);
    if (!same.length) return Infinity;
    return snap(same[0].position.y - nodeSize(n).h - NODE_VERTICAL_GAP);
  }

  function compactUpward(forwardEdges, groups) {
    const groupByNode = new Map();
    groups.filter(groupCanShareY).forEach(g => {
      g.ids.forEach(id => groupByNode.set(id, g));
    });
    const handled = new Set();
    const ordered = [...model.nodes].sort((a, b) => a.position.y - b.position.y);
    for (const n of ordered) {
      const g = groupByNode.get(n.id);
      if (g && !handled.has(g.key)) {
        const members = g.ids.map(layoutNodeById).filter(Boolean);
        let floor = LAYOUT_CANVAS_TOP;
        members.forEach(m => {
          floor = Math.max(floor, predecessorFloor(m, forwardEdges), laneFloor(m));
        });
        const target = placeLayoutGroupY(members, floor);
        members.forEach(m => { m.position.y = target; });
        handled.add(g.key);
      } else if (!g) {
        n.position.y = placeLayoutY(n, Math.max(predecessorFloor(n, forwardEdges), laneFloor(n)));
      }
    }
    resolveLaneSpacing();
    applyAlignmentGroups(groups);
  }

  function snapLayoutToGrid() {
    model.nodes.forEach(n => {
      n.position.x = snap(n.position.x);
      n.position.y = placeLayoutY(n, n.position.y);
    });
  }

  function polylineCornerCount(points) {
    if (!points || points.length < 3) return 0;
    let corners = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const dx1 = Math.sign(b.x - a.x), dy1 = Math.sign(b.y - a.y);
      const dx2 = Math.sign(c.x - b.x), dy2 = Math.sign(c.y - b.y);
      if (dx1 !== dx2 || dy1 !== dy2) corners++;
    }
    return corners;
  }

  function scoreLayoutRouting() {
    let blocked = 0;
    let fallback = 0;
    let corners = 0;
    const badNodeIds = new Set();
    invalidateRoutes();
    model.edges.forEach(edge => {
      const bd = routeEdge(edge);
      if (!bd) return;
      const c = polylineCornerCount(bd.points);
      corners += c;
      if (bd.blocked) {
        blocked++;
        badNodeIds.add(edge.source);
        badNodeIds.add(edge.target);
      }
      if (bd.usedFallback) {
        fallback++;
        badNodeIds.add(edge.source);
        badNodeIds.add(edge.target);
      }
      if (c >= 4) {
        badNodeIds.add(edge.source);
        badNodeIds.add(edge.target);
      }
    });
    return { blocked, fallback, corners, badNodeIds };
  }

  function routingScoreBetter(a, b) {
    if (a.blocked !== b.blocked) return a.blocked < b.blocked;
    if (a.fallback !== b.fallback) return a.fallback < b.fallback;
    return a.corners < b.corners;
  }

  function improveLayoutByRouting(forwardEdges, groups) {
    if (!model.edges.length) return;
    const groupByNode = new Map();
    groups.filter(groupCanShareY).forEach(g => {
      g.ids.forEach(id => groupByNode.set(id, g));
    });

    let baseline = scoreLayoutRouting();
    if (baseline.blocked === 0 && baseline.fallback === 0 && baseline.badNodeIds.size === 0) return;

    const candidates = [...baseline.badNodeIds]
      .map(layoutNodeById)
      .filter(Boolean)
      .sort((a, b) => a.position.y - b.position.y);

    const handledGroups = new Set();
    const handledNodes = new Set();

    for (const n of candidates) {
      if (handledNodes.has(n.id)) continue;
      // 条件ノード分岐先は次の行高さへ上詰めした位置を維持する
      if (isDecisionBranchTarget(n.id, forwardEdges)) continue;
      const g = groupByNode.get(n.id);
      if (g) {
        if (handledGroups.has(g.key)) continue;
        handledGroups.add(g.key);
      }
      const members = g
        ? g.ids.map(layoutNodeById).filter(Boolean)
        : [n];
      if (members.some(m => isDecisionBranchTarget(m.id, forwardEdges))) continue;
      members.forEach(m => handledNodes.add(m.id));
      const startY = Math.min(...members.map(m => m.position.y));
      const ceilings = members.map(m => laneCeiling(m));
      const finiteCeilings = ceilings.filter(v => Number.isFinite(v));
      const maxY = finiteCeilings.length
        ? Math.min(startY + LAYOUT_ROUTE_SEARCH_MAX, ...finiteCeilings)
        : startY + LAYOUT_ROUTE_SEARCH_MAX;
      if (!(maxY > startY)) continue;

      let bestY = startY;
      let bestScore = baseline;
      const originalYs = members.map(m => m.position.y);

      for (let y = startY + GRID; y <= maxY; y += GRID) {
        const snapped = snap(y);
        members.forEach(m => {
          const floor = Math.max(
            predecessorFloor(m, forwardEdges),
            laneFloor(m)
          );
          m.position.y = placeLayoutY(m, Math.max(floor, snapped));
        });
        if (g) {
          const aligned = placeLayoutGroupY(members, Math.max(...members.map(m => m.position.y)));
          members.forEach(m => { m.position.y = aligned; });
        }
        if (members.some(m => m.position.y > laneCeiling(m))) {
          members.forEach((m, i) => { m.position.y = originalYs[i]; });
          continue;
        }
        const score = scoreLayoutRouting();
        if (routingScoreBetter(score, bestScore)) {
          bestScore = score;
          bestY = members[0].position.y;
        }
      }

      if (bestY !== startY && routingScoreBetter(bestScore, baseline)) {
        const safeY = placeLayoutGroupY(members, bestY);
        members.forEach(m => { m.position.y = safeY; });
        baseline = bestScore;
      } else {
        members.forEach((m, i) => { m.position.y = originalYs[i]; });
      }
    }

    resolveLaneSpacing();
    applyAlignmentGroups(groups);
  }

  function autoArrangeNodes() {
    if (!model.nodes.length) return;
    cancelEdgeGesture();
    cancelPlaceGesture();
    mutate(() => {
      centerNodesInLanes();
      const forwardEdges = classifyLayoutEdges();
      assignMinimumY(forwardEdges);
      const groups = buildAlignmentGroups(forwardEdges);
      applyAlignmentGroups(groups);
      resolveLaneSpacing();
      compactUpward(forwardEdges, groups);
      improveLayoutByRouting(forwardEdges, groups);
      snapLayoutToGrid();
    });
  }

  function pointAlongPolyline(points, distance) {
    let left = Math.max(0, distance);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], len = pointDistance(a, b);
      if (left <= len) {
        const k = len ? left / len : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      left -= len;
    }
    return { ...points[points.length - 1] };
  }

  function polylineMidpoint(points) {
    return pointAlongPolyline(points, polylineLength(points) / 2);
  }

  function edgeLabelPoint(edge, bd, labelWidth) {
    const sourceNode = model.nodes.find(n => n.id === edge.source);
    if (sourceNode?.type === 'decision') {
      const nearPortDistance = Math.max(28, labelWidth / 2 + 10);
      return pointAlongPolyline(bd.points, nearPortDistance);
    }
    return polylineMidpoint(bd.points);
  }

  function edgeLabelClass(label) {
    const key = String(label || '').trim().toLowerCase();
    if (key === 'yes') return 'yes';
    if (key === 'no') return 'no';
    return '';
  }

  function drawEdge(edge) {
    const interrupt = placeGesture?.interrupt;
    const interruptRoute = interrupt?.routes?.find(r => r.edgeId === edge.id)
      || (interrupt?.edgeId === edge.id && interrupt.basePoints
        ? { edgeId: edge.id, segmentIndex: interrupt.segmentIndex, basePoints: interrupt.basePoints }
        : null);
    let bd = null;
    if (
      interruptRoute &&
      Array.isArray(interruptRoute.basePoints) &&
      interruptRoute.basePoints.length >= 2 &&
      Number.isInteger(interruptRoute.segmentIndex)
    ) {
      const stretch = interrupt.shiftY > 0 ? interrupt.shiftY : 0;
      const points = stretch > 0
        ? stretchRoutePoints(interruptRoute.basePoints, interruptRoute.segmentIndex, stretch)
        : interruptRoute.basePoints.map(p => ({ ...p }));
      const cfg = routingSettings();
      const normalized = normalizeEdgePorts(edge);
      bd = {
        source_port: normalized?.source_port,
        target_port: normalized?.target_port,
        points,
        blocked: false,
        usedFallback: false,
        d: roundedOrthogonalPath(points, cfg.cornerRadius)
      };
    } else {
      bd = routeEdge(edge);
    }
    if (!bd || !bd.points || bd.points.length < 2) return;
    const selected = selection?.kind === 'edge' && selection.id === edge.id;
    const isInterruptTarget = !!interruptRoute;
    const edgeStrokeUser = selected || isInterruptTarget ? 2 : bd.blocked ? 2 : STROKE_EDGE;
    const points = pxSnapOrthoPoints(bd.points, strokeCssFromUser(edgeStrokeUser));
    const cfg = routingSettings();
    const d = roundedOrthogonalPath(points, cfg.cornerRadius);
    const g = svgEl('g', {
      class: `edge-group${selected ? ' selected' : ''}${bd.blocked ? ' blocked' : ''}${isInterruptTarget ? ' interrupt-target' : ''}`,
      'data-edge-id': edge.id
    });
    const marker = bd.blocked ? 'url(#arrowBlocked)' : selected ? 'url(#arrowSelected)' : 'url(#arrow)';
    const hit = svgEl('path', { d, class: 'edge-hit' });
    const halo = svgEl('path', { d, class: 'edge-halo' });
    const line = svgEl('path', { d, class: 'edge-line', 'marker-end': marker });
    hit.addEventListener('click', e => {
      e.stopPropagation();
      if (!isSelectTool() || edgeGesture) return;
      selection = { kind: 'edge', id: edge.id };
      renderAll();
    });
    hit.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (!isSelectTool() || edgeGesture) return;
      beginEdgeLabelEdit(edge.id);
    });
    g.append(hit, halo, line);

    const text = edge.label || '';
    const editing = editingEdgeId === edge.id;
    if (text && !editing) {
      const labelW = Math.max(36, [...text].length * 8 + 12);
      const mid = edgeLabelPoint(edge, { ...bd, points }, labelW);
      const tone = edgeLabelClass(text);
      const labelX = pxSnapX(mid.x - labelW / 2, STROKE_LANE);
      const labelY = pxSnapY(mid.y - 10, STROKE_LANE);
      const bg = svgEl('rect', {
        x: labelX, y: labelY, width: pxSnapSize(labelW), height: pxSnapSize(20),
        class: `edge-label-bg${tone ? ` ${tone}` : ''}`
      });
      const tx = svgEl('text', {
        x: labelX + pxSnapSize(labelW) / 2, y: labelY + pxSnapSize(20) / 2 + 1,
        class: `edge-label${tone ? ` ${tone}` : ''}`
      });
      tx.textContent = text;
      g.append(bg, tx);
    }
    edgeLayer.appendChild(g);
  }

  function measureEdgeLabelWidth(text) {
    return Math.max(36, [...String(text || '')].length * 8 + 12);
  }

  function positionEdgeLabelInput(input, point, text) {
    const ctm = svg.getScreenCTM();
    if (!ctm || !point) return;
    const svgPt = svg.createSVGPoint();
    svgPt.x = point.x;
    svgPt.y = point.y;
    const screen = svgPt.matrixTransform(ctm);
    const contentRect = canvasContent.getBoundingClientRect();
    const labelW = measureEdgeLabelWidth(text);
    const screenW = Math.max(36 * zoom, labelW * zoom);
    input.style.left = `${screen.x - contentRect.left}px`;
    input.style.top = `${screen.y - contentRect.top}px`;
    input.style.width = `${screenW}px`;
    input.style.fontSize = `${11 * zoom}px`;
    input.style.height = `${Math.max(18, 20 * zoom)}px`;
    input.style.lineHeight = `${Math.max(16, 18 * zoom)}px`;
    input.style.padding = `0 ${Math.max(4, 6 * zoom)}px`;
  }

  const edgeFocusTokenRef = { n: 0 };
  const edgeEditor = createInlineEditor({
    inputId: 'edgeRenameInput',
    finishWhenInterrupted: false,
    focusTokenRef: edgeFocusTokenRef,
    getId: () => editingEdgeId,
    setId: v => { editingEdgeId = v; },
    getBefore: () => edgeRenameBefore,
    setBefore: v => { edgeRenameBefore = v; },
    find: id => model.edges.find(e => e.id === id),
    getValue: edge => edge.label || '',
    setValue: (edge, next) => { edge.label = next; },
    readValue: input => String(input.value || '').trim(),
    restore: (edge, before, id) => {
      const prev = before.edges.find(e => e.id === id);
      if (prev) edge.label = prev.label;
    },
    beforeBegin() {
      if (edgeGesture) cancelEdgeGesture();
      if (placeGesture) cancelPlaceGesture();
      if (placeMemoGesture) cancelPlaceMemoGesture();
    },
    onBegin: id => { selection = { kind: 'edge', id }; },
    onFinish() { selection = null; },
    sync(api) {
      const id = api.getId();
      if (!id) {
        edgeRenameMount.innerHTML = '';
        return;
      }
      const edge = model.edges.find(e => e.id === id);
      const bd = edge ? routeEdge(edge) : null;
      const ctm = svg.getScreenCTM();
      if (!edge || !bd?.points || bd.points.length < 2 || !ctm) {
        api.clear();
        edgeRenameMount.innerHTML = '';
        return;
      }
      let input = document.getElementById('edgeRenameInput');
      const liveText = input && edgeRenameMount.contains(input) ? input.value : (edge.label || '');
      const mid = edgeLabelPoint(edge, bd, measureEdgeLabelWidth(liveText));
      if (
        input &&
        input.tagName === 'INPUT' &&
        edgeRenameMount.contains(input) &&
        input.dataset.edgeId === id
      ) {
        const tone = edgeLabelClass(input.value);
        input.className = `edge-rename-input${tone ? ` ${tone}` : ''}`;
        positionEdgeLabelInput(input, mid, input.value);
        return;
      }
      edgeRenameMount.innerHTML = '';
      input = document.createElement('input');
      input.id = 'edgeRenameInput';
      input.type = 'text';
      input.className = 'edge-rename-input';
      input.dataset.edgeId = id;
      input.value = edge.label || '';
      input.setAttribute('aria-label', 'Edgeラベル');
      input.spellcheck = false;
      input.autocomplete = 'off';
      const tone = edgeLabelClass(input.value);
      if (tone) input.classList.add(tone);
      positionEdgeLabelInput(input, mid, input.value);
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('pointerdown', e => e.stopPropagation());
      input.addEventListener('input', () => {
        const currentBd = routeEdge(edge);
        if (!currentBd?.points) return;
        const point = edgeLabelPoint(edge, currentBd, measureEdgeLabelWidth(input.value));
        const nextTone = edgeLabelClass(input.value);
        input.className = `edge-rename-input${nextTone ? ` ${nextTone}` : ''}`;
        positionEdgeLabelInput(input, point, input.value);
      });
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          api.finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          api.finish(false);
        }
      });
      edgeRenameMount.appendChild(input);
    }
  });

  function beginEdgeLabelEdit(edgeId) { edgeEditor.begin(edgeId); }
  function finishEdgeLabelEdit(commit) { edgeEditor.finish(commit); }
  function syncEdgeLabelInput() { edgeEditor.sync(); }

  function drawRewireHandles() {
    if (selection?.kind !== 'edge' || edgeGesture || editingEdgeId) return;
    const edge = model.edges.find(e => e.id === selection.id);
    if (!edge) return;
    const normalized = normalizeEdgePorts(edge);
    if (!normalized) return;
    const sNode = model.nodes.find(n => n.id === edge.source);
    const tNode = model.nodes.find(n => n.id === edge.target);
    const s = portPoint(sNode, normalized.source_port);
    const t = portPoint(tNode, normalized.target_port);
    if (!s || !t) return;
    [
      { end: 'source', p: s },
      { end: 'target', p: t }
    ].forEach(({ end, p }) => {
      const sp = pxSnapPoint(p, STROKE_HANDLE);
      const h = svgEl('circle', {
        class: 'rewire-handle',
        cx: sp.x, cy: sp.y, r: 7,
        'data-edge-id': edge.id,
        'data-end': end
      });
      h.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        beginRewireGesture(e, edge.id, end);
      });
      handlesLayer.appendChild(h);
    });
  }

  function renderEdgePreview() {
    previewLayer.innerHTML = '';
    if (!edgeGesture || (edgeGesture.type !== 'new-edge' && edgeGesture.type !== 'rewire')) return;
    const a = edgeGesture.anchor;
    const p = edgeGesture.pointer;
    if (!a || !p) return;
    const previewStrokeCss = strokeCssFromUser(2);
    const sa = pxSnapPoint(a, previewStrokeCss);
    const sp = pxSnapPoint(p, previewStrokeCss);
    const path = svgEl('path', {
      class: 'edge-preview',
      d: `M ${sa.x} ${sa.y} L ${sp.x} ${sp.y}`
    });
    previewLayer.appendChild(path);
  }

  function cancelEdgeGesture() {
    if (!edgeGesture) return;
    edgeGesture = null;
    clearPortFeedback();
    document.body.classList.remove('edge-mode');
    if (previewLayer) previewLayer.innerHTML = '';
  }

  function nearestPort(p, radius = PORT_HIT_RADIUS) {
    let best = null, bestD = Infinity;
    for (const n of model.nodes) {
      for (const side of visiblePortsFor(n)) {
        const q = portPoint(n, side);
        if (!q) continue;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < radius && d < bestD) {
          bestD = d;
          best = { nodeId: n.id, side, point: q };
        }
      }
    }
    return best;
  }

  function currentHitIsValid(hit) {
    if (!hit || !edgeGesture) return false;
    if (edgeGesture.type === 'new-edge') {
      return connectionFromPorts(edgeGesture.nodeId, edgeGesture.side, hit.nodeId, hit.side).valid;
    }
    if (edgeGesture.type === 'rewire') {
      const edge = model.edges.find(e => e.id === edgeGesture.edgeId);
      return rewirePortIsValid(edge, edgeGesture.end, hit);
    }
    return false;
  }

  function clearPortFeedback() {
    document.querySelectorAll('.port.hot, .port.invalid').forEach(p => p.classList.remove('hot', 'invalid'));
    document.querySelectorAll('.port-invalid-x.active').forEach(x => x.classList.remove('active'));
  }

  function setPortFeedback(hit, valid = false) {
    clearPortFeedback();
    if (!hit) return;
    const nodeEl = nodeLayer.querySelector(`[data-node-id="${CSS.escape(hit.nodeId)}"]`);
    if (!nodeEl) return;
    const port = nodeEl.querySelector(`.port[data-port="${hit.side}"]`);
    if (!port) return;
    if (valid) {
      port.classList.add('hot');
    } else {
      port.classList.add('invalid');
      nodeEl.querySelector(`.port-invalid-x[data-port="${hit.side}"]`)?.classList.add('active');
    }
  }

  function beginNewEdgeGesture(e, nodeId, side) {
    if (e.button !== 0 || !isSelectTool() || zoomDrag || editingNodeId || editingEdgeId || drag || placeGesture) return;
    const node = model.nodes.find(n => n.id === nodeId);
    if (!node || !visiblePortsFor(node).includes(side)) return;
    const anchor = portPoint(node, side);
    if (!anchor) return;
    if (editingLaneId) finishLaneRename(true);
    edgeGesture = {
      type: 'new-edge',
      nodeId,
      side,
      anchor,
      pointer: eventToSvg(e),
      pointerId: e.pointerId,
      before: clone(model)
    };
    selection = { kind: 'node', id: nodeId };
    document.body.classList.add('edge-mode');
    svg.setPointerCapture?.(e.pointerId);
    clearPortFeedback();
    renderEdgePreview();
  }

  function beginRewireGesture(e, edgeId, end) {
    if (e.button !== 0 || !isSelectTool() || zoomDrag || editingNodeId || editingEdgeId || drag || placeGesture) return;
    const edge = model.edges.find(ed => ed.id === edgeId);
    if (!edge) return;
    const normalized = normalizeEdgePorts(edge);
    if (!normalized) return;
    const node = model.nodes.find(n => n.id === (end === 'source' ? edge.source : edge.target));
    const port = end === 'source' ? normalized.source_port : normalized.target_port;
    const anchor = portPoint(node, port);
    if (!anchor) return;
    edgeGesture = {
      type: 'rewire',
      edgeId,
      end,
      anchor,
      pointer: eventToSvg(e),
      pointerId: e.pointerId,
      before: clone(model)
    };
    document.body.classList.add('edge-mode');
    svg.setPointerCapture?.(e.pointerId);
    handlesLayer.innerHTML = '';
    clearPortFeedback();
    renderEdgePreview();
  }

  function moveEdgeGesture(e) {
    if (!edgeGesture || edgeGesture.pointerId !== e.pointerId) return;
    edgeGesture.pointer = eventToSvg(e);
    const hit = nearestPort(edgeGesture.pointer, PORT_HIT_RADIUS);
    setPortFeedback(hit, currentHitIsValid(hit));
    renderEdgePreview();
  }

  function endEdgeGesture(e) {
    if (!edgeGesture || edgeGesture.pointerId !== e.pointerId) return;
    const gesture = edgeGesture;
    const hit = nearestPort(eventToSvg(e), PORT_HIT_RADIUS + 4);
    edgeGesture = null;
    clearPortFeedback();
    document.body.classList.remove('edge-mode');
    previewLayer.innerHTML = '';

    if (gesture.type === 'new-edge' && hit) {
      const connection = connectionFromPorts(gesture.nodeId, gesture.side, hit.nodeId, hit.side);
      if (connection.valid) {
        model.edges.push({
          id: makeId('edg'),
          source: connection.source,
          source_port: connection.source_port,
          target: connection.target,
          target_port: connection.target_port,
          label: ''
        });
        selection = null;
        if (modelChanged(gesture.before)) {
          pushHistory(gesture.before);
        }
      }
    } else if (gesture.type === 'rewire' && hit) {
      const edge = model.edges.find(ed => ed.id === gesture.edgeId);
      if (edge && rewirePortIsValid(edge, gesture.end, hit)) {
        if (gesture.end === 'source') {
          edge.source = hit.nodeId;
          edge.source_port = hit.side;
        } else {
          edge.target = hit.nodeId;
          edge.target_port = hit.side;
        }
        selection = { kind: 'edge', id: edge.id };
        if (modelChanged(gesture.before)) {
          pushHistory(gesture.before);
        }
      }
    }
    renderAll();
  }

  function svgEl(name, attrs={}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.setAttribute('class', v);
      else if (v !== undefined && v !== null) el.setAttribute(k, String(v));
    }
    return el;
  }

  function eventToSvg(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startLaneDrag(e, actorId) {
    if (e.button !== 0 || !isSelectTool() || zoomDrag || editingLaneId || editingNodeId || editingEdgeId || edgeGesture || placeGesture || drag) return;
    const actor = model.actors.find(a => a.id === actorId);
    if (!actor) return;
    e.stopPropagation();
    e.preventDefault();
    if (editingNodeId) finishNodeRename(true);
    selection = { kind: 'actor', id: actorId };
    laneDrag = {
      actorId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      before: clone(model),
      moved: false,
      target: e.currentTarget
    };
    renderToolbar();
  }

  function reorderActorTo(actorId, toIndex) {
    const arr = orderedActors();
    const from = arr.findIndex(a => a.id === actorId);
    if (from < 0 || toIndex < 0 || toIndex >= arr.length || from === toIndex) return false;
    const [item] = arr.splice(from, 1);
    arr.splice(toIndex, 0, item);
    arr.forEach((a, i) => { a.order = i + 1; });
    return true;
  }

  function moveLaneDrag(e) {
    if (!laneDrag || laneDrag.pointerId !== e.pointerId) return;
    const dx = e.clientX - laneDrag.startClientX;
    if (!laneDrag.moved && Math.abs(dx) <= 4) return;
    if (!laneDrag.moved) {
      laneDrag.moved = true;
      laneDrag.target?.setPointerCapture?.(e.pointerId);
      document.body.classList.add('lane-dragging');
    }
    const actors = orderedActors();
    if (actors.length < 2) return;
    const p = eventToSvg(e);
    const origin = laneOriginX();
    const toIndex = clamp(
      Math.floor((p.x - origin) / LANE_WIDTH),
      0,
      actors.length - 1
    );
    if (reorderActorTo(laneDrag.actorId, toIndex)) {
      invalidateRoutes();
      scheduleLiveRender();
    }
  }

  function endLaneDrag(e) {
    if (!laneDrag || laneDrag.pointerId !== e.pointerId) return;
    const moved = laneDrag.moved;
    const before = laneDrag.before;
    laneDrag = null;
    document.body.classList.remove('lane-dragging');
    if (moved) {
      if (modelChanged(before)) {
        pushHistory(before);
      }
      invalidateRoutes();
      renderAll();
    } else {
      renderToolbar();
    }
  }

  function startNodeDrag(e, nodeId) {
    if (e.button !== 0 || !isSelectTool() || zoomDrag || editingNodeId || editingEdgeId || editingMemoId || edgeGesture || placeGesture || placeMemoGesture || laneDrag) return;
    const node = model.nodes.find(n => n.id === nodeId);
    if (!node) return;
    selection = {kind:'node', id:nodeId};
    const p = eventToSvg(e);
    const global = nodeGlobalRect(node);
    drag = {
      kind: 'node',
      nodeId,
      pointerId:e.pointerId,
      start:p,
      startGlobalX:global.x,
      startY:global.y,
      nodeW: global.w,
      before:clone(model),
      moved:false,
      target: e.currentTarget
    };
    renderToolbar();
  }

  function clampNodeLocalX(node, localX) {
    const w = nodeSize(node).w;
    return clamp(localX, 10, LANE_WIDTH - w - 10);
  }

  window.addEventListener('pointermove', e => {
    if (zoomDrag && zoomDrag.pointerId === e.pointerId) {
      const dx = e.clientX - zoomDrag.startX;
      const dy = e.clientY - zoomDrag.startY;
      if (!zoomDrag.moved && Math.hypot(dx, dy) <= 3) return;
      zoomDrag.moved = true;
      const next = zoomDrag.startZoom + dx * 0.0025;
      setZoom(next, zoomDrag.pivotX, zoomDrag.pivotY);
      return;
    }
    if (edgeGesture && edgeGesture.pointerId === e.pointerId) {
      moveEdgeGesture(e);
      return;
    }
    if (placeMemoGesture) {
      updatePlaceMemoFromEvent(e);
      return;
    }
    if (placeGesture) {
      updatePlaceGestureFromEvent(e);
      return;
    }
    if (laneDrag && laneDrag.pointerId === e.pointerId) {
      moveLaneDrag(e);
      return;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.kind === 'memo') {
      const memo = ensureMemos().find(m => m.id === drag.memoId);
      if (!memo || !memosVisible) return;
      const p = eventToSvg(e);
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 3) return;
      if (!drag.moved) {
        drag.moved = true;
        memoClickStamp = { id: null, at: 0 };
        drag.target?.setPointerCapture?.(e.pointerId);
        drag.target?.classList.add('dragging');
      }
      const { width, height } = canvasSize();
      const pos = clampMemoPosition(
        drag.startX + dx,
        drag.startY + dy,
        drag.memoW || MEMO_W,
        drag.memoH || MEMO_MIN_H,
        width,
        height
      );
      memo.position.x = pos.x;
      memo.position.y = pos.y;
      scheduleLiveRender();
      return;
    }

    const node = model.nodes.find(n => n.id === drag.nodeId);
    if (!node) return;
    const p = eventToSvg(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) <= 3) return;
    if (!drag.moved) {
      drag.moved = true;
      nodeClickStamp = { id: null, at: 0 };
      drag.target?.setPointerCapture?.(e.pointerId);
      drag.target?.classList.add('dragging');
    }

    const actors = orderedActors();
    if (!actors.length) return;
    const origin = laneOriginX();
    const nodeW = drag.nodeW || nodeSize(node).w;
    const minX = origin;
    const maxX = origin + actors.length * LANE_WIDTH - nodeW;
    const globalX = clamp(drag.startGlobalX + dx, minX, maxX);
    const y = Math.max(LANE_HEADER_H + 20, drag.startY + dy);
    const laneIdx = clamp(Math.floor((globalX + nodeW / 2 - origin) / LANE_WIDTH), 0, actors.length - 1);
    const actor = actors[laneIdx];
    const localX = clamp(globalX - laneLeft(laneIdx), 10, LANE_WIDTH - nodeW - 10);
    node.actor_id = actor.id;
    node.position.x = clampNodeLocalX(node, snap(localX));
    node.position.y = Math.max(LANE_HEADER_H + 20, snap(y));
    scheduleLiveRender();
  });

  window.addEventListener('pointerup', e => {
    if (zoomDrag && zoomDrag.pointerId === e.pointerId) {
      if (!zoomDrag.moved) {
        const delta = (zoomDrag.shiftKey || e.shiftKey) ? -ZOOM_STEP : ZOOM_STEP;
        setZoom(zoom + delta, zoomDrag.pivotX, zoomDrag.pivotY);
      }
      cancelZoomDrag();
      return;
    }
    if (edgeGesture && edgeGesture.pointerId === e.pointerId) {
      endEdgeGesture(e);
      return;
    }
    if (laneDrag && laneDrag.pointerId === e.pointerId) {
      endLaneDrag(e);
      return;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    const before = drag.before;
    const target = drag.target;
    if (drag.kind === 'memo') {
      const memo = ensureMemos().find(m => m.id === drag.memoId);
      if (moved && memo) {
        const { width, height } = canvasSize();
        const size = memoSize(memo);
        const pos = clampMemoPosition(memo.position.x, memo.position.y, size.w, size.h, width, height);
        memo.position.x = pos.x;
        memo.position.y = pos.y;
      }
      drag = null;
      target?.classList.remove('dragging');
      if (moved) commitDrag(before);
      else renderToolbar();
      return;
    }
    const node = model.nodes.find(n => n.id === drag.nodeId);
    if (moved && node) {
      node.position.x = clampNodeLocalX(node, snap(node.position.x));
      node.position.y = Math.max(LANE_HEADER_H + 20, snap(node.position.y));
    }
    drag = null;
    target?.classList.remove('dragging');
    if (moved) commitDrag(before);
    else renderToolbar();
  });

  window.addEventListener('pointercancel', e => {
    if (zoomDrag && zoomDrag.pointerId === e.pointerId) {
      cancelZoomDrag();
      return;
    }
    if (edgeGesture && edgeGesture.pointerId === e.pointerId) {
      cancelEdgeGesture();
      renderAll();
      return;
    }
    if (laneDrag && laneDrag.pointerId === e.pointerId) {
      const before = laneDrag.before;
      const moved = laneDrag.moved;
      laneDrag = null;
      document.body.classList.remove('lane-dragging');
      if (moved && modelChanged(before)) {
        model = before;
      }
      renderAll();
      return;
    }
    if (drag && drag.pointerId === e.pointerId) {
      const moved = drag.moved;
      const before = drag.before;
      const target = drag.target;
      drag = null;
      target?.classList.remove('dragging');
      if (moved) commitDrag(before);
      else renderToolbar();
    }
  });

  function addActor() {
    let newId = null;
    mutate(() => {
      const prevCount = model.actors.length;
      const order = model.actors.length ? Math.max(...model.actors.map(a => Number(a.order)||0))+1 : 1;
      const actor = createLane(order);
      model.actors.push(actor);
      adjustOutsideMemosForLaneCountChange(prevCount, model.actors.length);
      selection = {kind:'actor', id:actor.id};
      newId = actor.id;
    });
    if (newId) beginLaneRename(newId);
  }

  function normalizeActorOrder() {
    orderedActors().forEach((a,i) => a.order = i+1);
  }

  function deleteActor(id) {
    const actor = model.actors.find(a => a.id === id);
    if (!actor) return;
    const count = model.nodes.filter(n => n.actor_id === id).length;
    if (count) {
      showToast(`レーン「${actor.label}」には ${count} 個のNodeが所属しているため削除できません。\n先にNodeを削除または別レーンへ移動してください。`, true);
      return;
    }
    if (!confirm(`レーン「${actor.label}」を削除しますか？`)) return;
    if (editingLaneId === id) {
      editingLaneId = null;
      laneRenameBefore = null;
    }
    if (editingMemoId) finishMemoEdit(true);
    mutate(() => {
      const prevCount = model.actors.length;
      model.actors = model.actors.filter(a => a.id !== id);
      normalizeActorOrder();
      adjustOutsideMemosForLaneCountChange(prevCount, model.actors.length);
      if (selection?.kind === 'actor' && selection.id === id) selection = null;
    });
  }

  function addNode(type) {
    beginPlaceNode(type);
  }

  function defaultNodeLabel(type) {
    return NODE_TYPE_LABELS[type] || '';
  }

  function beginPlaceNode(type) {
    if (!NODE_TYPES.includes(type)) return;
    if (!orderedActors().length) {
      showToast('Nodeを追加する前にレーンを追加してください。', true);
      return;
    }
    if (editingLaneId) finishLaneRename(true);
    if (editingNodeId) finishNodeRename(true);
    if (editingEdgeId) finishEdgeLabelEdit(false);
    if (editingMemoId) finishMemoEdit(true);
    if (edgeGesture) cancelEdgeGesture();
    if (placeMemoGesture) cancelPlaceMemoGesture();
    if (drag) {
      drag = null;
    }
    if (activeTool !== 'select') setActiveTool('select');
    placeGesture = {
      type,
      armed: false,
      placement: null,
      interrupt: null
    };
    // パレットクリック自体では確定しない
    requestAnimationFrame(() => {
      if (placeGesture) placeGesture.armed = true;
    });
    updatePlaceUI();
    renderPlaceGhost();
  }

  function cancelPlaceGesture() {
    if (!placeGesture) return;
    const hadInterrupt = !!placeGesture.interrupt;
    placeGesture = null;
    placeLayer.innerHTML = '';
    updatePlaceUI();
    if (hadInterrupt) {
      invalidateRoutes();
      renderCanvas();
    }
  }

  function updatePlaceUI() {
    canvasWrap.classList.toggle('placing', !!placeGesture || !!placeMemoGesture);
    nodePalette.querySelectorAll('[data-node-type]').forEach(btn => {
      btn.classList.toggle('placing-active', !!placeGesture && btn.dataset.nodeType === placeGesture.type);
    });
    nodePalette.querySelectorAll('[data-tool-memo]').forEach(btn => {
      btn.classList.toggle('placing-active', !!placeMemoGesture);
    });
  }

  function canInterruptWithType(type) {
    const probe = { type };
    return targetPortsFor(probe).includes('top') && sourcePortsFor(probe).length > 0;
  }

  function defaultOutgoingPort(type) {
    const ports = sourcePortsFor({ type });
    if (ports.includes('bottom')) return 'bottom';
    return ports[0] || null;
  }

  function interruptShiftAmount(placement) {
    return snap(placement.h + 80);
  }

  function ghostCenter(placement) {
    return {
      x: placement.globalX + placement.w / 2,
      y: placement.globalY + placement.h / 2
    };
  }

  function ghostRect(placement) {
    return {
      x: placement.globalX,
      y: placement.globalY,
      w: placement.w,
      h: placement.h
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function withPlaceShiftIgnored(fn) {
    const savedIgnore = ignorePlaceShift;
    ignorePlaceShift = true;
    try {
      return fn();
    } finally {
      ignorePlaceShift = savedIgnore;
    }
  }

  function nodeUnshiftedRect(node) {
    return withPlaceShiftIgnored(() => nodeGlobalRect(node));
  }

  function verticalSegmentsFromPoints(points) {
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (Math.abs(a.x - b.x) > 0.01) continue; // 横辺は対象外
      if (Math.abs(a.y - b.y) < 0.01) continue;
      segs.push({
        index: i,
        a: { ...a },
        b: { ...b },
        x: a.x,
        yMin: Math.min(a.y, b.y),
        yMax: Math.max(a.y, b.y)
      });
    }
    return segs;
  }

  function isGhostOnVerticalSegment(center, seg, pad) {
    if (center.y < seg.yMin - pad || center.y > seg.yMax + pad) return false;
    return Math.abs(center.x - seg.x) <= pad;
  }

  function stretchRoutePoints(points, segmentIndex, shiftY) {
    if (!points || points.length < 2 || !shiftY) {
      return (points || []).map(p => ({ ...p }));
    }
    const out = points.map(p => ({ ...p }));
    const start = out[segmentIndex];
    const end = out[segmentIndex + 1];
    if (!start || !end) return out;
    // 下側の端点以降を下げて、選択した縦辺だけを伸ばす
    if (end.y >= start.y) {
      for (let i = segmentIndex + 1; i < out.length; i++) out[i].y += shiftY;
    } else {
      for (let i = 0; i <= segmentIndex; i++) out[i].y += shiftY;
    }
    return out;
  }

  function interruptRenderKey(interrupt) {
    if (!interrupt) return '';
    return [
      interrupt.edgeId,
      interrupt.segmentIndex,
      interrupt.insertY,
      interrupt.shiftY,
      (interrupt.edgeIds || []).join(',')
    ].join('|');
  }

  // 同一source/portで、ゴースト位置の縦セグメントが重なるEdgeをまとめる
  function findCoincidentInterruptRoutes(primaryEdge, primarySeg, placement) {
    const center = ghostCenter(placement);
    const pad = INTERRUPT_HIT_Y;
    const primaryNorm = normalizeEdgePorts(primaryEdge);
    if (!primaryNorm || !primarySeg) return [];
    const routes = [];
    for (const edge of model.edges) {
      if (edge.source !== primaryEdge.source) continue;
      const normalized = normalizeEdgePorts(edge);
      if (!normalized) continue;
      if (normalized.source_port !== primaryNorm.source_port) continue;
      const bd = routeEdge(edge);
      if (!bd?.points || bd.points.length < 2) continue;
      for (const seg of verticalSegmentsFromPoints(bd.points)) {
        if (Math.abs(seg.x - primarySeg.x) > 0.01) continue;
        if (!isGhostOnVerticalSegment(center, seg, pad)) continue;
        routes.push({
          edgeId: edge.id,
          segmentIndex: seg.index,
          basePoints: bd.points.map(p => ({ ...p }))
        });
        break;
      }
    }
    return routes;
  }

  function createInterruptState(placement, hit) {
    const { edge, segmentIndex, basePoints } = hit;
    if (!model.nodes.find(n => n.id === edge.target)) return null;
    const primarySeg = verticalSegmentsFromPoints(basePoints).find(s => s.index === segmentIndex) || {
      index: segmentIndex,
      x: basePoints[segmentIndex]?.x ?? 0,
      yMin: Math.min(basePoints[segmentIndex]?.y ?? 0, basePoints[segmentIndex + 1]?.y ?? 0),
      yMax: Math.max(basePoints[segmentIndex]?.y ?? 0, basePoints[segmentIndex + 1]?.y ?? 0)
    };
    const routes = withPlaceShiftIgnored(() => {
      const found = findCoincidentInterruptRoutes(edge, primarySeg, placement);
      const list = found.length ? found : [{
        edgeId: edge.id,
        segmentIndex,
        basePoints: basePoints.map(p => ({ ...p }))
      }];
      return list.map(route => {
        if (route.edgeId === edge.id) {
          return {
            edgeId: edge.id,
            segmentIndex,
            basePoints: basePoints.map(p => ({ ...p }))
          };
        }
        return route;
      });
    });
    const primaryRoute = routes.find(r => r.edgeId === edge.id) || {
      edgeId: edge.id,
      segmentIndex,
      basePoints: basePoints.map(p => ({ ...p }))
    };
    return {
      edgeId: edge.id,
      edgeIds: routes.map(r => r.edgeId),
      routes,
      segmentIndex: primaryRoute.segmentIndex,
      basePoints: primaryRoute.basePoints.map(p => ({ ...p })),
      targetNodeId: edge.target,
      insertY: placement.y,
      shiftY: interruptShiftAmount(placement)
    };
  }

  function refreshInterruptState(placement, interrupt) {
    const edge = model.edges.find(e => e.id === interrupt.edgeId);
    if (!edge) return null;
    const targetId = interrupt.targetNodeId || edge.target;
    if (!model.nodes.find(n => n.id === targetId)) return null;
    return {
      ...interrupt,
      targetNodeId: edge.target,
      // insertY は開始時に固定。シフト量だけ配置サイズに追随
      shiftY: interruptShiftAmount(placement)
    };
  }

  // 開始: シフト前routeの縦セグメント上でヒット
  function findInterruptSegmentToStart(placement, type) {
    if (!placement || !canInterruptWithType(type)) return null;
    const center = ghostCenter(placement);
    const pad = INTERRUPT_HIT_Y;
    let best = null;
    let bestD = Infinity;
    return withPlaceShiftIgnored(() => {
      for (const edge of model.edges) {
        if (!normalizeEdgePorts(edge)) continue;
        const bd = routeEdge(edge);
        if (!bd?.points || bd.points.length < 2) continue;
        for (const seg of verticalSegmentsFromPoints(bd.points)) {
          if (!isGhostOnVerticalSegment(center, seg, pad)) continue;
          const d = Math.abs(center.x - seg.x);
          if (d < bestD) {
            bestD = d;
            best = {
              edge,
              segmentIndex: seg.index,
              basePoints: bd.points.map(p => ({ ...p }))
            };
          }
        }
      }
      return best;
    });
  }

  // 維持: 固定した縦セグメントのシフト後Y帯、または対象Nodeとの重なり
  function isInterruptStillActive(placement, interrupt, keepPad = INTERRUPT_HIT_KEEP) {
    if (!placement || !interrupt?.basePoints) return false;
    const edge = model.edges.find(e => e.id === interrupt.edgeId);
    if (!edge) return false;
    const stretch = interrupt.shiftY > 0 ? interrupt.shiftY : 0;
    const points = stretch > 0
      ? stretchRoutePoints(interrupt.basePoints, interrupt.segmentIndex, stretch)
      : interrupt.basePoints;
    const a = points[interrupt.segmentIndex];
    const b = points[interrupt.segmentIndex + 1];
    if (!a || !b) return false;
    const seg = {
      x: a.x,
      yMin: Math.min(a.y, b.y),
      yMax: Math.max(a.y, b.y)
    };
    const center = ghostCenter(placement);
    if (isGhostOnVerticalSegment(center, seg, keepPad)) return true;

    // Node本体をまたぐとき縦セグメント間の隙間で落ちないようにする
    const targetNode = model.nodes.find(n => n.id === interrupt.targetNodeId);
    if (!targetNode) return false;
    const nodeRect = nodeUnshiftedRect(targetNode);
    return !!(nodeRect && rectsOverlap(ghostRect(placement), nodeRect));
  }

  function resolvePlaceAt(type, svgPoint) {
    const actors = orderedActors();
    if (!actors.length) return null;
    const probe = {
      type,
      label: defaultNodeLabel(type),
      actor_id: actors[0].id,
      position: { x: 0, y: 0 }
    };
    const { w, h } = nodeSize(probe);
    const origin = laneOriginX();
    const laneIdx = clamp(
      Math.floor((svgPoint.x - origin) / LANE_WIDTH),
      0,
      actors.length - 1
    );
    const actor = actors[laneIdx];
    const rawLocalX = svgPoint.x - w / 2 - laneLeft(laneIdx);
    const rawY = svgPoint.y - h / 2;
    const localX = clamp(snap(rawLocalX), 10, LANE_WIDTH - w - 10);
    const y = Math.max(LANE_HEADER_H + 20, snap(rawY));
    return {
      actor_id: actor.id,
      localX,
      y,
      w,
      h,
      globalX: laneLeft(laneIdx) + localX,
      globalY: y
    };
  }

  function updatePlaceGestureFromEvent(e) {
    if (!placeGesture) return;
    const prevKey = interruptRenderKey(placeGesture.interrupt);
    const prevInterrupt = placeGesture.interrupt;
    const p = eventToSvg(e);
    placeGesture.placement = resolvePlaceAt(placeGesture.type, p);
    const placement = placeGesture.placement;

    if (prevInterrupt && isInterruptStillActive(placement, prevInterrupt)) {
      placeGesture.interrupt = refreshInterruptState(placement, prevInterrupt);
    } else if (placement) {
      const hit = findInterruptSegmentToStart(placement, placeGesture.type);
      placeGesture.interrupt = hit ? createInterruptState(placement, hit) : null;
    } else {
      placeGesture.interrupt = null;
    }

    const nextKey = interruptRenderKey(placeGesture.interrupt);
    if (prevKey !== nextKey) {
      invalidateRoutes();
      scheduleLiveRender();
    } else {
      renderPlaceGhost();
    }
  }

  function renderPlaceGhost() {
    placeLayer.innerHTML = '';
    if (placeMemoGesture?.placement) {
      const { x: mx, y: my, w, h } = placeMemoGesture.placement;
      const ghostStrokeCss = strokeCssFromUser(1.2);
      const x = pxSnapX(mx, ghostStrokeCss);
      const y = pxSnapY(my, ghostStrokeCss);
      const sw = pxSnapSize(w);
      const sh = pxSnapSize(h);
      const g = svgEl('g', {
        class: 'place-ghost memo-ghost',
        transform: `translate(${x},${y})`,
        'pointer-events': 'none'
      });
      appendMemoVisual(g, sw, sh, [''], { showText: false });
      placeLayer.appendChild(g);
      return;
    }
    if (!placeGesture?.placement) return;
    const { type } = placeGesture;
    const { globalX, globalY, w, h } = placeGesture.placement;
    const ghostStrokeCss = strokeCssFromUser(STROKE_NODE);
    const x = pxSnapX(globalX, ghostStrokeCss);
    const y = pxSnapY(globalY, ghostStrokeCss);
    const sw = pxSnapSize(w);
    const sh = pxSnapSize(h);
    const g = svgEl('g', {
      class: `place-ghost${placeGesture.interrupt ? ' interrupt' : ''}`,
      transform: `translate(${x},${y})`,
      'pointer-events': 'none'
    });
    const shape = nodeShape(type, sw, sh);
    shape.classList.add('node-shape');
    g.appendChild(shape);
    const label = defaultNodeLabel(type);
    const lines = wrapText(label, nodeWrapChars(type)).slice(0, NODE_MAX_LABEL_LINES);
    const startY = sh / 2 + (NODE_FONT_SIZE * 0.35) - ((lines.length - 1) * (NODE_LINE_HEIGHT / 2));
    lines.forEach((line, i) => {
      const t = svgEl('text', {
        x: sw / 2,
        y: startY + i * NODE_LINE_HEIGHT,
        class: 'node-text'
      });
      t.textContent = line;
      g.appendChild(t);
    });
    placeLayer.appendChild(g);
  }

  function commitPlaceNode() {
    if (!placeGesture?.armed || !placeGesture.placement) return false;
    const { type, placement, interrupt } = placeGesture;
    const outPort = interrupt ? defaultOutgoingPort(type) : null;
    if (interrupt && !outPort) {
      placeGesture.interrupt = null;
      invalidateRoutes();
      renderCanvas();
      return false;
    }
    placeGesture = null;
    placeLayer.innerHTML = '';
    updatePlaceUI();
    mutate(() => {
      if (interrupt?.shiftY && Number.isFinite(interrupt.insertY)) {
        model.nodes.forEach(n => {
          if (Number(n.position.y) >= interrupt.insertY) {
            n.position.y = snap(Number(n.position.y) + interrupt.shiftY);
          }
        });
      }

      const node = {
        id: makeId('nod'),
        actor_id: placement.actor_id,
        type,
        label: defaultNodeLabel(type),
        position: {
          x: placement.localX,
          y: placement.y
        }
      };
      model.nodes.push(node);

      if (interrupt) {
        // 割り込み: 既存エッジ（Y/N 等のラベル含む）は直前ノード→新ノードに残し、
        // 新ノード→旧接続先へ新規エッジを追加する
        const edgeIds = (interrupt.edgeIds?.length ? interrupt.edgeIds : [interrupt.edgeId])
          .filter(Boolean);
        const group = edgeIds
          .map(id => model.edges.find(e => e.id === id))
          .filter(e => e && normalizeEdgePorts(e));
        if (group.length) {
          const primary = group.find(e => e.id === interrupt.edgeId) || group[0];
          const outgoing = group.map(e => ({
            target: e.target,
            target_port: e.target_port
          }));

          primary.target = node.id;
          primary.target_port = 'top';

          const removeIds = new Set(
            group.filter(e => e.id !== primary.id).map(e => e.id)
          );
          if (removeIds.size) {
            model.edges = model.edges.filter(e => !removeIds.has(e.id));
          }

          const seenTargets = new Set();
          outgoing.forEach(t => {
            if (seenTargets.has(t.target)) return;
            seenTargets.add(t.target);
            model.edges.push({
              id: makeId('edg'),
              source: node.id,
              source_port: outPort,
              target: t.target,
              target_port: t.target_port,
              label: ''
            });
          });
        }
      }

      selection = { kind: 'node', id: node.id };
    });
    return true;
  }

  function deleteNode(id) {
    const node = model.nodes.find(n => n.id === id);
    if (!node) return;
    if (editingNodeId === id) {
      editingNodeId = null;
      nodeRenameBefore = null;
    }
    if (editingEdgeId) {
      const stillExists = model.edges.some(e => e.id === editingEdgeId && e.source !== id && e.target !== id);
      if (!stillExists) {
        editingEdgeId = null;
        edgeRenameBefore = null;
      }
    }
    mutate(() => {
      model.nodes = model.nodes.filter(n => n.id !== id);
      model.edges = model.edges.filter(e => e.source!==id && e.target!==id);
      if (selection?.kind==='node' && selection.id===id) selection=null;
      if (selection?.kind==='edge' && !model.edges.some(e => e.id === selection.id)) selection=null;
      if (edgeGesture?.nodeId === id || edgeGesture?.edgeId) {
        cancelEdgeGesture();
      }
    });
  }

  function deleteEdge(id) {
    if (editingEdgeId === id) {
      editingEdgeId = null;
      edgeRenameBefore = null;
    }
    mutate(() => {
      model.edges = model.edges.filter(e => e.id !== id);
      if (selection?.kind==='edge' && selection.id===id) selection=null;
    });
  }

  function validate(data) {
    const errors = [];
    const add = (code,msg) => errors.push(`${code}: ${msg}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {ok:false, errors:['E001: JSON root must be an object']};
    if (typeof data.schema_version !== 'string' || !data.schema_version) add('E010','schema_version is missing');
    if (!data.scenario || typeof data.scenario !== 'object' || Array.isArray(data.scenario)) add('E011','scenario is missing');
    if (!Array.isArray(data.actors)) add('E012','actors must be an array');
    if (!Array.isArray(data.nodes)) add('E013','nodes must be an array');
    if (!Array.isArray(data.edges)) add('E014','edges must be an array');
    if (data.memos != null && !Array.isArray(data.memos)) add('E015','memos must be an array');
    if (errors.length) return {ok:false,errors};

    const ids = new Set();
    const checkId = (id,kind) => {
      if (typeof id !== 'string' || !id) { add('E020',`${kind} has no valid id`); return; }
      if (ids.has(id)) add('E021',`duplicate id: ${id}`); else ids.add(id);
    };
    if (data.scenario) checkId(data.scenario.id,'scenario');
    data.actors.forEach(a => checkId(a?.id,'actor'));
    data.nodes.forEach(n => checkId(n?.id,'node'));
    data.edges.forEach(e => checkId(e?.id,'edge'));
    (data.memos || []).forEach(m => checkId(m?.id,'memo'));

    const actorIds = new Set(data.actors.map(a=>a?.id));
    const nodeIds = new Set(data.nodes.map(n=>n?.id));
    const nodesById = new Map(data.nodes.map(n => [n?.id, n]));
    data.nodes.forEach(n => {
      if (!actorIds.has(n.actor_id)) add('E102',`Node ${n.id || '(unknown)'} refers to unknown actor ${n.actor_id}`);
      if (!NODE_TYPES.includes(n.type)) add('E103',`Node ${n.id || '(unknown)'} has unknown type ${n.type}`);
      if (!n.position || !Number.isFinite(Number(n.position.x)) || !Number.isFinite(Number(n.position.y))) add('E104',`Node ${n.id || '(unknown)'} has invalid position`);
    });
    data.edges.forEach(e => {
      if (!nodeIds.has(e.source)) add('E201',`Edge ${e.id || '(unknown)'} refers to unknown source ${e.source}`);
      if (!nodeIds.has(e.target)) add('E202',`Edge ${e.id || '(unknown)'} refers to unknown target ${e.target}`);
      if (e.source === e.target) add('E206',`Edge ${e.id || '(unknown)'} connects the same node`);
      if (!PORTS.includes(e.source_port)) add('E203',`Edge ${e.id || '(unknown)'} has invalid source_port ${e.source_port}`);
      if (!PORTS.includes(e.target_port)) add('E204',`Edge ${e.id || '(unknown)'} has invalid target_port ${e.target_port}`);
      if (typeof e.label !== 'string') add('E205',`Edge ${e.id || '(unknown)'} has invalid label`);
      const sNode = nodesById.get(e.source);
      const tNode = nodesById.get(e.target);
      if (sNode && !sourcePortsFor(sNode).includes(e.source_port)) {
        add('E207',`Edge ${e.id || '(unknown)'} source_port ${e.source_port} is not a Source role for ${sNode.type}`);
      }
      if (tNode && !targetPortsFor(tNode).includes(e.target_port)) {
        add('E208',`Edge ${e.id || '(unknown)'} target_port ${e.target_port} is not a Target role for ${tNode.type}`);
      }
    });
    (data.memos || []).forEach(m => {
      if (typeof m.text !== 'string') add('E301',`Memo ${m.id || '(unknown)'} has invalid text`);
      if (!m.position || !Number.isFinite(Number(m.position.x)) || !Number.isFinite(Number(m.position.y))) {
        add('E302',`Memo ${m.id || '(unknown)'} has invalid position`);
      }
    });
    return {ok:errors.length===0, errors};
  }

  async function importJsonFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = validate(data);
      if (!result.ok) {
        showToast(`Import failed\n\n${result.errors.slice(0,12).join('\n')}${result.errors.length>12?`\n...and ${result.errors.length-12} more`:''}`, true, 9000);
        return;
      }
      model = clone(data);
      ensureMemos(model);
      model.actors.forEach((a,i) => { if (!Number.isFinite(Number(a.order))) a.order=i+1; });
      model.nodes.forEach(n => {
        const w = n.type === 'decision' ? DECISION_W : NODE_W;
        n.position.x = clamp(Number(n.position.x),10,LANE_WIDTH-w-10);
        n.position.y = Math.max(LANE_HEADER_H+20, Number(n.position.y));
        if (typeof n.label !== 'string') n.label = '';
      });
      model.edges.forEach(e => {
        if (typeof e.label !== 'string') e.label='';
        if ('type' in e) delete e.type;
      });
      model.memos.forEach(m => {
        if (typeof m.text !== 'string') m.text = '';
        m.position = {
          x: Number(m.position?.x) || 0,
          y: Math.max(LANE_HEADER_H + MEMO_CANVAS_PAD, Number(m.position?.y) || LANE_HEADER_H + 20)
        };
      });
      if (typeof model.scenario.name !== 'string') model.scenario.name='無題';
      if (typeof model.scenario.description !== 'string') model.scenario.description='';
      normalizeActorOrder();
      undoStack=[]; redoStack=[]; selection=null; cancelEdgeGesture(); cancelPlaceGesture(); cancelPlaceMemoGesture();
      clearInlineEditorState();
      markClean();
      invalidateRoutes();
      startupModal.classList.add('hidden');
      renderAll();
      model.memos.forEach(m => {
        const size = memoSize(m);
        const { width, height } = canvasSize();
        const pos = clampMemoPosition(m.position.x, m.position.y, size.w, size.h, width, height);
        m.position.x = pos.x;
        m.position.y = pos.y;
      });
      markClean();
      renderAll();
      showToast(`Import完了: ${file.name}`);
    } catch (err) {
      showToast(`Import failed\n${err.message}`, true, 7000);
    } finally {
      fileInput.value='';
    }
  }

  async function exportJson() {
    const result = validate(model);
    if (!result.ok) {
      showToast(`Exportを中止しました。Validation Error:\n${result.errors.join('\n')}`, true, 8000);
      return;
    }
    const json = JSON.stringify(model, null, 2);
    const filename = sanitizeFilename(model.scenario.name || '無題') + '.json';
    const blob = new Blob([json], {type:'application/json;charset=utf-8'});

    try {
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker({
          suggestedName:filename,
          types:[{description:'JSON',accept:{'application/json':['.json']}}]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      markClean();
      renderToolbar();
      showToast(`Export完了: ${filename}`);
    } catch (err) {
      if (err?.name !== 'AbortError') showToast(`Export failed\n${err.message}`, true, 7000);
    }
  }

  // --- Print export (browser print / A3 landscape) ---
  // 中間生成物: 8レーン・ブランクフォーム DOM + ノード/エッジ SVG オーバーレイ
  const PDF_A3_W_MM = 420;
  const PDF_A3_H_MM = 297;
  const PDF_MARGIN_MM = 10;
  const PDF_META_H_MM = 8;
  const PDF_FOOTER_H_MM = 8;
  const PDF_META_GAP_MM = 2;
  const PDF_LANE_COLUMNS = 8;
  const PRINT_SVG_CSS = `
    .node .node-shape { fill: #ffffff; stroke: #98a2b3; stroke-width: 1; }
    .node .node-text {
      fill: #17202a; font-size: 13px; font-weight: 650; text-anchor: middle;
      font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
    }
    .print-continue .print-continue-shape { fill: #ffffff; stroke: #667085; stroke-width: 1.4; }
    .print-continue .print-continue-text {
      fill: #344054; font-size: 12px; font-weight: 700; text-anchor: middle; dominant-baseline: middle;
      font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
    }
    .memo .memo-shape { fill: #ffe566; stroke: #d4b84a; stroke-width: 1.2; }
    .memo .memo-fold { fill: #f0d24a; stroke: #d4b84a; stroke-width: 1; }
    .memo .memo-text {
      fill: #3a3420; font-size: 12px; font-weight: 500; text-anchor: start; dominant-baseline: hanging;
      font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
    }
    .edge-group .edge-line { fill: none; stroke: #54626e; stroke-width: 1; }
    .edge-group.blocked .edge-line { stroke: #d92d20; stroke-dasharray: 7 6; stroke-width: 2; }
    .edge-halo { fill: none; stroke: transparent; stroke-width: 8; opacity: 0; }
    .edge-hit { fill: none; stroke: transparent; stroke-width: 14; }
    .edge-label-bg { fill: #ffffff; stroke: #dce2e8; }
    .edge-label-bg.yes { stroke: #abefc6; }
    .edge-label-bg.no { stroke: #fecdca; }
    .edge-label {
      fill: #35424d; font-size: 11px; text-anchor: middle; dominant-baseline: middle;
      font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
    }
    .edge-label.yes { fill: #067647; font-weight: 700; }
    .edge-label.no { fill: #b42318; font-weight: 700; }
  `;

  function formatExportDateTime(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function buildPrintDiagramSvg() {
    const prevZoom = zoom;
    const bak = {
      laneLayer, edgeLayer, nodeLayer, memoLayer, placeLayer, previewLayer, handlesLayer, nodeAddLayer, laneHeaderLayer
    };
    printMode = true;
    zoom = 1;
    // 画面はレーン中央寄せ、印刷は左詰め。経路キャッシュを共有すると X がずれる
    invalidateRoutes();
    try {
      const { width, height } = canvasSize();
      const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      root.setAttribute('width', String(width));
      root.setAttribute('height', String(height));
      root.setAttribute('viewBox', `0 0 ${width} ${height}`);

      const defs = svg.querySelector('defs');
      if (defs) root.appendChild(defs.cloneNode(true));
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = PRINT_SVG_CSS;
      root.appendChild(style);

      const gLane = svgEl('g');
      const gEdge = svgEl('g');
      const gNode = svgEl('g');
      const gMemo = svgEl('g');
      root.append(gLane, gEdge, gNode, gMemo);

      laneLayer = gLane;
      edgeLayer = gEdge;
      nodeLayer = gNode;
      memoLayer = gMemo;
      placeLayer = svgEl('g');
      previewLayer = svgEl('g');
      handlesLayer = svgEl('g');
      nodeAddLayer = svgEl('g');
      laneHeaderLayer = svgEl('g');

      // レーン枠は印刷フォーム DOM が担当。SVG はノード／エッジ／メモ（表示時のみ）
      model.edges.forEach(drawEdge);
      model.nodes.forEach(drawNode);
      if (memosVisible) ensureMemos().forEach(drawMemo);

      return { root, width, height, headerH: LANE_HEADER_H };
    } finally {
      laneLayer = bak.laneLayer;
      edgeLayer = bak.edgeLayer;
      nodeLayer = bak.nodeLayer;
      memoLayer = bak.memoLayer;
      placeLayer = bak.placeLayer;
      previewLayer = bak.previewLayer;
      handlesLayer = bak.handlesLayer;
      nodeAddLayer = bak.nodeAddLayer;
      laneHeaderLayer = bak.laneHeaderLayer;
      zoom = prevZoom;
      printMode = false;
      invalidateRoutes();
    }
  }

  function bandContentBottom(bandActors) {
    const ids = new Set(bandActors.map(a => a.id));
    let maxBottom = LANE_HEADER_H + 200;
    const prevPrint = printMode;
    printMode = true;
    try {
      for (const n of model.nodes) {
        if (!ids.has(n.actor_id)) continue;
        const r = nodeGlobalRect(n);
        if (r) maxBottom = Math.max(maxBottom, r.y + r.h + 48);
      }
      if (memosVisible) {
        const idxs = bandActors.map(a => actorIndex(a.id)).filter(i => i >= 0);
        if (idxs.length) {
          const x0 = laneLeft(Math.min(...idxs));
          const x1 = laneLeft(Math.max(...idxs)) + LANE_WIDTH;
          for (const memo of ensureMemos()) {
            const r = memoRect(memo);
            if (!r) continue;
            if (r.x + r.w > x0 - 40 && r.x < x1 + 40) {
              maxBottom = Math.max(maxBottom, r.y + r.h + 48);
            }
          }
        }
      }
    } finally {
      printMode = prevPrint;
    }
    return Math.ceil(maxBottom);
  }

  function buildPrintPageStyles(headerMm) {
    const pageH = PDF_A3_H_MM - PDF_MARGIN_MM * 2;
    return `
@page {
  size: A3 landscape;
  margin: ${PDF_MARGIN_MM}mm;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #17202a;
  font-family: "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-root { width: 100%; }
.print-page {
  width: 100%;
  height: ${pageH}mm;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.print-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.print-meta {
  height: ${PDF_META_H_MM}mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
  flex: 0 0 auto;
}
.print-meta .name {
  font-weight: 600;
  font-size: 3.6mm;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.print-meta .datetime {
  font-size: 3.2mm;
  flex: 0 0 auto;
}
.print-gap { height: ${PDF_META_GAP_MM}mm; flex: 0 0 auto; }
/* 帳票本体: 枠線は .print-form-grid（SVGの一本線）のみ。セルに border は付けない */
.print-sheet {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.print-form-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  z-index: 0;
}
.print-sheet-ui {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.print-lane-headers {
  display: grid;
  grid-template-columns: repeat(${PDF_LANE_COLUMNS}, 1fr);
  height: ${headerMm}mm;
  flex: 0 0 auto;
}
.print-lane-headers .cell {
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  padding: 0 1.2mm;
  font-size: ${Math.max(2.4, headerMm * 0.32)}mm;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.print-lane-bodies {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
.print-overlay-wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.print-overlay-svg {
  display: block;
  overflow: hidden;
}
.print-footer {
  height: ${PDF_FOOTER_H_MM}mm;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 3.2mm;
  flex: 0 0 auto;
}
`;
  }

  function createPrintHeaderLabels(bandActors) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < PDF_LANE_COLUMNS; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const actor = bandActors[i];
      cell.textContent = actor ? (actor.label || '(名称なし)') : '';
      frag.appendChild(cell);
    }
    return frag;
  }

  // 方眼グリッドを「一本の線」だけで描くテンプレート（セルborderは使わない）
  function buildPrintFormGridSvg(headerRatio) {
    const vbW = 800;
    const vbH = 1000;
    const headerY = Math.max(1, Math.min(vbH - 1, headerRatio * vbH));
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.setAttribute('class', 'print-form-grid');
    root.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
    root.setAttribute('preserveAspectRatio', 'none');
    root.setAttribute('aria-hidden', 'true');

    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grid.setAttribute('fill', 'none');
    grid.setAttribute('stroke', '#cfd6dd');
    grid.setAttribute('stroke-width', '1');
    grid.setAttribute('vector-effect', 'non-scaling-stroke');

    // 外枠（1本）
    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outer.setAttribute('x', '0.5');
    outer.setAttribute('y', '0.5');
    outer.setAttribute('width', String(vbW - 1));
    outer.setAttribute('height', String(vbH - 1));
    grid.appendChild(outer);

    // ヘッダー境界（横1本）
    const headerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerLine.setAttribute('x1', '0');
    headerLine.setAttribute('y1', String(headerY));
    headerLine.setAttribute('x2', String(vbW));
    headerLine.setAttribute('y2', String(headerY));
    grid.appendChild(headerLine);

    // レーン境界（縦7本）— 共有辺として1本だけ
    for (let i = 1; i < PDF_LANE_COLUMNS; i++) {
      const x = (vbW / PDF_LANE_COLUMNS) * i;
      const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      v.setAttribute('x1', String(x));
      v.setAttribute('y1', '0');
      v.setAttribute('x2', String(x));
      v.setAttribute('y2', String(vbH));
      grid.appendChild(v);
    }

    // レーン中心ガイド（ボディのみ・薄い線）
    const guides = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    guides.setAttribute('fill', 'none');
    guides.setAttribute('stroke', '#f3f6fa');
    guides.setAttribute('stroke-width', '1');
    guides.setAttribute('vector-effect', 'non-scaling-stroke');
    for (let i = 0; i < PDF_LANE_COLUMNS; i++) {
      const x = (vbW / PDF_LANE_COLUMNS) * (i + 0.5);
      const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      v.setAttribute('x1', String(x));
      v.setAttribute('y1', String(headerY));
      v.setAttribute('x2', String(x));
      v.setAttribute('y2', String(vbH));
      guides.appendChild(v);
    }

    root.append(grid, guides);
    return root;
  }

  // ホームベース型五角形（先端は常に下向き）
  function printContinuePolygonPoints(w, h) {
    const waist = h * 0.58;
    return `0,0 ${w},0 ${w},${waist} ${w / 2},${h} 0,${waist}`;
  }

  function createPrintContinueMarker({ x, y, label }) {
    const w = PRINT_CONTINUE_W;
    const h = PRINT_CONTINUE_H;
    const g = svgEl('g', {
      class: 'print-continue',
      transform: `translate(${x},${y})`,
      'aria-label': label
    });
    const shape = svgEl('polygon', {
      class: 'print-continue-shape',
      points: printContinuePolygonPoints(w, h)
    });
    const text = svgEl('text', {
      class: 'print-continue-text',
      x: w / 2,
      y: h * 0.38
    });
    text.textContent = label;
    g.append(shape, text);
    return g;
  }

  // マーカーの縦位置。position='above' はページ下端側の帯、'below' は上端側の帯
  function printContinueGeometry(boundaryY, position) {
    if (position === 'above') {
      const top = boundaryY - PRINT_CONTINUE_INSET - PRINT_CONTINUE_H;
      return { top, connectY: top, stemY: top - PRINT_CONTINUE_STEM };
    }
    const top = boundaryY + PRINT_CONTINUE_INSET;
    const tip = top + PRINT_CONTINUE_H;
    return { top, connectY: tip, stemY: tip + PRINT_CONTINUE_STEM };
  }

  // ポリラインのうち、cutY の指定side側にあって anchor 端を含む連続区間
  function polylineSideRun(points, cutY, side, anchor) {
    if (!points || points.length < 2) return null;
    const inside = p => side === 'above' ? p.y <= cutY + 0.01 : p.y >= cutY - 0.01;
    const idx = anchor === 'start' ? 0 : points.length - 1;
    if (!inside(points[idx])) return null;
    let lo = idx, hi = idx;
    while (lo - 1 >= 0 && inside(points[lo - 1])) lo--;
    while (hi + 1 < points.length && inside(points[hi + 1])) hi++;
    const run = points.slice(lo, hi + 1).map(p => ({ ...p }));
    const crossAt = (a, b) => {
      const dy = b.y - a.y;
      const t = Math.abs(dy) < 0.01 ? 0 : (cutY - a.y) / dy;
      return { x: a.x + (b.x - a.x) * t, y: cutY };
    };
    if (lo > 0) run.unshift(crossAt(points[lo - 1], points[lo]));
    if (hi < points.length - 1) run.push(crossAt(points[hi], points[hi + 1]));
    return run.length >= 2 ? run : null;
  }

  // ポリラインが y を横切る（または水平で載る）位置の X
  function polylineXAtY(points, y) {
    if (!points || points.length < 2) return null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      if (y < lo - 0.01 || y > hi + 0.01) continue;
      const dy = b.y - a.y;
      if (Math.abs(dy) < 0.01) return (a.x + b.x) / 2;
      return a.x + (b.x - a.x) * ((y - a.y) / dy);
    }
    return null;
  }

  // 帯上端で既に下側レーン寄りなら、帯の外でレーン移動済みとみなす。
  // → 移動済み: レーン → マーカー → ページ / 未移動: ページ → レーン（上側レーンにマーカー）
  function printContinueMarkerX(points, aboveRect, belowRect, boundaryY) {
    const aboveX = aboveRect.x + aboveRect.w / 2;
    const belowX = belowRect.x + belowRect.w / 2;
    if (Math.abs(aboveX - belowX) < 0.01) return aboveX;

    const bandTop = boundaryY - LAYOUT_PAGE_BREAK_BAND_ABOVE;
    // ガター経由もあり得るので、近い方のレーン中心へ吸着
    const xAt = polylineXAtY(points, bandTop);
    if (xAt == null) return aboveX;
    return Math.abs(xAt - belowX) <= Math.abs(xAt - aboveX) ? belowX : aboveX;
  }

  // boundaryY を上下にまたぐエッジ。
  // 帯の外でレーン移動済みならマーカーは下側レーン、未移動なら上側レーンに置く。
  function printCrossingEdgesAt(band, boundaryY) {
    const bandIds = new Set(band.bandActors.map(a => a.id));
    const out = [];
    for (const edge of model.edges) {
      const s = model.nodes.find(n => n.id === edge.source);
      const t = model.nodes.find(n => n.id === edge.target);
      if (!s || !t) continue;
      if (!bandIds.has(s.actor_id) && !bandIds.has(t.actor_id)) continue;
      const rs = nodeGlobalRect(s);
      const rt = nodeGlobalRect(t);
      if (!rs || !rt) continue;
      const sourceAbove = rs.y + rs.h / 2 < boundaryY;
      if (sourceAbove === (rt.y + rt.h / 2 < boundaryY)) continue;
      const bd = routeEdge(edge);
      if (!bd?.points || bd.points.length < 2) continue;
      const above = sourceAbove ? rs : rt;
      const below = sourceAbove ? rt : rs;
      out.push({
        edge,
        points: bd.points,
        sourceAbove,
        markerX: printContinueMarkerX(bd.points, above, below, boundaryY)
      });
    }
    return out;
  }

  // 既に置いたマーカーと重ならない中心X
  function resolvePrintContinueX(desired, placed, xMin, xMax) {
    const w = PRINT_CONTINUE_W;
    const lo = xMin + w / 2 + 4;
    const hi = Math.max(lo, xMax - w / 2 - 4);
    let x = clamp(desired, lo, hi);
    for (let guard = 0; guard < 32; guard++) {
      const conflict = placed.find(p => Math.abs(p - x) < w + 6);
      if (!conflict) break;
      const right = conflict + w + 6;
      if (right <= hi) { x = right; continue; }
      x = clamp(conflict - w - 6, lo, hi);
      break;
    }
    return x;
  }

  // マーカーとノードのポートを直交でつなぐ。
  // レーンが違う場合の横移動は、可能な限りページ帯の外側に置く。
  function printContinueSidePath(points, geo, keepSide, anchor, mx, boundaryY) {
    const run = polylineSideRun(points, geo.stemY, keepSide, anchor);
    if (!run) return null;
    const connect = { x: mx, y: geo.connectY };
    const port = anchor === 'start' ? run[0] : run[run.length - 1];
    if (Math.abs(port.x - mx) < 0.01) {
      return cleanPolyline(anchor === 'start' ? [port, connect] : [connect, port]);
    }
    const midY = (geo.connectY + port.y) / 2;
    const bandTop = boundaryY - LAYOUT_PAGE_BREAK_BAND_ABOVE;
    const bandBot = boundaryY + LAYOUT_PAGE_BREAK_BAND_BELOW;
    // マーカー直後の縦脚が角丸に足りないと r→0 でコーナーが消える
    const minAfterMarker = LAYOUT_CORNER_LEG;
    // 上側ページ: 帯上端以下、下側ページ: 帯下端以上で折り返す
    let transitY = keepSide === 'above'
      ? Math.min(midY, bandTop, geo.connectY - minAfterMarker)
      : Math.max(midY, bandBot, geo.connectY + minAfterMarker);
    return cleanPolyline(anchor === 'start'
      ? [port, { x: port.x, y: transitY }, { x: mx, y: transitY }, connect]
      : [connect, { x: mx, y: transitY }, { x: port.x, y: transitY }, port]);
  }

  function appendPrintContinueMarkers(overlay, {
    band, pageIndexInBand, pageNum, sliceY, sliceH
  }) {
    if (!overlay || band.pages <= 1) return;
    const layer = svgEl('g', { class: 'print-continue-layer' });
    const xMin = band.bandIndex * PDF_LANE_COLUMNS * LANE_WIDTH;
    const xMax = xMin + band.bandLaneCount * LANE_WIDTH;
    const cfg = routingSettings();

    const targets = [];
    if (pageIndexInBand > 0) {
      targets.push({
        boundaryY: pageBreakBoundaryY(pageIndexInBand),
        position: 'below',
        otherPage: pageNum - 1
      });
    }
    if (pageIndexInBand < band.pages - 1) {
      targets.push({
        boundaryY: pageBreakBoundaryY(pageIndexInBand + 1),
        position: 'above',
        otherPage: pageNum + 1
      });
    }

    for (const target of targets) {
      const geo = printContinueGeometry(target.boundaryY, target.position);
      if (geo.top < sliceY - 0.5 || geo.top + PRINT_CONTINUE_H > sliceY + sliceH + 0.5) continue;
      const keepSide = target.position === 'above' ? 'above' : 'below';
      const placed = [];

      for (const crossing of printCrossingEdgesAt(band, target.boundaryY)) {
        // このページに残るのが source 側か target 側か
        const sourceOnThisPage = (keepSide === 'above') === crossing.sourceAbove;
        const anchor = sourceOnThisPage ? 'start' : 'end';
        // 前後ページで同じ markerX（帯外レーン移動の有無で上側 or 下側レーン）
        if (crossing.markerX < xMin - 1 || crossing.markerX > xMax + 1) continue;
        const mx = resolvePrintContinueX(crossing.markerX, placed, xMin, xMax);
        placed.push(mx);

        const pts = printContinueSidePath(
          crossing.points, geo, keepSide, anchor, mx, target.boundaryY
        );
        if (!pts || pts.length < 2) continue;

        // 元のエッジは消し、マーカーで終端する2本に置き換える
        overlay.querySelectorAll(`[data-edge-id="${crossing.edge.id}"]`)
          .forEach(el => el.remove());

        const g = svgEl('g', { class: 'edge-group' });
        g.appendChild(svgEl('path', {
          d: roundedOrthogonalPath(pts, cfg.cornerRadius),
          class: 'edge-line',
          'marker-end': 'url(#arrow)'
        }));

        const text = crossing.edge.label || '';
        if (text && sourceOnThisPage) {
          const labelW = Math.max(36, [...text].length * 8 + 12);
          const mid = edgeLabelPoint(crossing.edge, { points: pts }, labelW);
          const tone = edgeLabelClass(text);
          g.appendChild(svgEl('rect', {
            x: mid.x - labelW / 2, y: mid.y - 10, width: labelW, height: 20,
            class: `edge-label-bg${tone ? ` ${tone}` : ''}`
          }));
          const tx = svgEl('text', {
            x: mid.x, y: mid.y + 1,
            class: `edge-label${tone ? ` ${tone}` : ''}`
          });
          tx.textContent = text;
          g.appendChild(tx);
        }
        layer.appendChild(g);

        const label = sourceOnThisPage
          ? `P.${target.otherPage}へ続く`
          : `P.${target.otherPage}の続き`;
        layer.appendChild(createPrintContinueMarker({
          x: mx - PRINT_CONTINUE_W / 2,
          y: geo.top,
          label
        }));
      }
    }

    if (layer.childNodes.length) overlay.appendChild(layer);
  }

  // 1ページ分の中間 DOM（グリッドSVGテンプレート + ラベル + ノード/エッジ）
  function buildPrintPageElement({
    diagramRoot, band, sliceY, sliceH, bodyUserPerPage, headerRatio,
    filename, datetime, page, totalPages, pageIndexInBand
  }) {
    const pageEl = document.createElement('section');
    pageEl.className = 'print-page';

    const meta = document.createElement('div');
    meta.className = 'print-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = filename;
    const dtEl = document.createElement('div');
    dtEl.className = 'datetime';
    dtEl.textContent = datetime;
    meta.append(nameEl, dtEl);

    const gap = document.createElement('div');
    gap.className = 'print-gap';

    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.appendChild(buildPrintFormGridSvg(headerRatio));

    const ui = document.createElement('div');
    ui.className = 'print-sheet-ui';

    const headers = document.createElement('div');
    headers.className = 'print-lane-headers';
    headers.appendChild(createPrintHeaderLabels(band.bandActors));

    const bodies = document.createElement('div');
    bodies.className = 'print-lane-bodies';

    const overlayWrap = document.createElement('div');
    overlayWrap.className = 'print-overlay-wrap';
    if (sliceH > 0.01 && band.bandLaneCount > 0) {
      const overlay = diagramRoot.cloneNode(true);
      const srcX = band.bandIndex * PDF_LANE_COLUMNS * LANE_WIDTH;
      const srcW = band.bandLaneCount * LANE_WIDTH;
      overlay.removeAttribute('width');
      overlay.removeAttribute('height');
      overlay.setAttribute('viewBox', `${srcX} ${sliceY} ${srcW} ${Math.max(sliceH, 0.01)}`);
      overlay.setAttribute('preserveAspectRatio', 'xMinYMin meet');
      overlay.classList.add('print-overlay-svg');
      overlay.style.width = `${(band.bandLaneCount / PDF_LANE_COLUMNS) * 100}%`;
      overlay.style.height = `${Math.min(1, sliceH / bodyUserPerPage) * 100}%`;
      appendPrintContinueMarkers(overlay, {
        band,
        pageIndexInBand,
        pageNum: page,
        sliceY,
        sliceH
      });
      overlayWrap.appendChild(overlay);
    }
    bodies.appendChild(overlayWrap);
    ui.append(headers, bodies);
    sheet.appendChild(ui);

    const footer = document.createElement('div');
    footer.className = 'print-footer';
    footer.textContent = `${page}/${totalPages}`;

    pageEl.append(meta, gap, sheet, footer);
    return pageEl;
  }

  // 全ページ分の印刷用 DOM ツリーを組み立てる
  function buildPrintDom({ diagram, bands, bodyUserPerPage, headerMm, bodyAvailMm, filename, datetime, totalPages }) {
    const root = document.createElement('div');
    root.className = 'print-root';
    const sheetH = headerMm + bodyAvailMm;
    const headerRatio = sheetH > 0 ? headerMm / sheetH : 0.1;

    // 印刷SVGは左詰め座標。継続マーカー位置計算も同じ原点に揃える
    const prevPrint = printMode;
    printMode = true;
    invalidateRoutes();
    try {
      let pageNum = 0;
      for (const band of bands) {
        for (let p = 0; p < band.pages; p++) {
          pageNum += 1;
          const sliceY = LANE_HEADER_H + p * bodyUserPerPage;
          const sliceH = Math.min(bodyUserPerPage, Math.max(0, band.contentBottom - sliceY));
          root.appendChild(buildPrintPageElement({
            diagramRoot: diagram.root,
            band,
            sliceY,
            sliceH,
            bodyUserPerPage,
            headerRatio,
            filename,
            datetime,
            page: pageNum,
            totalPages,
            pageIndexInBand: p
          }));
        }
      }
    } finally {
      printMode = prevPrint;
      invalidateRoutes();
    }
    return root;
  }

  function openPrintIframe(printRoot, headerMm) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('title', 'print-frame');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
      document.body.appendChild(iframe);

      const idoc = iframe.contentDocument;
      if (!idoc) {
        iframe.remove();
        reject(new Error('印刷用フレームを作成できませんでした'));
        return;
      }

      idoc.open();
      idoc.write('<!doctype html><html><head><meta charset="utf-8"><title>print</title></head><body></body></html>');
      idoc.close();

      const style = idoc.createElement('style');
      style.textContent = buildPrintPageStyles(headerMm);
      idoc.head.appendChild(style);
      idoc.body.appendChild(idoc.importNode(printRoot, true));

      const cleanup = () => {
        iframe.remove();
        resolve();
      };
      const win = iframe.contentWindow;
      win.addEventListener('afterprint', cleanup, { once: true });
      // afterprint が来ない環境向け
      setTimeout(() => {
        if (document.body.contains(iframe)) cleanup();
      }, 60_000);

      // レイアウト確定後に印刷
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            win.focus();
            win.print();
          } catch (err) {
            cleanup();
            reject(err);
          }
        });
      });
    });
  }

  async function exportPdf() {
    const actors = orderedActors();
    if (!actors.length) {
      showToast('PDF出力するレーンがありません。', true);
      return;
    }

    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.disabled = true;
    showToast('印刷用データを生成しています…', false, 60000);

    const savedSelection = selection;
    const savedHover = addHoverNodeId;
    const savedQuick = quickAddNodeId;
    selection = null;
    addHoverNodeId = null;
    quickAddNodeId = null;
    if (placeGesture) cancelPlaceGesture();
    if (placeMemoGesture) cancelPlaceMemoGesture();
    if (edgeGesture) cancelEdgeGesture();
    if (editingMemoId) finishMemoEdit(true);

    try {
      const diagram = buildPrintDiagramSvg();

      const contentWmm = PDF_A3_W_MM - PDF_MARGIN_MM * 2;
      const laneSlotMm = contentWmm / PDF_LANE_COLUMNS;
      const scaleMmPerUser = laneSlotMm / LANE_WIDTH;
      const headerMm = LANE_HEADER_H * scaleMmPerUser;
      const bodyAvailMm = PDF_A3_H_MM
        - PDF_MARGIN_MM * 2
        - PDF_META_H_MM
        - PDF_META_GAP_MM
        - PDF_FOOTER_H_MM
        - headerMm;
      if (bodyAvailMm < 20) throw new Error('ページ内の描画領域が不足しています');

      // 禁止帯の算出と必ず一致させる
      const bodyUserPerPage = printBodyUserPerPage();
      const bandCount = Math.ceil(actors.length / PDF_LANE_COLUMNS);
      const bands = [];
      for (let b = 0; b < bandCount; b++) {
        const bandActors = actors.slice(b * PDF_LANE_COLUMNS, (b + 1) * PDF_LANE_COLUMNS);
        const contentBottom = bandContentBottom(bandActors);
        const bodyUserTotal = Math.max(0, contentBottom - LANE_HEADER_H);
        const pages = Math.max(1, Math.ceil(bodyUserTotal / bodyUserPerPage));
        bands.push({
          bandIndex: b,
          bandActors,
          bandLaneCount: bandActors.length,
          pages,
          contentBottom
        });
      }
      const totalPages = bands.reduce((sum, b) => sum + b.pages, 0);
      const filenameBase = model.scenario.name || '無題';
      const datetime = formatExportDateTime();

      const printRoot = buildPrintDom({
        diagram,
        bands,
        bodyUserPerPage,
        headerMm,
        bodyAvailMm,
        filename: filenameBase,
        datetime,
        totalPages
      });

      showToast('印刷ダイアログで「PDFに保存」またはプリンターを選択してください。', false, 6000);
      await openPrintIframe(printRoot, headerMm);
    } catch (err) {
      showToast(`印刷の準備に失敗しました\n${err.message || err}`, true, 8000);
    } finally {
      selection = savedSelection;
      addHoverNodeId = savedHover;
      quickAddNodeId = savedQuick;
      if (pdfBtn) pdfBtn.disabled = false;
      renderAll();
    }
  }

  function sanitizeFilename(name) {
    let s = String(name).replace(/[\\/:*?"<>|]/g,'_').replace(/[. ]+$/g,'').trim();
    if (!s) s='無題';
    const reserved=/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reserved.test(s)) s=`_${s}`;
    return s.slice(0,180);
  }

  function newScenario() {
    if (isDirty() && !confirm('未Exportの変更があります。破棄して新規Scenarioを作成しますか？')) return;
    clearInlineEditorState();
    model = createScenario();
    selection = null;
    cancelEdgeGesture();
    cancelPlaceGesture();
    cancelPlaceMemoGesture();
    undoStack = [];
    redoStack = [];
    markClean();
    startupModal.classList.add('hidden');
    addActor();
    undoStack = [];
    redoStack = [];
    markClean();
    renderToolbar();
  }

  function showToast(message, error=false, duration=3500) {
    clearTimeout(toastTimer);
    toastEl.textContent=message;
    toastEl.className=`toast show${error?' error':''}`;
    toastTimer=setTimeout(()=>toastEl.className='toast',duration);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function attr(s) { return escapeHtml(s); }

  nodePalette.addEventListener('click', e => {
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn) {
      setActiveTool(toolBtn.dataset.tool);
      return;
    }
    const memoBtn = e.target.closest('[data-tool-memo]');
    if (memoBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (placeMemoGesture) {
        cancelPlaceMemoGesture();
        renderAll();
        return;
      }
      beginPlaceMemo();
      return;
    }
    const b = e.target.closest('[data-node-type]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const type = b.dataset.nodeType;
    if (placeGesture?.type === type) {
      cancelPlaceGesture();
      return;
    }
    beginPlaceNode(type);
  });

  memoVisibleToggle?.addEventListener('change', () => {
    setMemosVisible(memoVisibleToggle.checked);
  });

  quickPalette.addEventListener('click', e => {
    const btn = e.target.closest('[data-node-type]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId = quickAddNodeId;
    closeQuickAddPalette();
    quickAddNodeFrom(sourceId, btn.dataset.nodeType);
  });

  // +ボタン / 展開中パレットの外側を触ったら閉じる
  window.addEventListener('pointerdown', e => {
    if (!quickAddNodeId) return;
    if (e.target.closest?.('#quickNodePalette, .node-add-btn')) return;
    closeQuickAddPalette();
  }, true);

  canvasWrap.addEventListener('pointermove', updateAddHoverFromEvent, {passive: true});
  canvasWrap.addEventListener('pointerleave', () => setAddHoverNode(null));

  canvasWrap.addEventListener('pointerdown', e => {
    if (!editingEdgeId || e.button !== 0) return;
    if (e.target.closest('#edgeRenameInput, .edge-rename-input')) return;
    const edgeEl = e.target.closest?.('.edge-group');
    if (edgeEl && edgeEl.getAttribute('data-edge-id') === editingEdgeId) return;
    finishEdgeLabelEdit(false);
  }, true);

  canvasWrap.addEventListener('pointerdown', e => {
    if (placeMemoGesture) {
      if (e.button !== 0) return;
      if (e.target.closest('#nodePalette, .tool-palette, button, input, textarea, select, .lane-header-sticky, .lane-add-btn, .lane-control')) return;
      if (!placeMemoGesture.armed) return;
      e.preventDefault();
      e.stopPropagation();
      updatePlaceMemoFromEvent(e);
      commitPlaceMemo();
      return;
    }
    if (!placeGesture || e.button !== 0) return;
    if (e.target.closest('#nodePalette, .tool-palette, button, input, textarea, select, .lane-header-sticky, .lane-add-btn, .lane-control')) return;
    if (!placeGesture.armed) return;
    e.preventDefault();
    e.stopPropagation();
    updatePlaceGestureFromEvent(e);
    commitPlaceNode();
  }, true);

  canvasWrap.addEventListener('scroll', () => {
    updateFloatPalettePosition();
    syncQuickAddPalette();
    syncNodeRenameInput();
    syncMemoRenameInput();
    syncEdgeLabelInput();
  }, {passive: true});

  const fileMenuBtn = document.getElementById('fileMenuBtn');
  const fileMenuDropdown = document.getElementById('fileMenuDropdown');
  const fileMenuWrap = document.getElementById('fileMenuWrap');

  function setFileMenuOpen(open) {
    if (!fileMenuBtn || !fileMenuDropdown) return;
    fileMenuDropdown.classList.toggle('hidden', !open);
    fileMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    fileMenuBtn.classList.toggle('open', open);
  }

  function isFileMenuOpen() {
    return !!fileMenuDropdown && !fileMenuDropdown.classList.contains('hidden');
  }

  fileMenuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    setFileMenuOpen(!isFileMenuOpen());
  });
  document.getElementById('newBtn').addEventListener('click', () => {
    setFileMenuOpen(false);
    newScenario();
  });
  document.getElementById('importBtn').addEventListener('click', () => {
    setFileMenuOpen(false);
    fileInput.click();
  });
  window.addEventListener('pointerdown', e => {
    if (!isFileMenuOpen()) return;
    if (fileMenuWrap?.contains(e.target)) return;
    setFileMenuOpen(false);
  }, true);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isFileMenuOpen()) {
      e.preventDefault();
      setFileMenuOpen(false);
    }
  });

  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('arrangeBtn').addEventListener('click', autoArrangeNodes);
  document.getElementById('exportBtn').addEventListener('click', exportJson);
  document.getElementById('pdfBtn').addEventListener('click', exportPdf);
  document.getElementById('startupNewBtn').addEventListener('click', newScenario);
  document.getElementById('startupImportBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) importJsonFile(fileInput.files[0]); });

  flowNameDisplay.addEventListener('click', beginFlowNameEdit);
  flowName.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finishFlowNameEdit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishFlowNameEdit(false);
    }
  });
  flowName.addEventListener('blur', () => finishFlowNameEdit(true));
  flowName.addEventListener('input', () => {
    model.scenario.name = flowName.value;
    const dirty = isDirty();
    dirtyMark.style.visibility = dirty ? 'visible' : 'hidden';
    document.title = `${flowName.value || '無題'}${dirty ? ' *' : ''} - Operational Scenario Editor`;
  });

  svg.addEventListener('click', e => {
    if (!isSelectTool() || placeGesture) return;
    if (e.target === svg) {
      selection = null;
      renderAll();
    }
  });

  headerSvg.addEventListener('click', e => {
    if (!isSelectTool() || placeGesture) return;
    if (e.target === headerSvg) {
      selection = null;
      renderAll();
    }
  });

  zoomInBtn.addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
  zoomOutBtn.addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
  zoomInput.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseZoomInput(zoomInput.value);
      if (parsed != null) setZoom(parsed);
      else updateZoomUI();
      zoomInput.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      updateZoomUI();
      zoomInput.blur();
    }
  });
  zoomInput.addEventListener('blur', () => {
    const parsed = parseZoomInput(zoomInput.value);
    if (parsed != null) setZoom(parsed);
    else updateZoomUI();
  });

  canvasWrap.addEventListener('pointerdown', e => {
    if (!isZoomTool() || e.button !== 0 || zoomDrag) return;
    if (e.target.closest('input, textarea, select, button')) return;
    e.preventDefault();
    e.stopPropagation();
    beginZoomDrag(e);
  }, true);

  window.addEventListener('keydown', e => {
    const tag=document.activeElement?.tagName;
    const typing=['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'v') { e.preventDefault(); setActiveTool('select'); return; }
      if (key === 'z') { e.preventDefault(); setActiveTool('zoom'); return; }
    }
    if ((e.ctrlKey||e.metaKey) && !typing && e.key.toLowerCase()==='z') { e.preventDefault(); e.shiftKey?redo():undo(); }
    else if ((e.ctrlKey||e.metaKey) && !typing && e.key.toLowerCase()==='y') { e.preventDefault(); redo(); }
    else if (!typing && e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && toggleQuickAddForSelection()) {
      e.preventDefault();
    }
    else if (!typing && quickAddNodeId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveQuickAddFocus((e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1);
    }
    else if (!typing && quickAddNodeId && e.key === 'Enter') {
      e.preventDefault();
      confirmQuickAddFocus();
    }
    else if (!typing && e.key==='Escape' && quickAddNodeId) {
      e.preventDefault();
      closeQuickAddPalette();
    }
    else if (!typing && e.key==='Escape' && (edgeGesture || placeGesture || placeMemoGesture)) {
      e.preventDefault();
      cancelEdgeGesture();
      cancelPlaceGesture();
      cancelPlaceMemoGesture();
      renderAll();
    }
    else if (!typing && (e.key==='Delete'||e.key==='Backspace') && selection) {
      e.preventDefault();
      if (selection.kind==='node') deleteNode(selection.id);
      else if (selection.kind==='edge') deleteEdge(selection.id);
      else if (selection.kind==='actor') deleteActor(selection.id);
      else if (selection.kind==='memo') deleteMemo(selection.id);
    }
  });

  window.addEventListener('blur', () => {
    cancelZoomDrag();
  });

  window.addEventListener('beforeunload', e => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue='';
  });

  window.addEventListener('resize', () => {
    renderCanvas();
    updateFloatPalettePosition();
    syncQuickAddPalette();
  });

  updateZoomUI();
  updateToolUI();
  buildQuickPalette();
  renderAll();
})();
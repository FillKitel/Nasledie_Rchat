(function (root) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function create({ sourceWidth, sourceHeight, viewport, zoom = 1 }) {
    if (!(sourceWidth > 0 && sourceHeight > 0 && viewport > 0)) {
      throw new Error("Некорректный размер изображения");
    }
    return normalize({
      sourceWidth,
      sourceHeight,
      viewport,
      zoom,
      panX: 0,
      panY: 0,
    });
  }

  function normalize(state) {
    const zoom = clamp(Number(state.zoom) || 1, 1, 3);
    const baseScale = Math.max(
      state.viewport / state.sourceWidth,
      state.viewport / state.sourceHeight,
    );
    const scale = baseScale * zoom;
    const maxPanX = Math.max(
      0,
      (state.sourceWidth * scale - state.viewport) / 2,
    );
    const maxPanY = Math.max(
      0,
      (state.sourceHeight * scale - state.viewport) / 2,
    );
    const panX = maxPanX
      ? clamp(Number(state.panX) || 0, -maxPanX, maxPanX)
      : 0;
    const panY = maxPanY
      ? clamp(Number(state.panY) || 0, -maxPanY, maxPanY)
      : 0;
    return {
      ...state,
      zoom,
      panX,
      panY,
      scale,
      maxPanX,
      maxPanY,
    };
  }

  function setZoom(state, zoom) {
    return normalize({ ...state, zoom });
  }

  function move(state, deltaX, deltaY) {
    return normalize({
      ...state,
      panX: state.panX + Number(deltaX || 0),
      panY: state.panY + Number(deltaY || 0),
    });
  }

  function sourceRect(state) {
    const cropSize = state.viewport / state.scale;
    return {
      x: (state.sourceWidth - cropSize) / 2 - state.panX / state.scale,
      y: (state.sourceHeight - cropSize) / 2 - state.panY / state.scale,
      size: cropSize,
    };
  }

  const api = { create, setZoom, move, sourceRect };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MayakAvatarCrop = api;
})(typeof window !== "undefined" ? window : this);

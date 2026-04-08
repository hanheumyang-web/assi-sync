/**
 * ElementRenderer.jsx — 개별 요소 렌더링 + 분산 이벤트 핸들러
 *
 * 핵심: 각 요소/핸들에 직접 onMouseDown 바인딩 (stopPropagation)
 * → DOM 버블링으로 자연스럽게 우선순위: 핸들 > 요소 > 캔버스
 */

import { computeCover } from '../../utils/templateMatcher'

const HANDLES = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
const CURSORS = { nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', w: 'w-resize', e: 'e-resize', sw: 'sw-resize', s: 's-resize', se: 'se-resize' }

export default function ElementRenderer({
  el, es, isSel, isCropMode, isDragOver, pageBg,
  handlers, cropModeElId,
  editingTextId, onTextChange, onTextBlur,
  onDelete, onCropToggle,
}) {
  const isEdit = editingTextId === el.id
  const base = {
    position: 'absolute',
    left: el.x * es, top: el.y * es,
    width: el.w * es, height: el.h * es,
    zIndex: isCropMode ? 40 : undefined,
  }

  return (
    <div
      id={`el-${el.id}`}
      style={base}
      className={isSel ? 'ring-2 ring-[#F4A259]' : ''}
      onMouseDown={e => handlers.handleElementMouseDown(e, el)}
      onDoubleClick={e => handlers.handleElementDoubleClick(e, el)}
    >
      {/* ── 이미지 ── */}
      {el.type === 'image' && (() => {
        const { imgW, imgH } = computeCover(el.ratio || 1.5, el.w, el.h, el.cropZoom || 1)
        const cropXpx = (el.cropX || 0) * es, cropYpx = (el.cropY || 0) * es
        const imgWpx = imgW * es, imgHpx = imgH * es
        return (
          <>
            {/* 크롭모드: 프레임 밖 반투명 이미지 */}
            {isCropMode && (
              <img src={el.url} alt="" draggable={false}
                className="absolute pointer-events-none select-none z-0"
                style={{ width: imgWpx, height: imgHpx, left: cropXpx, top: cropYpx, maxWidth: 'none', opacity: 0.45 }} />
            )}
            {/* 프레임 (overflow hidden) */}
            <div className="w-full h-full overflow-hidden relative"
              style={{ background: isCropMode ? 'transparent' : (pageBg || '#f0f0f0') }}>
              <img src={el.url} alt="" draggable={false}
                className="absolute pointer-events-none select-none"
                style={{ width: imgWpx, height: imgHpx, left: cropXpx, top: cropYpx, maxWidth: 'none' }} />
            </div>
            {/* 크롭 뱃지 */}
            {isCropMode && (
              <div className="absolute inset-0 ring-2 ring-[#F59E0B] ring-inset pointer-events-none z-20">
                <div className="absolute top-1 left-1 bg-[#F59E0B] text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                  ✥ CROP · 드래그로 위치 조정 {el.cropZoom > 1 ? `· ${Math.round(el.cropZoom * 100)}%` : ''}
                </div>
              </div>
            )}
            {/* 드롭 하이라이트 */}
            {isDragOver && (
              <div className="absolute inset-0 border-2 border-dashed border-[#F4A259] rounded-[4px] z-30 pointer-events-none flex items-center justify-center">
                <span className="text-[10px] font-bold text-[#F4A259] bg-white/80 px-2 py-0.5 rounded">드롭하여 교체</span>
              </div>
            )}
          </>
        )
      })()}

      {/* ── 텍스트 ── */}
      {el.type === 'text' && (isEdit ? (
        <textarea autoFocus value={el.text}
          onChange={e => onTextChange(el.id, e.target.value)}
          onBlur={() => onTextBlur()}
          onKeyDown={e => e.key === 'Escape' && onTextBlur()}
          className="w-full h-full bg-transparent outline-none resize-none p-0"
          style={{ fontSize: el.fontSize * es * 0.75, fontWeight: el.fontWeight, color: el.color, textAlign: el.align, lineHeight: 1.3 }} />
      ) : (
        <div className="w-full h-full overflow-visible whitespace-pre-wrap"
          style={{ fontSize: el.fontSize * es * 0.75, fontWeight: el.fontWeight, color: el.color, textAlign: el.align, lineHeight: 1.3 }}>
          {el.text}
        </div>
      ))}

      {/* ── 도형 ── */}
      {el.type === 'shape' && (
        <div className="w-full h-full" style={{ background: el.color, opacity: el.opacity ?? 0.2 }} />
      )}

      {/* ── 선택 UI ── */}
      {isSel && !isEdit && (
        <>
          {/* 상단 라벨 + 크롭/삭제 버튼 */}
          <div className="absolute -top-7 left-0 flex items-center gap-1 z-10">
            <div className="bg-[#F4A259] text-white text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap">
              {el.type === 'image' ? `${Math.round(el.w)}×${Math.round(el.h)}` : el.type === 'text' ? `텍스트 ${el.fontSize}pt` : '도형'}
            </div>
            {el.type === 'image' && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onCropToggle(el.id) }}
                className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isCropMode ? 'bg-[#F59E0B] text-white' : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
                }`}>
                ✥ {isCropMode ? '완료' : '크롭'}
              </button>
            )}
          </div>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete(el.id) }}
            className="absolute -top-7 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600 z-10 cursor-pointer">
            ×
          </button>

          {/* 4 모서리 리사이즈 핸들 (nw, ne, sw, se만 — 변 핸들 제거로 오작동 방지) */}
          {['nw', 'ne', 'sw', 'se'].map(h => {
            const style = {}
            if (h.includes('n')) style.top = -6
            if (h.includes('s')) style.bottom = -6
            if (h.includes('w')) style.left = -6
            if (h.includes('e')) style.right = -6
            return (
              <div key={h}
                className="absolute z-10 flex items-center justify-center"
                style={{ ...style, width: 22, height: 22, cursor: CURSORS[h] }}
                onMouseDown={e => handlers.handleHandleMouseDown(e, el, h)}>
                <div className="w-3 h-3 bg-white border-2 border-[#F4A259] rounded-full shadow-sm" />
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

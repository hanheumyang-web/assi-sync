/**
 * ImageSidebar.jsx — 우측 이미지 패널 (프로젝트별 아코디언, 드래그 소스)
 */

import { useState } from 'react'

export default function ImageSidebar({ projectAssets, projects, selectedProjectIds, currentProjectName, localProjects }) {
  const [expanded, setExpanded] = useState({})

  // 현재 페이지 프로젝트를 기본 펼침
  const isExpanded = (pid) => {
    if (expanded[pid] !== undefined) return expanded[pid]
    const pr = projects.find(p => p.id === pid)
    return pr?.name === currentProjectName
  }

  const toggle = (pid) => setExpanded(prev => ({ ...prev, [pid]: !isExpanded(pid) }))

  const handleDragStart = (e, asset) => {
    e.dataTransfer.setData('application/x-pdf-image', JSON.stringify({
      url: asset.url,
      ratio: asset.ratio || 1.5,
    }))
    e.dataTransfer.effectAllowed = 'copy'
    // 드래그 고스트
    const ghost = e.target.cloneNode(true)
    ghost.style.width = '60px'
    ghost.style.height = '60px'
    ghost.style.borderRadius = '8px'
    ghost.style.opacity = '0.8'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 30, 30)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  return (
    <div className="space-y-1.5">
      {selectedProjectIds.map(pid => {
        const localProj = (localProjects || []).find(lp => lp.id === pid)
        const pr = localProj || projects.find(p => p.id === pid)
        if (!pr) return null
        const assets = localProj?.assets || projectAssets[pid] || []
        const open = isExpanded(pid)
        return (
          <div key={pid}>
            <button onClick={() => toggle(pid)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-[8px] hover:bg-[#F4F3EE] transition-all">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-[10px] font-bold text-gray-900 truncate">{pr.name}</span>
              </div>
              <span className="text-[9px] text-gray-400 flex-shrink-0">{assets.length}장</span>
            </button>
            {open && (
              <div className="grid grid-cols-4 gap-1 px-1 pb-1.5">
                {assets.map(asset => (
                  <img key={asset.id} src={asset.url} alt=""
                    draggable
                    onDragStart={e => handleDragStart(e, asset)}
                    className="aspect-square rounded-[6px] object-cover cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-[#828DF8] transition-all"
                  />
                ))}
                {!assets.length && (
                  <p className="col-span-4 text-[9px] text-gray-300 text-center py-2">이미지 없음</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

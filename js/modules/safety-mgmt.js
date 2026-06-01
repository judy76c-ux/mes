/**
 * 안전 관리 모듈 (safety-mgmt.js)
 * SafetyProcessUI, SafetyImageEditor, SafetyHubModule,
 * SafetyStandardModule, MSDSModule, SafetyChecklistModule,
 * PPEStandardModule, SafetyRulesModule
 */

/* ════════════════════════════════════════════════════════════════════
   공통 유틸
════════════════════════════════════════════════════════════════════ */
var SafetyCommon = (function () {
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function js(v) {
        return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
    }
    function today() {
        return (typeof UIUtils !== 'undefined' && UIUtils.today)
            ? UIUtils.today() : new Date().toISOString().slice(0, 10);
    }
    async function load(key) {
        try {
            const rows = await Storage.getConfigValue(key);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[Safety] load failed:', key, e);
            return [];
        }
    }
    async function save(key, rows) {
        await Storage.setConfigValue(key, Array.isArray(rows) ? rows : []);
    }
    function genId() {
        return (typeof Storage !== 'undefined' && Storage.generateId)
            ? Storage.generateId()
            : Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return { esc, js, today, load, save, genId };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyProcessUI — 공통 네비게이션 타일
════════════════════════════════════════════════════════════════════ */
var SafetyProcessUI = (function () {
    const MENUS = [
        { id: 'safety-hub',       label: '안전관리',        icon: 'shield',         accent: '#dc2626' },
        { id: 'safety-standard',  label: '안전관리 표준서', icon: 'menu_book',      accent: '#2563eb' },
        { id: 'safety-msds',      label: 'MSDS 등록대장',   icon: 'science',        accent: '#7c3aed' },
        { id: 'safety-checklist', label: '안전관리 점검표', icon: 'checklist',      accent: '#059669' },
        { id: 'safety-ppe',       label: '보호구 적용기준', icon: 'security',       accent: '#d97706' },
        { id: 'safety-rules',     label: '안전수칙 기준서', icon: 'gavel',          accent: '#0891b2' }
    ];

    function renderSection(activePage, title, desc) {
        const tiles = MENUS.map(function (m) {
            const active = m.id === activePage;
            const borderStyle = active
                ? `border-left:4px solid ${m.accent};background:var(--bg-primary);`
                : 'border-left:4px solid transparent;background:var(--bg-secondary);';
            const iconBg = active ? m.accent : 'var(--border-color)';
            const iconColor = active ? '#fff' : 'var(--text-muted)';
            const checkIcon = active
                ? `<span class="material-symbols-outlined" style="position:absolute;top:6px;right:6px;font-size:14px;color:${m.accent};">check_circle</span>`
                : '';
            return `
                <div onclick="Router.navigate('${m.id}')"
                     style="position:relative;cursor:pointer;border-radius:10px;padding:10px 14px;
                            display:flex;align-items:center;gap:10px;min-width:140px;
                            border:1px solid var(--border-color);${borderStyle}
                            transition:box-shadow .15s;user-select:none;"
                     onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,.10)'"
                     onmouseout="this.style.boxShadow='none'">
                    <div style="width:34px;height:34px;border-radius:8px;background:${iconBg};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:${iconColor};">${m.icon}</span>
                    </div>
                    <span style="font-size:0.82rem;font-weight:${active ? '700' : '500'};
                                 color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};">${m.label}</span>
                    ${checkIcon}
                </div>
            `;
        }).join('');

        return `
            <div style="margin-bottom:20px;">
                <div style="margin-bottom:12px;">
                    <h3 style="margin:0 0 4px;font-size:1.15rem;">${SafetyCommon.esc(title)}</h3>
                    <p style="margin:0;color:var(--text-muted);font-size:.88rem;">${SafetyCommon.esc(desc || '')}</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">${tiles}</div>
            </div>
        `;
    }

    return { renderSection };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyImageEditor — 이미지 첨부 드래그/리사이즈 헬퍼
════════════════════════════════════════════════════════════════════ */
var SafetyImageEditor = (function () {
    let _drag = null;   // { el, startX, startY, origLeft, origTop }
    let _resize = null; // { el, startX, startY, origW, origH }

    // 한 번만 글로벌 이벤트 등록
    let _listenersAttached = false;
    function _attachListeners() {
        if (_listenersAttached) return;
        _listenersAttached = true;

        document.addEventListener('mousedown', function (e) {
            const resizeHandle = e.target.closest('.safety-img-resize');
            const imgItem = e.target.closest('.safety-img-item');
            if (resizeHandle && imgItem) {
                e.preventDefault();
                const rect = imgItem.getBoundingClientRect();
                _resize = {
                    el: imgItem,
                    startX: e.clientX,
                    startY: e.clientY,
                    origW: imgItem.offsetWidth,
                    origH: imgItem.offsetHeight
                };
            } else if (imgItem && !e.target.closest('.safety-img-delete') && !e.target.closest('input')) {
                e.preventDefault();
                _drag = {
                    el: imgItem,
                    startX: e.clientX,
                    startY: e.clientY,
                    origLeft: parseInt(imgItem.style.left, 10) || 0,
                    origTop:  parseInt(imgItem.style.top,  10) || 0
                };
            }
        });

        document.addEventListener('mousemove', function (e) {
            if (_drag) {
                const dx = e.clientX - _drag.startX;
                const dy = e.clientY - _drag.startY;
                const container = _drag.el.parentElement;
                const maxLeft = container ? container.offsetWidth  - _drag.el.offsetWidth  : 9999;
                const maxTop  = container ? container.offsetHeight - _drag.el.offsetHeight : 9999;
                _drag.el.style.left = Math.max(0, Math.min(_drag.origLeft + dx, maxLeft)) + 'px';
                _drag.el.style.top  = Math.max(0, Math.min(_drag.origTop  + dy, maxTop))  + 'px';
            }
            if (_resize) {
                const dx = e.clientX - _resize.startX;
                const dy = e.clientY - _resize.startY;
                const container = _resize.el.parentElement;
                const maxW = container ? container.offsetWidth - (parseInt(_resize.el.style.left, 10) || 0) : 9999;
                _resize.el.style.width  = Math.max(80, Math.min(_resize.origW + dx, maxW)) + 'px';
                _resize.el.style.height = Math.max(60, _resize.origH + dy) + 'px';
            }
        });

        document.addEventListener('mouseup', function () {
            _drag = null;
            _resize = null;
        });
    }

    function _renderImageItem(img, container) {
        const div = document.createElement('div');
        div.className = 'safety-img-item';
        div.dataset.imgid = img.id;
        div.style.cssText = `position:absolute;left:${img.x || 10}px;top:${img.y || 10}px;
            width:${img.width || 200}px;height:${img.height || 150}px;
            cursor:move;user-select:none;border:1px solid var(--border-color);
            border-radius:6px;overflow:visible;background:var(--bg-primary);`;

        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.style.cssText = 'width:100%;height:calc(100% - 24px);object-fit:contain;pointer-events:none;display:block;border-radius:5px 5px 0 0;';

        const captionInput = document.createElement('input');
        captionInput.type = 'text';
        captionInput.className = 'safety-img-caption';
        captionInput.value = img.caption || '';
        captionInput.placeholder = '캡션 입력';
        captionInput.style.cssText = 'width:100%;font-size:0.7rem;border:none;border-top:1px solid var(--border-color);padding:2px 4px;background:transparent;color:var(--text-muted);outline:none;box-sizing:border-box;';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'safety-img-resize';
        resizeHandle.style.cssText = 'position:absolute;right:0;bottom:24px;width:12px;height:12px;background:#3b82f6;cursor:se-resize;border-radius:2px;z-index:2;';

        const delBtn = document.createElement('button');
        delBtn.className = 'safety-img-delete';
        delBtn.type = 'button';
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;z-index:3;';
        delBtn.addEventListener('click', function () {
            const placeholder = container.querySelector('#safetyImgPlaceholder');
            div.remove();
            if (placeholder) {
                const remaining = container.querySelectorAll('.safety-img-item');
                if (remaining.length === 0) placeholder.style.display = '';
            }
        });

        div.appendChild(imgEl);
        div.appendChild(captionInput);
        div.appendChild(resizeHandle);
        div.appendChild(delBtn);
        return div;
    }

    function renderImageArea(containerId, images, readOnly) {
        const container = document.getElementById(containerId);
        if (!container) return;
        _attachListeners();

        // Clear existing items
        container.querySelectorAll('.safety-img-item').forEach(function (el) { el.remove(); });
        const placeholder = container.querySelector('#safetyImgPlaceholder');

        if (!Array.isArray(images) || images.length === 0) {
            if (placeholder) placeholder.style.display = '';
            return;
        }
        if (placeholder) placeholder.style.display = 'none';

        images.forEach(function (img) {
            const el = _renderImageItem(img, container);
            if (readOnly) {
                el.style.cursor = 'default';
                el.querySelectorAll('.safety-img-delete, .safety-img-resize').forEach(function (h) { h.style.display = 'none'; });
            }
            container.appendChild(el);
        });

        // Adjust container height to fit images
        let maxBottom = 120;
        images.forEach(function (img) {
            maxBottom = Math.max(maxBottom, (img.y || 10) + (img.height || 150) + 20);
        });
        container.style.minHeight = maxBottom + 'px';
    }

    function openPicker(containerId) {
        _attachListeners();
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', function () {
            const container = document.getElementById(containerId);
            if (!container) { fileInput.remove(); return; }
            const placeholder = container.querySelector('#safetyImgPlaceholder');
            let existingCount = container.querySelectorAll('.safety-img-item').length;

            Array.from(fileInput.files).forEach(function (file, idx) {
                const reader = new FileReader();
                reader.onload = function (ev) {
                    const img = {
                        id: SafetyCommon.genId(),
                        src: ev.target.result,
                        x: 10 + (existingCount + idx) * 10,
                        y: 10 + (existingCount + idx) * 10,
                        width: 200,
                        height: 150,
                        caption: file.name
                    };
                    const el = _renderImageItem(img, container);
                    if (placeholder) placeholder.style.display = 'none';

                    // Expand container height
                    const neededH = img.y + img.height + 30;
                    const curH = parseInt(container.style.minHeight, 10) || 120;
                    container.style.minHeight = Math.max(curH, neededH) + 'px';

                    container.appendChild(el);
                };
                reader.readAsDataURL(file);
            });
            fileInput.remove();
        });

        fileInput.click();
    }

    function collectImages(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('.safety-img-item')).map(function (el) {
            const captionInput = el.querySelector('.safety-img-caption');
            const imgEl = el.querySelector('img');
            return {
                id: el.dataset.imgid,
                src: imgEl ? imgEl.src : '',
                x: parseInt(el.style.left, 10) || 0,
                y: parseInt(el.style.top, 10) || 0,
                width: el.offsetWidth || 200,
                height: el.offsetHeight || 150,
                caption: captionInput ? captionInput.value : ''
            };
        });
    }

    function imageAreaHTML(containerId) {
        return `
            <div style="margin-top:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <label class="form-label" style="margin:0;">이미지 첨부</label>
                    <button type="button" class="btn btn-sm btn-outline"
                            onclick="SafetyImageEditor.openPicker('${containerId}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add_photo_alternate</span>
                        이미지 추가
                    </button>
                </div>
                <div id="${containerId}" style="position:relative;min-height:120px;border:1px dashed var(--border-color);
                     border-radius:8px;padding:8px;background:var(--bg-secondary);overflow:hidden;">
                    <p style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:20px 0;" id="safetyImgPlaceholder">
                        이미지를 추가하려면 위 버튼을 클릭하세요
                    </p>
                </div>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">
                    이미지를 드래그하여 위치 변경 · 우하단 모서리를 드래그하여 크기 조절
                </p>
            </div>
        `;
    }

    return { renderImageArea, openPicker, collectImages, imageAreaHTML };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyHubModule — 안전관리 메인 허브
════════════════════════════════════════════════════════════════════ */
var SafetyHubModule = (function () {
    const SUB_PAGES = [
        { id: 'safety-standard',  label: '안전관리 표준서',    desc: '안전 업무 프로세스 표준 문서',     icon: 'menu_book',  accent: '#2563eb', key: 'safety_standard_v1'  },
        { id: 'safety-msds',      label: 'MSDS 등록대장',      desc: '물질안전보건자료 등록·관리',        icon: 'science',    accent: '#7c3aed', key: 'safety_msds_v1'      },
        { id: 'safety-checklist', label: '안전관리 점검표',     desc: '정기 안전 점검 기록',              icon: 'checklist',  accent: '#059669', key: 'safety_checklist_v1' },
        { id: 'safety-ppe',       label: '보호구 적용기준',     desc: '공정별 보호구 착용 기준',           icon: 'security',   accent: '#d97706', key: 'safety_ppe_v1'       },
        { id: 'safety-rules',     label: '안전수칙 기준서',     desc: '작업별 안전수칙 및 금지사항',       icon: 'gavel',      accent: '#0891b2', key: 'safety_rules_v1'     }
    ];

    async function render(container) {
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-hub', '안전관리', '안전 관리 문서 및 점검 현황을 관리합니다.')}
            <div class="card" style="margin-bottom:18px;">
                <div class="card-header">
                    <h4 style="margin:0;font-size:1rem;">안전 관리 현황</h4>
                </div>
                <div class="card-body">
                    <div id="safetyHubStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;">
                        <div style="text-align:center;color:var(--text-muted);">로딩 중...</div>
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">
                ${SUB_PAGES.map(function (p) {
                    return `<div onclick="Router.navigate('${p.id}')"
                                 style="cursor:pointer;border-radius:12px;border:1px solid var(--border-color);
                                        background:var(--bg-primary);padding:20px;
                                        border-top:4px solid ${p.accent};
                                        transition:box-shadow .15s;"
                                 onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.10)'"
                                 onmouseout="this.style.boxShadow='none'">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                            <div style="width:40px;height:40px;border-radius:10px;background:${p.accent};
                                        display:flex;align-items:center;justify-content:center;">
                                <span class="material-symbols-outlined" style="font-size:22px;color:#fff;">${p.icon}</span>
                            </div>
                            <div>
                                <div style="font-weight:700;font-size:.95rem;">${p.label}</div>
                                <div style="font-size:.78rem;color:var(--text-muted);">${p.desc}</div>
                            </div>
                        </div>
                        <div id="hub-count-${p.id}" style="font-size:1.6rem;font-weight:800;color:${p.accent};">-</div>
                        <div style="font-size:.75rem;color:var(--text-muted);">등록 건수</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

        // Load counts
        const counts = await Promise.all(SUB_PAGES.map(function (p) {
            return SafetyCommon.load(p.key).then(function (rows) { return rows.length; });
        }));

        let totalCount = 0;
        SUB_PAGES.forEach(function (p, i) {
            const el = container.querySelector('#hub-count-' + p.id);
            if (el) el.textContent = counts[i];
            totalCount += counts[i];
        });

        // Stat summary
        const statsEl = container.querySelector('#safetyHubStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div style="text-align:center;padding:12px;">
                    <div style="font-size:2rem;font-weight:800;color:#dc2626;">${totalCount}</div>
                    <div style="font-size:.82rem;color:var(--text-muted);">전체 등록 건수</div>
                </div>
                ${counts.map(function (c, i) {
                    return `<div style="text-align:center;padding:12px;border-left:1px solid var(--border-color);">
                        <div style="font-size:1.5rem;font-weight:700;color:${SUB_PAGES[i].accent};">${c}</div>
                        <div style="font-size:.78rem;color:var(--text-muted);">${SUB_PAGES[i].label}</div>
                    </div>`;
                }).join('')}
            `;
        }
    }

    return { render };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyStandardModule — 안전관리 표준서 (단일 문서)
════════════════════════════════════════════════════════════════════ */
var SafetyStandardModule = (function () {
    const KEY = 'safety_standard_doc_v1';
    let _doc = null;

    async function render(container) {
        const saved = await SafetyCommon.load(KEY);
        _doc = (Array.isArray(saved) && saved.length) ? saved[0]
             : (saved && !Array.isArray(saved)) ? saved
             : null;
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const r   = _doc;

        let docBody;
        if (!r) {
            docBody = `
                <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px;opacity:.4;">description</span>
                    <p style="margin:0 0 16px;">아직 작성된 표준서가 없습니다.</p>
                    <button class="btn btn-primary" onclick="SafetyStandardModule._edit()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">edit</span> 표준서 작성
                    </button>
                </div>`;
        } else {
            docBody = _docHTML(r);
        }

        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-standard', '안전관리 표준서', '안전 업무 프로세스 표준 문서입니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;">안전 관리 표준서</h4>
                    <div style="display:flex;gap:6px;">
                        ${r ? `
                        <button class="btn btn-sm btn-outline" onclick="SafetyStandardModule._printDoc()">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">print</span> 인쇄
                        </button>` : ''}
                        <button class="btn btn-sm btn-primary" onclick="SafetyStandardModule._edit()">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span> ${r ? '편집' : '작성'}
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;overflow-x:auto;">
                    <div id="ssd-doc-view" style="min-width:700px;">
                        ${docBody}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _edit() { _openModal(_doc); }

    /* ── 개정이력 행 HTML ── */
    function _revRowHTML(h, i) {
        const esc = SafetyCommon.esc;
        return `<tr>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;min-width:36px;" value="${esc(h.no !== undefined ? h.no : i)}" placeholder="${i}">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="date" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(h.date)}">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(h.content)}" placeholder="개정 내용">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;min-width:54px;" value="${esc(h.author)}" placeholder="작성">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;min-width:54px;" value="${esc(h.reviewer)}" placeholder="검토">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;min-width:54px;" value="${esc(h.approver)}" placeholder="확인">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;text-align:center;">
                <button type="button" onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;line-height:1;">×</button>
            </td>
        </tr>`;
    }

    /* ── 업무절차 행 HTML ── */
    function _procRowHTML(p, i) {
        const esc = SafetyCommon.esc;
        return `<tr>
            <td style="border:1px solid var(--border-color);padding:2px 4px;text-align:center;font-size:.8rem;">${i + 1}</td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.content)}" placeholder="관리 내용">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.cycle)}" placeholder="점검주기">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.manager)}" placeholder="담당자">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.standard)}" placeholder="관련 표준 및 기준">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.action)}" placeholder="이상 발생 시 조치">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;">
                <input type="text" class="form-control" style="padding:3px 6px;font-size:.8rem;" value="${esc(p.record)}" placeholder="기록 관리">
            </td>
            <td style="border:1px solid var(--border-color);padding:2px 4px;text-align:center;">
                <button type="button" onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;line-height:1;">×</button>
            </td>
        </tr>`;
    }

    const DEFAULT_REV_HIST = [
        { no: '0', date: '', content: '최초 작성', author: '', reviewer: '', approver: '' }
    ];
    const DEFAULT_PROCEDURES = [
        { content: '안전관리 대상 기획',  cycle: '신규 장비, 공정 변경 시', manager: '관리임원',  standard: '안전관리기준서', action: '재 설정', record: '안전 관련 정보' },
        { content: '안전 구역 설정',      cycle: '신규 장비, 공정 변경 시', manager: '관리임원',  standard: '안전관리기준서', action: '재 설정', record: '현장 LAY-OUT' },
        { content: '유해물질 파악',       cycle: '신규 장비, 공정 변경 시', manager: '생산부장',  standard: '안전관리기준서', action: '재 설정', record: 'MSDS 등록대장' },
        { content: '작업자 교육',         cycle: '매월/수시',               manager: '관리임원',  standard: '안전사고 재해사례 교안', action: '재 교육', record: '교육보고서' },
        { content: '보호구 지급',         cycle: '지급 시',                 manager: '생산부장',  standard: '안전관리기준서', action: '재 지급', record: '보호구 지급대장' },
        { content: '안전관리 점검',       cycle: '점검 주기에 준한다',      manager: '관리담당자', standard: '안전관리기준서', action: '재 점검', record: '환경관리 점검표' },
        { content: '재해 조사',           cycle: '발생 시',                 manager: '관리임원',  standard: '안전관리기준서', action: '재 조사', record: '재해 조사표' },
        { content: '시정조치',            cycle: '발생 시',                 manager: '해당부서장', standard: '안전관리기준서', action: '재 수립', record: '시정 및 예방조치 요구서' }
    ];
    const DEFAULT_FLOW = '안전 관리대상기획\n안전구역설정\n유해물질파악\n작업자교육\n보호구지급\n점검\n재해조사\n시정조치';
    const DEFAULT_TERMS = '1) 안전 : 수용할 수 없는 피해의 위험성이 없는 상태\n2) 안전관리 : 모든 계층의 사고방지 업무를 계획, 조직, 시행 등 통제 및 조정하는 업무를 말한다.\n3) 사 고 : 불안전한 상태 또는 불안전한 행동에 기인되어 근로자의 인명에 사상을 초래하거나, 재산상 피해를 초래한 비 정상적·비 능률적인 것으로 계획되지 않은 사건을 말한다.\n4) 산업재해 : 근로자가 업무에 관계되는 건설물, 설비, 원재료, 가스, 증기, 분진, 유해물질 등에 의하거나 작업 기타 업무에 기인하여 사망 또는 부상하거나 질병에 이환되는 것을 말한다.';

    function _openModal(doc) {
        const esc   = SafetyCommon.esc;
        const today = SafetyCommon.today();
        const d     = doc || {};

        const revHist = (d.revHistory && d.revHistory.length) ? d.revHistory : DEFAULT_REV_HIST;
        const procs   = (d.procedures && d.procedures.length) ? d.procedures : DEFAULT_PROCEDURES;

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">문서번호</label>
                    <input class="form-control" id="ssd-docNo" value="${esc(d.docNo || '')}" placeholder="예) SS-001">
                </div>
                <div class="form-group">
                    <label class="form-label">개정번호</label>
                    <input class="form-control" id="ssd-revNo" type="number" min="0" value="${esc(d.revNo !== undefined ? d.revNo : 0)}">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">문서 제목 *</label>
                    <input class="form-control" id="ssd-title" value="${esc(d.title || '안전 관리 표준서')}" placeholder="문서 제목">
                </div>
                <div class="form-group">
                    <label class="form-label">개정일자</label>
                    <input class="form-control" id="ssd-revDate" type="date" value="${esc(d.revDate || today)}">
                </div>
                <div class="form-group">
                    <label class="form-label">상태</label>
                    <select class="form-control" id="ssd-status">
                        ${['유효','개정중','폐기'].map(function(s){
                            return `<option value="${s}" ${d.status === s ? 'selected' : ''}>${s}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">작성 / 검토 / 확인 담당자</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                        <input class="form-control" id="ssd-author"   value="${esc(d.author   || '')}" placeholder="작성자">
                        <input class="form-control" id="ssd-reviewer" value="${esc(d.reviewer || '')}" placeholder="검토자">
                        <input class="form-control" id="ssd-approver" value="${esc(d.approver || '')}" placeholder="확인자">
                    </div>
                </div>
            </div>

            <!-- 개정이력 -->
            <div class="form-group" style="margin-top:14px;">
                <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
                    개정 이력
                    <button type="button" class="btn btn-sm btn-outline" onclick="SafetyStandardModule._addRevRow()">+ 행 추가</button>
                </label>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:50px;">NO</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:120px;">개정일자</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;">개정내용</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:72px;">작성</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:72px;">검토</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:72px;">확인</th>
                                <th style="border:1px solid var(--border-color);padding:5px 8px;width:36px;"></th>
                            </tr>
                        </thead>
                        <tbody id="ssd-revBody">
                            ${revHist.map(function(h, i){ return _revRowHTML(h, i); }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 용어의 정의 -->
            <div class="form-group" style="margin-top:14px;">
                <label class="form-label">1. 용어의 정의</label>
                <textarea class="form-control" id="ssd-terms" rows="6" style="resize:vertical;">${esc(d.terms !== undefined ? d.terms : DEFAULT_TERMS)}</textarea>
            </div>

            <!-- 업무 절차 -->
            <div class="form-group" style="margin-top:14px;">
                <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
                    3. 업무 절차
                    <button type="button" class="btn btn-sm btn-outline" onclick="SafetyStandardModule._addProcRow()">+ 행 추가</button>
                </label>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="border:1px solid var(--border-color);padding:5px 6px;width:30px;">NO</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">관리 내용</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">점검주기</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">담당자</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">관련 표준 및 기준</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">이상 발생 시 조치</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;">기록 관리</th>
                                <th style="border:1px solid var(--border-color);padding:5px 6px;width:36px;"></th>
                            </tr>
                        </thead>
                        <tbody id="ssd-procBody">
                            ${procs.map(function(p, i){ return _procRowHTML(p, i); }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 업무 FLOW -->
            <div class="form-group" style="margin-top:14px;">
                <label class="form-label">업무 FLOW 단계 <span style="color:var(--text-muted);font-size:.8rem;">(줄바꿈으로 구분, "점검" 포함 단계는 파란색 강조)</span></label>
                <textarea class="form-control" id="ssd-flow" rows="5" style="resize:vertical;">${esc(d.flowText !== undefined ? d.flowText : DEFAULT_FLOW)}</textarea>
            </div>

            <!-- 비고 -->
            <div class="form-group" style="margin-top:14px;">
                <label class="form-label">비고</label>
                <textarea class="form-control" id="ssd-content" rows="2" style="resize:vertical;">${esc(d.content || '')}</textarea>
            </div>

            ${SafetyImageEditor.imageAreaHTML('ssdImgContainer')}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SafetyStandardModule._save()">저장</button>
        `;

        UIUtils.showModal('안전관리 표준서 편집', body, footer, 'xl');

        if (d.images && d.images.length) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('ssdImgContainer', d.images);
            }, 50);
        }
    }

    function _addRevRow() {
        const tbody = document.getElementById('ssd-revBody');
        if (!tbody) return;
        const i = tbody.rows.length;
        const tr = document.createElement('tr');
        tr.innerHTML = _revRowHTML({ no: String(i), date: '', content: '', author: '', reviewer: '', approver: '' }, i);
        tbody.appendChild(tr);
    }

    function _addProcRow() {
        const tbody = document.getElementById('ssd-procBody');
        if (!tbody) return;
        const i = tbody.rows.length;
        const tr = document.createElement('tr');
        tr.innerHTML = _procRowHTML({ content: '', cycle: '', manager: '', standard: '', action: '', record: '' }, i);
        tbody.appendChild(tr);
    }

    function _collectRevHistory() {
        const tbody = document.getElementById('ssd-revBody');
        if (!tbody) return [];
        return Array.from(tbody.rows).map(function(tr) {
            const inputs = tr.querySelectorAll('input');
            return {
                no:       inputs[0] ? inputs[0].value.trim() : '',
                date:     inputs[1] ? inputs[1].value : '',
                content:  inputs[2] ? inputs[2].value.trim() : '',
                author:   inputs[3] ? inputs[3].value.trim() : '',
                reviewer: inputs[4] ? inputs[4].value.trim() : '',
                approver: inputs[5] ? inputs[5].value.trim() : ''
            };
        }).filter(function(h) { return h.content || h.date; });
    }

    function _collectProcedures() {
        const tbody = document.getElementById('ssd-procBody');
        if (!tbody) return [];
        return Array.from(tbody.rows).map(function(tr) {
            const inputs = tr.querySelectorAll('input');
            return {
                content:  inputs[0] ? inputs[0].value.trim() : '',
                cycle:    inputs[1] ? inputs[1].value.trim() : '',
                manager:  inputs[2] ? inputs[2].value.trim() : '',
                standard: inputs[3] ? inputs[3].value.trim() : '',
                action:   inputs[4] ? inputs[4].value.trim() : '',
                record:   inputs[5] ? inputs[5].value.trim() : ''
            };
        }).filter(function(p) { return p.content; });
    }

    async function _save() {
        const title = document.getElementById('ssd-title').value.trim();
        if (!title) { UIUtils.toast('제목을 입력해주세요.', 'warning'); return; }

        _doc = {
            docNo:      document.getElementById('ssd-docNo').value.trim(),
            title,
            revNo:      parseInt(document.getElementById('ssd-revNo').value, 10) || 0,
            revDate:    document.getElementById('ssd-revDate').value,
            author:     document.getElementById('ssd-author').value.trim(),
            reviewer:   document.getElementById('ssd-reviewer').value.trim(),
            approver:   document.getElementById('ssd-approver').value.trim(),
            status:     document.getElementById('ssd-status').value,
            terms:      document.getElementById('ssd-terms').value.trim(),
            procedures: _collectProcedures(),
            revHistory: _collectRevHistory(),
            flowText:   document.getElementById('ssd-flow').value.trim(),
            content:    document.getElementById('ssd-content').value.trim(),
            images:     SafetyImageEditor.collectImages('ssdImgContainer'),
            updatedAt:  SafetyCommon.today()
        };

        await SafetyCommon.save(KEY, _doc);
        UIUtils.closeModal();
        UIUtils.toast('저장되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    /* ── 페이지 인라인 문서 렌더링 HTML ── */
    function _docHTML(r) {
        const esc = SafetyCommon.esc;

        /* 개정이력 — 최소 3행 */
        const revHist = (r.revHistory && r.revHistory.length) ? r.revHistory.slice() : [];
        while (revHist.length < 3) revHist.push({ no: '', date: '', content: '', author: '', reviewer: '', approver: '' });
        const revHistRows = revHist.slice(0, 3).map(function(h, i) {
            return `<tr>
                <td style="border:1px solid #aaa;padding:3px 6px;text-align:center;font-size:.78rem;">${esc(h.no !== undefined ? h.no : i)}</td>
                <td style="border:1px solid #aaa;padding:3px 6px;text-align:center;font-size:.78rem;">${esc(h.date)}</td>
                <td style="border:1px solid #aaa;padding:3px 6px;font-size:.78rem;">${esc(h.content)}</td>
                <td style="border:1px solid #aaa;padding:3px 6px;text-align:center;font-size:.78rem;">${esc(h.author)}</td>
                <td style="border:1px solid #aaa;padding:3px 6px;text-align:center;font-size:.78rem;">${esc(h.reviewer)}</td>
                <td style="border:1px solid #aaa;padding:3px 6px;text-align:center;font-size:.78rem;">${esc(h.approver)}</td>
            </tr>`;
        }).join('');

        /* 업무 절차 */
        const procs = r.procedures && r.procedures.length ? r.procedures : [];
        const procRows = procs.map(function(p, i) {
            return `<tr>
                <td style="border:1px solid #aaa;padding:4px 5px;text-align:center;font-size:.76rem;">${i + 1}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">${esc(p.content)}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;text-align:center;font-size:.76rem;">${esc(p.cycle)}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;text-align:center;font-size:.76rem;">${esc(p.manager)}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">${esc(p.standard)}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;text-align:center;font-size:.76rem;">${esc(p.action)}</td>
                <td style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">${esc(p.record)}</td>
            </tr>`;
        }).join('') || `<tr><td colspan="7" style="border:1px solid #aaa;padding:8px;text-align:center;color:#888;font-size:.82rem;">업무 절차 없음</td></tr>`;

        /* 업무 FLOW */
        const flowSteps = r.flowText
            ? r.flowText.split('\n').map(function(s){ return s.trim(); }).filter(Boolean)
            : [];
        const flowHTML = flowSteps.map(function(step, i) {
            const isHighlight = step.indexOf('점검') !== -1;
            const bg    = isHighlight ? '#1d4ed8' : '#e5e7eb';
            const color = isHighlight ? '#fff' : '#1f2937';
            const arrow = i < flowSteps.length - 1
                ? `<div style="text-align:center;color:#888;font-size:15px;line-height:1.4;margin:1px 0;">↓</div>`
                : '';
            return `<div style="background:${bg};color:${color};border:1px solid #bbb;padding:6px 10px;border-radius:4px;text-align:center;font-size:.8rem;font-weight:600;">${esc(step)}</div>${arrow}`;
        }).join('') || `<p style="color:#aaa;font-size:.82rem;text-align:center;margin-top:20px;">FLOW 없음</p>`;

        /* 용어의 정의 */
        const termsHTML = (r.terms || '').split('\n').map(function(line) {
            return line.trim()
                ? `<p style="margin:3px 0;font-size:.82rem;line-height:1.6;">${esc(line)}</p>`
                : '<div style="margin:4px 0;"></div>';
        }).join('');

        const statusColor = r.status === '유효' ? '#059669' : r.status === '폐기' ? '#dc2626' : '#d97706';

        return `
            <div style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;line-height:1.5;color:#111;background:#fff;padding:16px;">

                <!-- ① 헤더 -->
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <td style="border:2px solid #555;padding:10px 14px;width:175px;vertical-align:middle;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:42px;height:42px;background:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <span style="color:#fff;font-weight:900;font-size:.85rem;letter-spacing:-.5px;">KC</span>
                                </div>
                                <div style="font-size:.72rem;line-height:1.4;color:#333;font-weight:600;">KC 케미칼<br>주식회사</div>
                            </div>
                        </td>
                        <td style="border:2px solid #555;padding:14px 20px;text-align:center;">
                            <span style="font-size:1.5rem;font-weight:900;letter-spacing:.08em;">${esc(r.title || '안전 관리 표준서')}</span>
                        </td>
                        <td style="border:2px solid #555;padding:0;vertical-align:top;width:360px;">
                            <table style="width:100%;border-collapse:collapse;">
                                <tr style="background:#e5e7eb;">
                                    <td colspan="2" style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-weight:700;font-size:.76rem;vertical-align:middle;">개정<br>이력</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">NO</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">개정일자</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">개정내용</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">작성</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">검토</td>
                                    <td style="border:1px solid #aaa;padding:4px 6px;text-align:center;font-size:.76rem;font-weight:700;">확인</td>
                                </tr>
                                ${revHistRows}
                            </table>
                        </td>
                    </tr>
                </table>

                <!-- ② 본문 -->
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <th style="border:2px solid #555;padding:7px 14px;background:#c8cfd8;text-align:center;width:62%;font-size:.87rem;">업무 내용</th>
                        <th style="border:2px solid #555;padding:7px 14px;background:#c8cfd8;text-align:center;font-size:.87rem;">업무 FLOW</th>
                    </tr>
                    <tr>
                        <td style="border:2px solid #555;padding:14px 16px;vertical-align:top;">

                            <p style="margin:0 0 6px;font-size:.87rem;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;">1. 용어의 정의</p>
                            ${termsHTML}

                            <p style="margin:16px 0 6px;font-size:.87rem;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;">2. 안전 관리 점검 주기 및 담당자</p>
                            <table style="width:100%;border-collapse:collapse;">
                                <tr style="background:#e5e7eb;">
                                    <th style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;">안전관리 담당자</th>
                                    <th style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;">점검 주기</th>
                                    <th style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;">기록 관리</th>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;font-weight:600;">생산부장</td>
                                    <td style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;text-align:center;">1회/월</td>
                                    <td style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;text-align:center;" rowspan="2">안전 관리점검표</td>
                                </tr>
                                <tr>
                                    <td style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;font-weight:600;">현장 관리자</td>
                                    <td style="border:1px solid #aaa;padding:4px 8px;font-size:.8rem;text-align:center;">1회/일</td>
                                </tr>
                            </table>

                            <p style="margin:16px 0 6px;font-size:.87rem;font-weight:700;border-bottom:1px solid #ccc;padding-bottom:4px;">3. 업무 절차</p>
                            <table style="width:100%;border-collapse:collapse;">
                                <tr style="background:#e5e7eb;">
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;width:26px;">NO</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">관리 내용</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">점검주기</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">담당자</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">관련 표준 및 기준</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">이상 발생 시 조치</th>
                                    <th style="border:1px solid #aaa;padding:4px 5px;font-size:.76rem;">기록 관리</th>
                                </tr>
                                ${procRows}
                            </table>
                            ${r.content ? `<p style="margin-top:10px;font-size:.8rem;color:#555;">${esc(r.content)}</p>` : ''}
                        </td>

                        <td style="border:2px solid #555;padding:16px 14px;vertical-align:top;">
                            <div style="display:flex;flex-direction:column;gap:2px;">
                                ${flowHTML}
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- ③ 푸터 -->
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <td style="border:2px solid #555;padding:4px 12px;text-align:center;font-size:.78rem;color:#444;width:50%;">케이씨케미칼㈜</td>
                        <td style="border:2px solid #555;padding:4px 12px;text-align:right;font-size:.78rem;color:#444;">
                            ${r.docNo ? `문서번호: ${esc(r.docNo)} &nbsp;|&nbsp;` : ''}
                            Rev.${esc(r.revNo || '0')} &nbsp;|&nbsp; ${esc(r.revDate || '')} &nbsp;|&nbsp;
                            상태: <span style="font-weight:700;color:${statusColor};">${esc(r.status || '유효')}</span>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }

    function _printDoc() {
        const el = document.getElementById('ssd-doc-view');
        if (!el) return;
        const w = window.open('', '_blank', 'width=1000,height=750');
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
            <title>안전 관리 표준서</title>
            <style>
                body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:9pt;margin:10mm;color:#111;}
                table{border-collapse:collapse;width:100%;}
                td,th{font-size:8pt;}
                @page{size:A4 landscape;margin:10mm;}
            </style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(function(){ w.print(); }, 400);
    }

    return { render, _edit, _save, _addRevRow, _addProcRow, _printDoc };
})();

/* ════════════════════════════════════════════════════════════════════
   MSDSModule — MSDS 등록대장
   · 도료 마스터 전체 목록 자동 연동
   · 양산 → A/S → 개발 우선순위 정렬
   · 미첨부 도료 노란 행으로 누락 표시
   · 도료별 MSDS 파일(PDF/ZIP) 첨부
   · 경고표시 ① ~ ⑥ 체크 기능
════════════════════════════════════════════════════════════════════ */
var MSDSModule = (function () {
    /* KEY: { [materialId]: { hazards, pageNo, note, productType, supplier, files:[{name,data,type}] } } */
    const KEY = 'safety_msds_v2';
    let _dict = {};   // materialId → msdsData
    let _mats = [];   // paint_materials 목록

    const HAZARD_ICONS = [
        { no: '①', label: '경고',    sym: '⚠',  color: '#f59e0b' },
        { no: '②', label: '인화성',  sym: '🔥', color: '#ef4444' },
        { no: '③', label: '발암성',  sym: '☠',  color: '#7c3aed' },
        { no: '④', label: '급성독성',sym: '💀', color: '#dc2626' },
        { no: '⑤', label: '피부부식',sym: '🧪', color: '#d97706' },
        { no: '⑥', label: '수생유해',sym: '🐟', color: '#0891b2' }
    ];

    /* 제품 구분 색상 */
    const PROD_COLORS  = { '양산': '#059669', 'A/S': '#2563eb', '개발': '#7c3aed' };

    /* 도료 카테고리 색상 */
    const CAT_META = {
        '세척제':   { color: '#0891b2', bg: '#e0f2fe', label: '세척제',   icon: 'cleaning_services' },
        '주제':     { color: '#ec4899', bg: '#fce7f3', label: '주제',     icon: 'format_paint' },
        '경화제':   { color: '#f59e0b', bg: '#fef3c7', label: '경화제',   icon: 'science' },
        '희석 신너':{ color: '#6366f1', bg: '#ede9fe', label: '희석 신너',icon: 'water_drop' },
        '기타':     { color: '#6b7280', bg: '#f3f4f6', label: '기타',     icon: 'category' }
    };

    async function render(container) {
        const saved = await SafetyCommon.load(KEY);
        _dict = (saved && !Array.isArray(saved) && typeof saved === 'object') ? saved : {};
        _mats = (typeof Storage !== 'undefined' && DB && DB.STORES)
            ? (Storage.getAll(DB.STORES.PAINT_MATERIALS) || [])
            : [];
        _draw(container);
    }

    /* itemType 정규화: '양산품'→'양산', 'A/S품'→'A/S' */
    function _normType(raw) {
        if (!raw) return '';
        return raw.replace(/품$/, '').trim();
    }

    /* paintType + 도료명 키워드로 도료 카테고리 판별 */
    function _paintCat(mat) {
        const pt   = (mat.paintType || '').trim();
        const name = (mat.name     || '').toLowerCase();

        /* 세척제 - 최상단 배치 대상 */
        if (pt === 'IPA세척제' || pt === '세척제' || pt === '세척신너' ||
            name.includes('ipa') || name.includes('세척제') ||
            (name.includes('세척') && (name.includes('신너') || name.includes('thinner')))) {
            return '세척제';
        }
        /* 경화제 */
        if (pt === '경화제' || name.includes('경화제') || name.includes('hardener')) {
            return '경화제';
        }
        /* 희석 신너 */
        if (pt === '희석제' || pt === '신너' || pt === 'Thinner' ||
            name.includes('신나') || name.includes('신너') || name.includes('thinner') ||
            name.includes('희석제') || name.includes('희석신너')) {
            return '희석 신너';
        }
        /* 주제 (Primer / Color / 상도 등) */
        if (pt === 'Primer' || pt === 'Color' || pt === '주제' || pt === '상도' || pt === '하도') {
            return '주제';
        }
        return pt || '기타';
    }

    /* 정렬: 세척제 최상단 → 양산/A/S/개발 → 카테고리 → 이름 */
    function _sortedMats() {
        const ptOrder  = { '양산': 0, 'A/S': 1, '개발': 2 };
        const catOrder = { '세척제': -1, '주제': 0, '경화제': 1, '희석 신너': 2 };
        return _mats.slice().sort(function(a, b) {
            const catA = _paintCat(a);
            const catB = _paintCat(b);
            /* 세척제 우선 */
            const isCleanA = catA === '세척제' ? 0 : 1;
            const isCleanB = catB === '세척제' ? 0 : 1;
            if (isCleanA !== isCleanB) return isCleanA - isCleanB;
            /* itemType 순서 */
            const ta = _normType(a.itemType);
            const tb = _normType(b.itemType);
            const oa = ptOrder[ta] !== undefined ? ptOrder[ta] : 3;
            const ob = ptOrder[tb] !== undefined ? ptOrder[tb] : 3;
            if (oa !== ob) return oa - ob;
            /* 카테고리 순서 */
            const ca = catOrder[catA] !== undefined ? catOrder[catA] : 3;
            const cb = catOrder[catB] !== undefined ? catOrder[catB] : 3;
            if (ca !== cb) return ca - cb;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    /* 활성 필터 상태 */
    var _fState = { pt: '전체', cat: '전체', sup: '', keyword: '', missing: false };

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        const sorted = _sortedMats();

        const total    = sorted.length;
        const attached = sorted.filter(function(m){ return _hasFile(m.id); }).length;
        const missing  = total - attached;

        /* 공급처 목록 (중복 제거) */
        const suppliers = Array.from(new Set(
            sorted.map(function(m){ return m.supplier || ''; }).filter(Boolean)
        )).sort();

        /* 범례 경고 아이콘 */
        const legendHTML = HAZARD_ICONS.map(function(h) {
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;">
                <div style="width:34px;height:34px;background:${h.color}22;border:2px solid ${h.color};border-radius:6px;
                            display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${h.sym}</div>
                <span style="font-size:.68rem;font-weight:700;color:${h.color};">${h.no}</span>
                <span style="font-size:.65rem;color:var(--text-muted);">${h.label}</span>
            </div>`;
        }).join('');

        /* 행 HTML */
        const rows = sorted.map(function(mat, i) {
            const d    = _dict[mat.id] || {};
            const hz   = d.hazards || [];
            const hasF = _hasFile(mat.id);
            const pt   = _normType(mat.itemType);
            const cat  = _paintCat(mat);
            const sup  = mat.supplier || '';
            const ptColor  = PROD_COLORS[pt] || '#9ca3af';
            const catInfo  = CAT_META[cat] || CAT_META['기타'];

            /* 세척제: 하늘색 행, 미첨부: 노란 행, 일반 미첨부: 노란 행 */
            const rowBg = cat === '세척제'
                ? 'background:#f0f9ff;'
                : (hasF ? '' : 'background:#fefce8;');

            const hCell = function(no) {
                const icon = HAZARD_ICONS.find(function(h){ return h.no === no; });
                return hz.includes(no)
                    ? `<span style="color:${icon ? icon.color : '#333'};font-size:1rem;font-weight:900;">✔</span>`
                    : `<span style="color:#d1d5db;font-size:.9rem;">✔</span>`;
            };

            const fileCell = hasF
                ? `<span style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;color:#2563eb;"
                       onclick="MSDSModule._openFiles('${js(mat.id)}')">
                       <span class="material-symbols-outlined" style="font-size:14px;">attach_file</span>
                       <span style="font-size:.72rem;font-weight:700;">${d.files.length}건</span>
                   </span>`
                : `<span style="font-size:.72rem;color:#dc2626;font-weight:700;">누락</span>`;

            /* 카테고리 배지 */
            const catBadge = `<span style="display:inline-flex;align-items:center;gap:2px;font-size:.65rem;
                background:${catInfo.bg};color:${catInfo.color};border-radius:3px;padding:1px 5px;font-weight:700;white-space:nowrap;">
                <span class="material-symbols-outlined" style="font-size:11px;">${catInfo.icon}</span>${catInfo.label}
            </span>`;

            /* 제품구분 배지 */
            const ptBadge = pt
                ? `<span style="font-size:.63rem;background:${ptColor}22;color:${ptColor};border-radius:3px;padding:1px 5px;font-weight:700;">${esc(pt)}</span>`
                : `<span style="font-size:.63rem;background:#f3f4f6;color:#9ca3af;border-radius:3px;padding:1px 5px;">미지정</span>`;

            return `<tr style="${rowBg}" data-pt="${esc(pt)}" data-cat="${esc(cat)}" data-sup="${esc(sup)}" data-missing="${hasF ? '0' : '1'}" data-name="${esc((mat.name||'').toLowerCase())}">
                <td style="text-align:center;font-size:.8rem;">${i + 1}</td>
                <td style="font-size:.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(mat.name)}"><strong>${esc(mat.name)}</strong></td>
                <td style="text-align:center;">${catBadge}</td>
                <td style="text-align:center;">${ptBadge}</td>
                <td style="text-align:center;">${hCell('①')}</td>
                <td style="text-align:center;">${hCell('②')}</td>
                <td style="text-align:center;">${hCell('③')}</td>
                <td style="text-align:center;">${hCell('④')}</td>
                <td style="text-align:center;">${hCell('⑤')}</td>
                <td style="text-align:center;">${hCell('⑥')}</td>
                <td style="font-size:.82rem;">${esc(sup || '-')}</td>
                <td style="text-align:center;font-size:.82rem;">${esc(d.pageNo || '-')}</td>
                <td style="text-align:center;">${fileCell}</td>
                <td style="font-size:.76rem;color:var(--text-muted);">${esc(d.note || '')}</td>
                <td style="text-align:center;white-space:nowrap;">
                    ${!pt
                        ? `<button class="btn btn-sm" style="background:#f59e0b22;color:#d97706;border:1px solid #f59e0b66;font-size:.72rem;"
                               onclick="MSDSModule._gotoSettings('${js(mat.id)}')" title="도료 기초 정보에서 제품 구분 설정">
                               <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;">settings</span> 구분 설정
                           </button>`
                        : `<button class="btn btn-sm btn-outline" onclick="MSDSModule._edit('${js(mat.id)}')">편집</button>`
                    }
                </td>
            </tr>`;
        }).join('');

        /* 제품구분 버튼 */
        const ptBtns = ['전체','양산','A/S','개발'].map(function(t) {
            const active = _fState.pt === t;
            const col = active ? (PROD_COLORS[t] || '#2563eb') : 'var(--border-color)';
            const bg  = active ? (PROD_COLORS[t] || '#2563eb') + '18' : 'var(--bg-secondary)';
            return `<button class="btn btn-sm msds-pt-btn" data-pt="${t}"
                style="border:1px solid ${col};background:${bg};color:${active?(PROD_COLORS[t]||'#2563eb'):'var(--text-primary)'};font-size:.78rem;font-weight:${active?'700':'400'};"
                onclick="MSDSModule._setPt('${t}')">
                ${t === '전체' ? '전체 구분' : t}
            </button>`;
        }).join('');

        /* 도료 카테고리 버튼 */
        const catBtns = ['전체','세척제','주제','경화제','희석 신너','기타'].map(function(c) {
            const active = _fState.cat === c;
            const meta   = CAT_META[c] || { color: '#6b7280', bg: '#f3f4f6' };
            const col    = active ? meta.color : 'var(--border-color)';
            const bg     = active ? meta.bg    : 'var(--bg-secondary)';
            return `<button class="btn btn-sm msds-cat-btn" data-cat="${c}"
                style="border:1px solid ${col};background:${bg};color:${active ? meta.color : 'var(--text-primary)'};font-size:.78rem;font-weight:${active?'700':'400'};"
                onclick="MSDSModule._setCat('${c}')">
                ${c === '전체' ? '전체 유형' : c}
            </button>`;
        }).join('');

        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-msds', 'MSDS 등록대장', '물질안전보건자료를 도료별로 등록·관리합니다.')}

            <!-- 범례 -->
            <div class="card" style="margin-bottom:10px;">
                <div class="card-body" style="padding:10px 14px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:.78rem;font-weight:700;color:var(--text-muted);">※ 범례 : MSDS 경고표시</span>
                        ${legendHTML}
                        <div style="margin-left:auto;display:flex;gap:12px;align-items:center;flex-shrink:0;">
                            <div style="text-align:center;">
                                <div style="font-size:1.1rem;font-weight:900;">${total}</div>
                                <div style="font-size:.68rem;color:var(--text-muted);">전체</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:1.1rem;font-weight:900;color:#059669;">${attached}</div>
                                <div style="font-size:.68rem;color:#059669;">첨부완료</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:1.1rem;font-weight:900;color:#dc2626;">${missing}</div>
                                <div style="font-size:.68rem;color:#dc2626;">누락</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 검색 + 필터 바 -->
            <div class="card" style="margin-bottom:10px;">
                <div class="card-body" style="padding:10px 14px;">
                    <!-- 1행: 검색 + 공급처 + 누락 + 초기화 -->
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                        <div style="position:relative;flex:1;min-width:160px;">
                            <span class="material-symbols-outlined" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:18px;color:var(--text-muted);pointer-events:none;">search</span>
                            <input id="msds-search-kw" type="text" class="form-control" placeholder="도료명 검색..."
                                style="padding-left:32px;"
                                oninput="MSDSModule._applyFilter()"
                                value="${SafetyCommon.esc(_fState.keyword)}">
                        </div>
                        <div style="min-width:140px;">
                            <select id="msds-search-sup" class="form-control" onchange="MSDSModule._applyFilter()">
                                <option value="">전체 제조사</option>
                                ${suppliers.map(function(s){
                                    return `<option value="${esc(s)}" ${_fState.sup === s ? 'selected' : ''}>${esc(s)}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:.78rem;
                            padding:5px 10px;border-radius:6px;flex-shrink:0;
                            border:1px solid ${_fState.missing ? '#dc2626' : 'var(--border-color)'};
                            background:${_fState.missing ? '#dc262611' : 'var(--bg-secondary)'};
                            color:${_fState.missing ? '#dc2626' : 'var(--text-primary)'};">
                            <input type="checkbox" id="msds-chk-missing" ${_fState.missing ? 'checked' : ''}
                                onchange="MSDSModule._applyFilter()" style="accent-color:#dc2626;">
                            ⚠ 누락만
                        </label>
                        <button class="btn btn-sm btn-outline" onclick="MSDSModule._resetFilter()" style="font-size:.76rem;flex-shrink:0;">초기화</button>
                    </div>
                    <!-- 2행: 도료 유형 -->
                    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
                        <span style="font-size:.72rem;color:var(--text-muted);margin-right:2px;white-space:nowrap;">도료 유형</span>
                        ${catBtns}
                    </div>
                    <!-- 3행: 제품 구분 -->
                    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                        <span style="font-size:.72rem;color:var(--text-muted);margin-right:2px;white-space:nowrap;">제품 구분</span>
                        ${ptBtns}
                    </div>
                </div>
            </div>

            <!-- 대장 테이블 -->
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                    <h4 style="margin:0;font-size:1rem;">MSDS 등록대장
                        <span style="color:var(--text-muted);font-size:.8rem;margin-left:6px;" id="msds-count-label">
                            도료 마스터 기준 (${total}종)
                        </span>
                    </h4>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <span style="font-size:.75rem;background:#fefce8;border:1px solid #fbbf24;border-radius:3px;padding:2px 8px;color:#92400e;">
                            노란 행 = MSDS 미첨부
                        </span>
                        <button class="btn btn-sm" style="background:#0891b2;color:#fff;border:none;"
                            onclick="MSDSModule._addCleaner()">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">add</span>
                            세척제 추가
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table" style="table-layout:fixed;width:100%;">
                            <colgroup>
                                <col style="width:36px;">        <!-- No -->
                                <col style="width:180px;">       <!-- 제품명 -->
                                <col style="width:90px;">        <!-- 도료 유형 -->
                                <col style="width:70px;">        <!-- 제품 구분 -->
                                <col style="width:48px;">        <!-- ① -->
                                <col style="width:48px;">        <!-- ② -->
                                <col style="width:48px;">        <!-- ③ -->
                                <col style="width:48px;">        <!-- ④ -->
                                <col style="width:48px;">        <!-- ⑤ -->
                                <col style="width:48px;">        <!-- ⑥ -->
                                <col style="width:96px;">        <!-- 제조사 -->
                                <col style="width:44px;">        <!-- 쪽수 -->
                                <col style="width:72px;">        <!-- MSDS 파일 -->
                                <col>                            <!-- 비고 (나머지) -->
                                <col style="width:70px;">        <!-- 작업 -->
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>제품명 (도료명)</th>
                                    <th style="text-align:center;">도료 유형</th>
                                    <th style="text-align:center;">제품 구분</th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">①<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">경고</span></th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">②<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">인화성</span></th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">③<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">발암성</span></th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">④<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">급성독성</span></th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">⑤<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">피부부식</span></th>
                                    <th style="text-align:center;padding:5px 1px;line-height:1.3;">⑥<br><span style="font-size:.62rem;font-weight:400;color:var(--text-muted);">수생유해</span></th>
                                    <th>제조사</th>
                                    <th style="text-align:center;">쪽수</th>
                                    <th style="text-align:center;">MSDS<br>파일</th>
                                    <th>비 고</th>
                                    <th style="text-align:center;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="msds-tbody">
                                ${sorted.length === 0
                                    ? `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--text-muted);">
                                           도료 마스터에 등록된 도료가 없습니다.<br>
                                           <small>설정 → 도료 정보에서 도료를 먼저 등록해주세요.</small>
                                       </td></tr>`
                                    : rows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

        /* 초기 필터 적용 */
        _applyFilter();
    }

    function _hasFile(matId) {
        const d = _dict[matId];
        return d && d.files && d.files.length > 0;
    }

    /* ── 제품 구분 버튼 ── */
    function _setPt(pt) {
        _fState.pt = pt;
        document.querySelectorAll('.msds-pt-btn').forEach(function(btn) {
            const t      = btn.getAttribute('data-pt');
            const active = t === pt;
            const col    = active ? (PROD_COLORS[t] || '#2563eb') : 'var(--border-color)';
            btn.style.borderColor = col;
            btn.style.background  = active ? (PROD_COLORS[t] || '#2563eb') + '18' : 'var(--bg-secondary)';
            btn.style.color       = active ? (PROD_COLORS[t] || '#2563eb') : 'var(--text-primary)';
            btn.style.fontWeight  = active ? '700' : '400';
        });
        _applyFilter();
    }

    /* ── 도료 유형 버튼 ── */
    function _setCat(cat) {
        _fState.cat = cat;
        document.querySelectorAll('.msds-cat-btn').forEach(function(btn) {
            const c      = btn.getAttribute('data-cat');
            const active = c === cat;
            const meta   = CAT_META[c] || { color: '#6b7280', bg: '#f3f4f6' };
            btn.style.borderColor = active ? meta.color : 'var(--border-color)';
            btn.style.background  = active ? meta.bg    : 'var(--bg-secondary)';
            btn.style.color       = active ? meta.color : 'var(--text-primary)';
            btn.style.fontWeight  = active ? '700' : '400';
        });
        _applyFilter();
    }

    /* ── 복합 필터 적용 ── */
    function _applyFilter() {
        const kwEl  = document.getElementById('msds-search-kw');
        const supEl = document.getElementById('msds-search-sup');
        const misEl = document.getElementById('msds-chk-missing');
        if (kwEl)  _fState.keyword = kwEl.value.trim().toLowerCase();
        if (supEl) _fState.sup     = supEl.value;
        if (misEl) _fState.missing = misEl.checked;

        const tbody = document.getElementById('msds-tbody');
        if (!tbody) return;

        let visible = 0;
        Array.from(tbody.rows).forEach(function(tr) {
            const pt      = tr.getAttribute('data-pt')  || '';
            const cat     = tr.getAttribute('data-cat') || '';
            const sup     = tr.getAttribute('data-sup') || '';
            const missing = tr.getAttribute('data-missing') === '1';
            const name    = tr.getAttribute('data-name') || '';

            const ptOk  = _fState.pt  === '전체' || pt  === _fState.pt;
            const catOk = _fState.cat === '전체' || cat === _fState.cat;
            const supOk = !_fState.sup     || sup === _fState.sup;
            const kwOk  = !_fState.keyword || name.indexOf(_fState.keyword) !== -1;
            const misOk = !_fState.missing || missing;

            const show = ptOk && catOk && supOk && kwOk && misOk;
            tr.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        const lbl = document.getElementById('msds-count-label');
        if (lbl) lbl.textContent = `표시 ${visible} / 전체 ${tbody.rows.length}종`;
    }

    /* ── 필터 초기화 ── */
    function _resetFilter() {
        _fState = { pt: '전체', cat: '전체', sup: '', keyword: '', missing: false };
        const kw = document.getElementById('msds-search-kw');
        const sp = document.getElementById('msds-search-sup');
        const ms = document.getElementById('msds-chk-missing');
        if (kw) kw.value = '';
        if (sp) sp.value = '';
        if (ms) ms.checked = false;
        _setPt('전체');
        _setCat('전체');
    }

    /* ── 편집 모달 ── */
    function _edit(matId) {
        const mat = _mats.find(function(m){ return m.id === matId; });
        if (!mat) return;
        const d   = _dict[matId] || {};
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;

        const hazardHTML = HAZARD_ICONS.map(function(h) {
            const chk = (d.hazards || []).includes(h.no) ? 'checked' : '';
            return `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;
                        border-radius:8px;cursor:pointer;border:2px solid ${chk ? h.color : 'var(--border-color)'};
                        background:${chk ? h.color + '18' : 'var(--bg-secondary)'};" id="hz-lbl-${h.no.charCodeAt(0)}">
                    <input type="checkbox" class="msds-hzchk" value="${h.no}" ${chk}
                        onchange="MSDSModule._onHzChange(this,'${h.no}',${h.no.charCodeAt(0)})">
                    <span style="font-size:1.1rem;">${h.sym}</span>
                    <span style="font-size:.8rem;font-weight:700;">${h.no} ${h.label}</span>
                </label>`;
        }).join('');

        /* 기존 첨부 파일 목록 */
        const fileListHTML = (d.files || []).map(function(f, i) {
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;margin-bottom:4px;" id="msds-file-item-${i}">
                <span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;">description</span>
                <span style="flex:1;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.name)}</span>
                <span style="font-size:.72rem;color:var(--text-muted);">${_fmtSize(f.size)}</span>
                <button type="button" class="btn btn-sm" style="padding:2px 8px;font-size:.72rem;color:#2563eb;border:1px solid #2563eb22;"
                    onclick="MSDSModule._downloadFile('${js(matId)}',${i})">다운로드</button>
                <button type="button" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:18px;line-height:1;"
                    onclick="document.getElementById('msds-file-item-${i}').remove();MSDSModule._pendingDelIdx.push(${i})">×</button>
            </div>`;
        }).join('') || `<p style="color:var(--text-muted);font-size:.82rem;margin:4px 0;">첨부된 파일이 없습니다.</p>`;

        _pendingDelIdx = [];

        const body = `
            <!-- 도료명 표시 -->
            <div style="background:var(--bg-secondary);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
                <span class="material-symbols-outlined" style="color:#2563eb;">water_drop</span>
                <div>
                    <p style="margin:0;font-weight:700;">${esc(mat.name)}</p>
                    <p style="margin:0;font-size:.78rem;color:var(--text-muted);">공급사: ${esc(mat.supplier || '-')} &nbsp;|&nbsp; 유형: ${esc(mat.paintType || '-')}</p>
                </div>
            </div>

            <!-- 제품 구분(읽기전용) + 쪽수 + 비고 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">제품 구분
                        <span style="font-size:.7rem;color:var(--text-muted);">(도료 마스터 연동)</span>
                    </label>
                    ${(function(){
                        const pt = _normType(mat.itemType);
                        const ptColor = PROD_COLORS[pt] || '#6b7280';
                        return pt
                            ? `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
                                    background:${ptColor}11;border:1px solid ${ptColor}44;border-radius:6px;">
                                   <span style="font-size:.85rem;font-weight:700;color:${ptColor};">${esc(pt)}</span>
                                   <span style="font-size:.72rem;color:var(--text-muted);">설정 → 도료 정보에서 변경</span>
                               </div>`
                            : `<div style="padding:7px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;font-size:.82rem;color:var(--text-muted);">
                                   미지정 — 설정 → 도료 정보에서 품목구분 등록
                               </div>`;
                    })()}
                </div>
                <div class="form-group">
                    <label class="form-label">쪽수</label>
                    <input class="form-control" id="msds-pageNo" type="number" min="1" value="${esc(d.pageNo || '')}" placeholder="예) 11">
                </div>
                <div class="form-group">
                    <label class="form-label">비고</label>
                    <input class="form-control" id="msds-note" value="${esc(d.note || '')}" placeholder="안전재고1, 대체품명 등">
                </div>
            </div>

            <!-- 경고 표시 -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label">MSDS 경고표시 (해당 항목 체크)</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">${hazardHTML}</div>
            </div>

            <!-- 파일 첨부 -->
            <div class="form-group">
                <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
                    MSDS 파일 첨부 (PDF / ZIP / 이미지)
                    <label style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
                        background:#2563eb;color:#fff;border-radius:6px;font-size:.78rem;font-weight:600;">
                        <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 파일 선택
                        <input type="file" id="msds-fileInput" multiple accept=".pdf,.zip,.jpg,.jpeg,.png,.gif"
                            style="display:none;" onchange="MSDSModule._onFileSelect(this,'${js(matId)}')">
                    </label>
                </label>
                <div id="msds-file-list">${fileListHTML}</div>
                <div id="msds-new-files"></div>
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="MSDSModule._save('${js(matId)}')">저장</button>
        `;

        UIUtils.showModal(`MSDS 편집 — ${esc(mat.name)}`, body, footer, 'lg');
    }

    /* ── 경고 체크 시 라벨 스타일 갱신 ── */
    function _onHzChange(cb, no, charCode) {
        const h = HAZARD_ICONS.find(function(x){ return x.no === no; });
        if (!h) return;
        const lbl = document.getElementById('hz-lbl-' + charCode);
        if (!lbl) return;
        lbl.style.borderColor    = cb.checked ? h.color : 'var(--border-color)';
        lbl.style.background     = cb.checked ? h.color + '18' : 'var(--bg-secondary)';
    }

    /* ── 파일 선택 → 미리보기 추가 ── */
    var _pendingFiles = {};  // matId → [{name,data,type,size}]
    var _pendingDelIdx = [];

    function _onFileSelect(input, matId) {
        if (!input.files || !input.files.length) return;
        if (!_pendingFiles[matId]) _pendingFiles[matId] = [];
        const container = document.getElementById('msds-new-files');
        Array.from(input.files).forEach(function(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const entry = { name: file.name, data: e.target.result, type: file.type, size: file.size };
                _pendingFiles[matId].push(entry);
                if (!container) return;
                const div = document.createElement('div');
                div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid #2563eb44;border-radius:6px;margin-bottom:4px;background:#eff6ff;';
                div.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;">attach_file</span>
                    <span style="flex:1;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${SafetyCommon.esc(file.name)}</span>
                    <span style="font-size:.72rem;color:#6b7280;">${_fmtSize(file.size)}</span>
                    <span style="font-size:.72rem;color:#059669;font-weight:700;">신규</span>`;
                container.appendChild(div);
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    }

    function _fmtSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(0) + 'KB';
        return (bytes / 1048576).toFixed(1) + 'MB';
    }

    /* ── 저장 ── */
    async function _save(matId) {
        const hazards = Array.from(document.querySelectorAll('.msds-hzchk:checked')).map(function(cb){ return cb.value; });

        /* 기존 파일에서 삭제된 것 제거 */
        let files = ((_dict[matId] || {}).files || []).filter(function(_, i){ return _pendingDelIdx.indexOf(i) === -1; });
        /* 신규 파일 추가 */
        files = files.concat(_pendingFiles[matId] || []);
        delete _pendingFiles[matId];
        _pendingDelIdx = [];

        _dict[matId] = {
            hazards,
            pageNo:      document.getElementById('msds-pageNo').value.trim(),
            note:        document.getElementById('msds-note').value.trim(),
            files,
            updatedAt:   SafetyCommon.today()
        };

        await SafetyCommon.save(KEY, _dict);
        UIUtils.closeModal();
        UIUtils.toast('MSDS가 저장되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    /* ── 파일 다운로드 ── */
    function _downloadFile(matId, idx) {
        const f = ((_dict[matId] || {}).files || [])[idx];
        if (!f) return;
        const a = document.createElement('a');
        a.href     = f.data;
        a.download = f.name;
        a.click();
    }

    /* ── 파일 목록 모달 ── */
    function _openFiles(matId) {
        const mat = _mats.find(function(m){ return m.id === matId; });
        const d   = _dict[matId] || {};
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        const files = d.files || [];
        if (!files.length) return;

        const listHTML = files.map(function(f, i) {
            const isImg = f.type && f.type.startsWith('image/');
            const icon  = isImg ? 'image' : (f.type === 'application/pdf' ? 'picture_as_pdf' : 'folder_zip');
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                        border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:22px;color:#2563eb;">${icon}</span>
                <div style="flex:1;overflow:hidden;">
                    <p style="margin:0;font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.name)}</p>
                    <p style="margin:0;font-size:.72rem;color:var(--text-muted);">${_fmtSize(f.size)}</p>
                </div>
                ${isImg ? `<img src="${f.data}" style="height:50px;border-radius:4px;object-fit:cover;">` : ''}
                <button class="btn btn-sm btn-outline" onclick="MSDSModule._downloadFile('${js(matId)}',${i})">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">download</span> 다운로드
                </button>
            </div>`;
        }).join('');

        UIUtils.showModal('MSDS 첨부 파일 — ' + esc(mat ? mat.name : ''),
            `<div>${listHTML}</div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-outline" onclick="UIUtils.closeModal();MSDSModule._edit('${js(matId)}');" style="margin-left:8px;">편집</button>`,
            'md');
    }

    /* ── 도료 기초 정보로 이동 후 편집 모달 오픈 ── */
    function _gotoSettings(matId) {
        UIUtils.toast('설정 → 도료 정보에서 제품 구분을 등록하세요.', 'info');
        if (typeof Router !== 'undefined') Router.navigate('settings');
        setTimeout(function() {
            if (typeof SettingsModule !== 'undefined' && SettingsModule.editPaint) {
                SettingsModule.editPaint(matId);
            }
        }, 350);
    }

    /* ── 세척제 신규 등록 ── */
    function _addCleaner() {
        const esc = SafetyCommon.esc;
        const body = `
            <div style="background:#e0f2fe;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
                <span class="material-symbols-outlined" style="color:#0891b2;">cleaning_services</span>
                <span style="font-size:.85rem;color:#0e7490;">IPA 세척제 · 세척신너 등 세척 소재를 도료 마스터에 등록합니다.</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">도료명 (세척제명) *</label>
                    <input class="form-control" id="cl-name" placeholder="예) IPA 세척제, 세척신너 SP-100">
                </div>
                <div class="form-group">
                    <label class="form-label">세척제 종류</label>
                    <select class="form-control" id="cl-type">
                        <option value="IPA세척제">IPA 세척제</option>
                        <option value="세척신너">세척신너</option>
                        <option value="세척제">기타 세척제</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">제품 구분</label>
                    <select class="form-control" id="cl-itemType">
                        <option value="">-- 미지정 --</option>
                        <option value="양산">양산</option>
                        <option value="A/S">A/S</option>
                        <option value="개발">개발</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">구매처 / 공급사</label>
                    <input class="form-control" id="cl-supplier" placeholder="예) 화인플러스, KCC">
                </div>
                <div class="form-group">
                    <label class="form-label">제조사</label>
                    <input class="form-control" id="cl-manufacturer" placeholder="제조사명">
                </div>
                <div class="form-group">
                    <label class="form-label">포장 용량 (KG)</label>
                    <input class="form-control" id="cl-pack" type="number" placeholder="예) 20">
                </div>
                <div class="form-group">
                    <label class="form-label">유효기한</label>
                    <input class="form-control" id="cl-shelf" placeholder="예) 12개월">
                </div>
            </div>
        `;
        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" style="background:#0891b2;" onclick="MSDSModule._saveCleaner()">
                <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 등록
            </button>
        `;
        UIUtils.showModal('세척제 신규 등록', body, footer, 'md');
    }

    async function _saveCleaner() {
        const name = document.getElementById('cl-name').value.trim();
        if (!name) { UIUtils.toast('도료명을 입력하세요.', 'warning'); return; }

        const newMat = {
            name,
            paintType:    document.getElementById('cl-type').value,
            itemType:     document.getElementById('cl-itemType').value,
            supplier:     document.getElementById('cl-supplier').value.trim(),
            manufacturer: document.getElementById('cl-manufacturer').value.trim(),
            packUnit:     document.getElementById('cl-pack').value.trim(),
            shelfLife:    document.getElementById('cl-shelf').value.trim()
        };

        await Storage.add(DB.STORES.PAINT_MATERIALS, newMat);
        /* 캐시 갱신 */
        _mats = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        UIUtils.closeModal();
        UIUtils.toast(`'${name}' 세척제가 도료 마스터에 등록되었습니다.`, 'success');
        _draw(document.getElementById('contentArea'));
    }

    return { render, _edit, _save, _setPt, _setCat, _applyFilter, _resetFilter,
             _onHzChange, _onFileSelect, _downloadFile, _openFiles,
             _gotoSettings, _addCleaner, _saveCleaner };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyChecklistModule — 안전관리 점검표
════════════════════════════════════════════════════════════════════ */
var SafetyChecklistModule = (function () {
    const KEY = 'safety_checklist_v1';
    let _rows = [];

    // Excel 실제 10개 항목 (안전관리 점검표 시트 기준)
    const DEFAULT_ITEMS = [
        { no: '①', zone: '세척 / 배합·도장 / 레이저·포장', item: '작업자 보호구 착용여부',                                            criteria: '전 공정 작업자 보호구 착용 확인', cycle: '일' },
        { no: '②', zone: '',                                item: '도장부스 출입문 안전장치 작동은 이상 없는가?',                       criteria: '도장부스 출입문 안전장치 정상 작동 확인', cycle: '일' },
        { no: '③', zone: '',                                item: '작업자 휴대폰 지정장소 보관 하는가?',                               criteria: '작업 중 휴대폰 지정 보관함 보관', cycle: '일' },
        { no: '④', zone: '',                                item: '컨베이어 벨트주변 안전관리는 잘 이루어지고 있는가?',                  criteria: '컨베이어 주변 이물질 없음, 안전 확보', cycle: '일' },
        { no: '⑤', zone: '',                                item: '전선 및 배선관리의 안정성은 확보되어 있는가?',                       criteria: '전선·배선 피복 손상 없음, 정리 정돈', cycle: '일' },
        { no: '⑥', zone: '',                                item: '대차적재 이동 시 시야가 확보 되는가?',                              criteria: '대차 이동 시 전방 시야 확보', cycle: '일' },
        { no: '⑦', zone: '',                                item: '인화성 도료 주변에 발화용품이 있지 않는가? (성냥/라이터 등)',        criteria: '도료 보관·사용 구역 발화물 없음', cycle: '일' },
        { no: '⑧', zone: '',                                item: '신체적 과부담 업무가 진행되지 않는가? (단순반복/고중량 이동작업)',   criteria: '고중량 작업 시 보조기구 사용, 2인 1조', cycle: '일' },
        { no: '⑨', zone: '',                                item: '환기에 대한 적정기준은 유지되고 있는가?',                           criteria: '환기팬·후드 정상 작동, 적정 환기 유지', cycle: '일' },
        { no: '⑩', zone: '',                                item: '조명에 대한 적정기준을 유지하고 있는가?',                           criteria: '작업장 조도 기준 이상 유지', cycle: '일' }
    ];

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-checklist', '안전관리 점검표', '정기 안전 점검 기록을 등록·관리합니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;">점검 기록 <span style="color:var(--text-muted);font-size:.85rem;">(${_rows.length}건)</span></h4>
                    <button class="btn btn-primary btn-sm" onclick="SafetyChecklistModule._openAdd()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 점검 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">No</th>
                                    <th style="width:110px;">점검일</th>
                                    <th style="width:90px;">점검구분</th>
                                    <th style="width:90px;">점검자</th>
                                    <th style="width:70px;">항목수</th>
                                    <th style="width:80px;">적합</th>
                                    <th style="width:80px;">부적합</th>
                                    <th style="width:70px;">결과</th>
                                    <th style="width:50px;">사진</th>
                                    <th style="width:90px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${_rows.length === 0 ? `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px;">등록된 점검 기록이 없습니다.</td></tr>` :
                                _rows.map(function (r, i) {
                                    const items = r.items || [];
                                    const ok = items.filter(function (it) { return it.result === '적합'; }).length;
                                    const ng = items.filter(function (it) { return it.result === '부적합'; }).length;
                                    const overallOk = ng === 0 && items.length > 0;
                                    const resultColor = overallOk ? '#059669' : '#dc2626';
                                    const hasImg = r.images && r.images.length > 0;
                                    return `<tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td>${esc(r.checkDate)}</td>
                                        <td style="text-align:center;">
                                            <span style="padding:2px 7px;border-radius:999px;font-size:.75rem;font-weight:700;background:#e0e7ff;color:#4338ca;">${esc(r.checkType || '월간')}</span>
                                        </td>
                                        <td>${esc(r.inspector)}</td>
                                        <td style="text-align:center;">${items.length}</td>
                                        <td style="text-align:center;color:#059669;font-weight:700;">${ok}</td>
                                        <td style="text-align:center;color:#dc2626;font-weight:700;">${ng}</td>
                                        <td style="text-align:center;">
                                            <span style="font-size:.75rem;font-weight:700;padding:2px 7px;border-radius:999px;background:${resultColor}22;color:${resultColor};">
                                                ${overallOk ? '적합' : (ng > 0 ? '부적합' : '-')}
                                            </span>
                                        </td>
                                        <td style="text-align:center;">
                                            ${hasImg ? `<span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6;cursor:pointer;" onclick="SafetyChecklistModule._viewImg('${js(r.id)}')">photo_library</span>` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="SafetyChecklistModule._detail('${js(r.id)}')" style="margin-right:4px;">상세</button>
                                            <button class="btn btn-sm btn-danger" onclick="SafetyChecklistModule._del('${js(r.id)}')">삭제</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _openAdd() {
        const items = DEFAULT_ITEMS.map(function (it) {
            return { id: SafetyCommon.genId(), no: it.no, zone: it.zone, item: it.item, criteria: it.criteria, cycle: it.cycle, result: '적합', action: '' };
        });
        _openModal(null, items);
    }

    function _detail(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (r) _openModal(r, r.items || []);
    }

    function _openModal(row, items) {
        const esc = SafetyCommon.esc;
        const today = SafetyCommon.today();

        const itemsHTML = items.map(function (it) {
            const zoneHtml = it.zone ? `<div style="font-size:.7rem;color:#6b7280;margin-bottom:2px;">(${esc(it.zone)})</div>` : '';
            return `<tr>
                <td style="text-align:center;font-weight:700;font-size:.9rem;color:var(--accent-blue);">${esc(it.no || '')}</td>
                <td style="font-size:.83rem;">${zoneHtml}${esc(it.item)}</td>
                <td style="font-size:.78rem;color:var(--text-muted);">${esc(it.criteria)}</td>
                <td style="text-align:center;font-size:.75rem;">${esc(it.cycle || '일')}</td>
                <td style="text-align:center;">
                    <select class="form-control" style="padding:3px 4px;font-size:.78rem;width:76px;" id="cl-result-${esc(it.id)}">
                        <option value="적합" ${it.result === '적합' ? 'selected' : ''}>적합 ○</option>
                        <option value="부적합" ${it.result === '부적합' ? 'selected' : ''}>부적합 ×</option>
                        <option value="해당없음" ${it.result === '해당없음' ? 'selected' : ''}>해당없음</option>
                    </select>
                </td>
                <td><input class="form-control" style="padding:3px 6px;font-size:.78rem;" id="cl-action-${esc(it.id)}" value="${esc(it.action)}" placeholder="조치내용"></td>
            </tr>`;
        }).join('');

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">점검일 *</label>
                    <input class="form-control" id="cl-date" type="date" value="${esc(row ? row.checkDate : today)}">
                </div>
                <div class="form-group">
                    <label class="form-label">점검구분</label>
                    <select class="form-control" id="cl-type">
                        ${['월간','주간','수시'].map(function (t) {
                            return `<option value="${t}" ${row && row.checkType === t ? 'selected' : ''}>${t}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">점검자(담당자)</label>
                    <input class="form-control" id="cl-inspector" value="${esc(row ? row.inspector : '')}" placeholder="예) 현장 관리자">
                </div>
            </div>
            <div class="data-table-wrapper" style="max-height:340px;overflow-y:auto;margin-bottom:12px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:32px;">항목</th>
                            <th>점검 내용</th>
                            <th style="width:150px;">점검 기준</th>
                            <th style="width:48px;">주기</th>
                            <th style="width:80px;">결과</th>
                            <th style="width:130px;">조치내용</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
            </div>
            ${SafetyImageEditor.imageAreaHTML('clImgContainer')}
        `;

        // Serialize items for save
        const itemsData = JSON.stringify(items).replace(/'/g, "\\'");

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" onclick="SafetyChecklistModule._save('${row ? row.id : ''}', ${itemsData.replace(/"/g, '&quot;')})">
                ${row ? '수정 저장' : '등록'}
            </button>
        `;

        UIUtils.showModal(row ? '점검표 상세' : '안전관리 점검 등록', body, footer, 'xl');

        if (row && row.images) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('clImgContainer', row.images);
            }, 50);
        }
    }

    async function _save(editId, itemsTemplate) {
        const checkDate = document.getElementById('cl-date').value;
        if (!checkDate) { UIUtils.toast('점검일은 필수입니다.', 'warning'); return; }

        // Collect items results
        const items = (itemsTemplate || []).map(function (it) {
            const resultEl = document.getElementById('cl-result-' + it.id);
            const actionEl = document.getElementById('cl-action-' + it.id);
            return {
                id: it.id,
                no: it.no || '',
                zone: it.zone || '',
                item: it.item,
                criteria: it.criteria,
                cycle: it.cycle || '일',
                result: resultEl ? resultEl.value : it.result,
                action: actionEl ? actionEl.value.trim() : it.action
            };
        });

        const row = {
            id: editId || SafetyCommon.genId(),
            checkDate,
            checkType: document.getElementById('cl-type').value,
            inspector: document.getElementById('cl-inspector').value.trim(),
            items,
            images: SafetyImageEditor.collectImages('clImgContainer'),
            updatedAt: SafetyCommon.today()
        };

        if (editId) {
            const idx = _rows.findIndex(function (x) { return x.id === editId; });
            if (idx !== -1) _rows[idx] = row;
        } else {
            _rows.unshift(row);
        }

        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(editId ? '점검 기록이 수정되었습니다.' : '점검 기록이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 점검 기록을 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(function (x) { return x.id !== id; });
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _viewImg(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (!r || !r.images || r.images.length === 0) return;
        const body = `
            ${SafetyImageEditor.imageAreaHTML('clViewImgContainer')}
            <style>#clViewImgContainer .safety-img-delete, #clViewImgContainer .safety-img-resize { display:none!important; }</style>
        `;
        UIUtils.showModal('점검표 첨부 이미지 — ' + SafetyCommon.esc(r.checkDate), body, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
        setTimeout(function () { SafetyImageEditor.renderImageArea('clViewImgContainer', r.images, true); }, 50);
    }

    return { render, _openAdd, _detail, _save, _del, _viewImg };
})();

/* ════════════════════════════════════════════════════════════════════
   PPEStandardModule — 보호구 적용기준
════════════════════════════════════════════════════════════════════ */
var PPEStandardModule = (function () {
    const KEY = 'safety_ppe_v1';
    let _rows = [];

    // Excel 보호구 시트 기준 작업자군 + 계절 (영문/러시아어 공통)
    const WORKER_TYPES = [
        '로딩·세척·레이저·언로딩·포장 작업자 (Line worker)',
        '배합 작업자 (Paint mixing worker)',
        '스프레이 작업자 (Painting worker)'
    ];
    const SEASONS = ['하절기 (Summer)', '동절기 (Winter)', '연중'];

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-ppe', '보호구 적용기준', '공정별 보호구 착용 기준을 등록·관리합니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;">보호구 기준 목록 <span style="color:var(--text-muted);font-size:.85rem;">(${_rows.length}건)</span></h4>
                    <button class="btn btn-primary btn-sm" onclick="PPEStandardModule._openAdd()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 신규 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">No</th>
                                    <th>공정명</th>
                                    <th>보호구명</th>
                                    <th>착용기준</th>
                                    <th>적용조건</th>
                                    <th style="width:130px;">규격/등급</th>
                                    <th style="width:50px;">사진</th>
                                    <th style="width:90px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${_rows.length === 0 ? `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">등록된 보호구 기준이 없습니다.</td></tr>` :
                                _rows.map(function (r, i) {
                                    const hasImg = r.images && r.images.length > 0;
                                    return `<tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td style="font-weight:500;">${esc(r.process)}</td>
                                        <td>${esc(r.ppeName)}</td>
                                        <td style="font-size:.85rem;">${esc(r.criteria)}</td>
                                        <td style="font-size:.85rem;">${esc(r.condition)}</td>
                                        <td><code style="font-size:.8rem;">${esc(r.grade)}</code></td>
                                        <td style="text-align:center;">
                                            ${hasImg ? `<span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6;cursor:pointer;" onclick="PPEStandardModule._view('${js(r.id)}')">photo_library</span>` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="PPEStandardModule._edit('${js(r.id)}')" style="margin-right:4px;">수정</button>
                                            <button class="btn btn-sm btn-danger" onclick="PPEStandardModule._del('${js(r.id)}')">삭제</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _openAdd() { _openModal(null); }
    function _edit(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (r) _openModal(r);
    }

    function _openModal(row) {
        const esc = SafetyCommon.esc;

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">공정명 *</label>
                    <input class="form-control" id="ppe-process" value="${esc(row ? row.process : '')}" placeholder="예) 도장 공정, 사출 공정">
                </div>
                <div class="form-group">
                    <label class="form-label">보호구명 *</label>
                    <input class="form-control" id="ppe-name" value="${esc(row ? row.ppeName : '')}" placeholder="예) 방진마스크, 보안경">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">착용기준</label>
                    <input class="form-control" id="ppe-criteria" value="${esc(row ? row.criteria : '')}" placeholder="착용 기준 상세">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">적용조건</label>
                    <input class="form-control" id="ppe-condition" value="${esc(row ? row.condition : '')}" placeholder="적용 조건 상세">
                </div>
                <div class="form-group">
                    <label class="form-label">규격/등급</label>
                    <input class="form-control" id="ppe-grade" value="${esc(row ? row.grade : '')}" placeholder="예) KFI 2급, KS T 9007">
                </div>
            </div>
            ${SafetyImageEditor.imageAreaHTML('ppeImgContainer')}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PPEStandardModule._save('${row ? row.id : ''}')">
                ${row ? '수정' : '등록'}
            </button>
        `;

        UIUtils.showModal(row ? '보호구 기준 수정' : '보호구 기준 신규 등록', body, footer, 'lg');

        if (row && row.images) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('ppeImgContainer', row.images);
            }, 50);
        }
    }

    async function _save(editId) {
        const process = document.getElementById('ppe-process').value.trim();
        const ppeName = document.getElementById('ppe-name').value.trim();
        if (!process || !ppeName) { UIUtils.toast('공정명과 보호구명은 필수입니다.', 'warning'); return; }

        const row = {
            id: editId || SafetyCommon.genId(),
            process,
            ppeName,
            criteria: document.getElementById('ppe-criteria').value.trim(),
            condition: document.getElementById('ppe-condition').value.trim(),
            grade: document.getElementById('ppe-grade').value.trim(),
            images: SafetyImageEditor.collectImages('ppeImgContainer'),
            updatedAt: SafetyCommon.today()
        };

        if (editId) {
            const idx = _rows.findIndex(function (x) { return x.id === editId; });
            if (idx !== -1) _rows[idx] = row;
        } else {
            _rows.unshift(row);
        }

        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(editId ? '보호구 기준이 수정되었습니다.' : '보호구 기준이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 보호구 기준을 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(function (x) { return x.id !== id; });
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _view(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (!r || !r.images || r.images.length === 0) return;
        const body = `
            ${SafetyImageEditor.imageAreaHTML('ppeViewImgContainer')}
            <style>#ppeViewImgContainer .safety-img-delete, #ppeViewImgContainer .safety-img-resize { display:none!important; }</style>
        `;
        UIUtils.showModal('보호구 사진 — ' + SafetyCommon.esc(r.ppeName), body, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
        setTimeout(function () { SafetyImageEditor.renderImageArea('ppeViewImgContainer', r.images, true); }, 50);
    }

    return { render, _openAdd, _edit, _save, _del, _view };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyRulesModule — 안전수칙 기준서
════════════════════════════════════════════════════════════════════ */
var SafetyRulesModule = (function () {
    const KEY = 'safety_rules_v1';
    let _rows = [];

    const CATEGORIES = ['일반','작업별','금지사항'];

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;

        // Filter state
        const filterCat = container._filterCat || '';

        const filtered = filterCat ? _rows.filter(function (r) { return r.category === filterCat; }) : _rows;

        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-rules', '안전수칙 기준서', '작업별 안전수칙 및 금지사항을 등록·관리합니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <h4 style="margin:0;font-size:1rem;">안전수칙 목록 <span style="color:var(--text-muted);font-size:.85rem;">(${filtered.length}/${_rows.length}건)</span></h4>
                        <div style="display:flex;gap:4px;">
                            <button class="btn btn-sm ${!filterCat ? 'btn-primary' : 'btn-outline'}"
                                    onclick="SafetyRulesModule._filter('')">전체</button>
                            ${CATEGORIES.map(function (c) {
                                const catColor = c === '금지사항' ? '#dc2626' : c === '작업별' ? '#2563eb' : '#059669';
                                return `<button class="btn btn-sm ${filterCat === c ? 'btn-primary' : 'btn-outline'}"
                                    onclick="SafetyRulesModule._filter('${js(c)}')"
                                    style="${filterCat === c ? '' : 'color:'+catColor+';border-color:'+catColor+'20;'}">${c}</button>`;
                            }).join('')}
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="SafetyRulesModule._openAdd()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 신규 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">No</th>
                                    <th style="width:80px;">구분</th>
                                    <th style="width:90px;">수칙번호</th>
                                    <th>제목</th>
                                    <th>내용 미리보기</th>
                                    <th style="width:100px;">등록일</th>
                                    <th style="width:50px;">사진</th>
                                    <th style="width:90px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.length === 0 ? `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">등록된 안전수칙이 없습니다.</td></tr>` :
                                filtered.map(function (r, i) {
                                    const catColor = r.category === '금지사항' ? '#dc2626'
                                        : r.category === '작업별' ? '#2563eb' : '#059669';
                                    const preview = (r.content || '').replace(/\n/g, ' ').slice(0, 60);
                                    const hasImg = r.images && r.images.length > 0;
                                    return `<tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td style="text-align:center;">
                                            <span style="padding:2px 7px;border-radius:999px;font-size:.72rem;font-weight:700;background:${catColor}22;color:${catColor};">${esc(r.category)}</span>
                                        </td>
                                        <td style="text-align:center;font-weight:600;">${esc(r.ruleNo)}</td>
                                        <td style="font-weight:500;">${esc(r.title)}</td>
                                        <td style="font-size:.82rem;color:var(--text-muted);">${esc(preview)}${(r.content || '').length > 60 ? '...' : ''}</td>
                                        <td>${esc(r.createdAt)}</td>
                                        <td style="text-align:center;">
                                            ${hasImg ? `<span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6;cursor:pointer;" onclick="SafetyRulesModule._viewImg('${js(r.id)}')">photo_library</span>` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="SafetyRulesModule._edit('${js(r.id)}')" style="margin-right:4px;">수정</button>
                                            <button class="btn btn-sm btn-danger" onclick="SafetyRulesModule._del('${js(r.id)}')">삭제</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

        // Re-attach filter state
        container._filterCat = filterCat;
    }

    function _filter(cat) {
        const container = document.getElementById('contentArea');
        if (container) {
            container._filterCat = cat;
            _draw(container);
        }
    }

    function _openAdd() { _openModal(null); }
    function _edit(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (r) _openModal(r);
    }

    function _openModal(row) {
        const esc = SafetyCommon.esc;
        const today = SafetyCommon.today();

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">구분</label>
                    <select class="form-control" id="sr-category">
                        ${CATEGORIES.map(function (c) {
                            return `<option value="${c}" ${row && row.category === c ? 'selected' : ''}>${c}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">수칙번호 *</label>
                    <input class="form-control" id="sr-ruleNo" value="${esc(row ? row.ruleNo : '')}" placeholder="예) SR-001">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">제목 *</label>
                    <input class="form-control" id="sr-title" value="${esc(row ? row.title : '')}" placeholder="안전수칙 제목">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">상세내용</label>
                    <textarea class="form-control" id="sr-content" rows="6" style="resize:vertical;" placeholder="안전수칙 상세 내용을 입력하세요.">${esc(row ? row.content : '')}</textarea>
                </div>
            </div>
            ${SafetyImageEditor.imageAreaHTML('srImgContainer')}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SafetyRulesModule._save('${row ? row.id : ''}')">
                ${row ? '수정' : '등록'}
            </button>
        `;

        UIUtils.showModal(row ? '안전수칙 수정' : '안전수칙 신규 등록', body, footer, 'lg');

        if (row && row.images) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('srImgContainer', row.images);
            }, 50);
        }
    }

    async function _save(editId) {
        const ruleNo = document.getElementById('sr-ruleNo').value.trim();
        const title  = document.getElementById('sr-title').value.trim();
        if (!ruleNo || !title) { UIUtils.toast('수칙번호와 제목은 필수입니다.', 'warning'); return; }

        const isEdit = !!editId;
        const row = {
            id: editId || SafetyCommon.genId(),
            category: document.getElementById('sr-category').value,
            ruleNo,
            title,
            content: document.getElementById('sr-content').value.trim(),
            images: SafetyImageEditor.collectImages('srImgContainer'),
            createdAt: isEdit ? (_rows.find(function (x) { return x.id === editId; }) || {}).createdAt || SafetyCommon.today() : SafetyCommon.today(),
            updatedAt: SafetyCommon.today()
        };

        if (isEdit) {
            const idx = _rows.findIndex(function (x) { return x.id === editId; });
            if (idx !== -1) _rows[idx] = row;
        } else {
            _rows.unshift(row);
        }

        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(isEdit ? '안전수칙이 수정되었습니다.' : '안전수칙이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 안전수칙을 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(function (x) { return x.id !== id; });
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _viewImg(id) {
        const r = _rows.find(function (x) { return x.id === id; });
        if (!r || !r.images || r.images.length === 0) return;
        const body = `
            ${SafetyImageEditor.imageAreaHTML('srViewImgContainer')}
            <style>#srViewImgContainer .safety-img-delete, #srViewImgContainer .safety-img-resize { display:none!important; }</style>
        `;
        UIUtils.showModal('안전수칙 첨부 이미지 — ' + SafetyCommon.esc(r.title), body, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
        setTimeout(function () { SafetyImageEditor.renderImageArea('srViewImgContainer', r.images, true); }, 50);
    }

    return { render, _openAdd, _edit, _save, _del, _filter, _viewImg };
})();

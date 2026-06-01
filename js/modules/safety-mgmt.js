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
   SafetyStandardModule — 안전관리 표준서
════════════════════════════════════════════════════════════════════ */
var SafetyStandardModule = (function () {
    const KEY = 'safety_standard_v1';
    let _rows = [];

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-standard', '안전관리 표준서', '안전 업무 프로세스 표준 문서를 등록·관리합니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;">표준서 목록 <span style="color:var(--text-muted);font-size:.85rem;">(${_rows.length}건)</span></h4>
                    <button class="btn btn-primary btn-sm" onclick="SafetyStandardModule._openAdd()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 신규 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">No</th>
                                    <th>문서번호</th>
                                    <th>제목</th>
                                    <th style="width:80px;">개정번호</th>
                                    <th style="width:110px;">개정일자</th>
                                    <th style="width:90px;">작성자</th>
                                    <th style="width:70px;">상태</th>
                                    <th style="width:50px;">이미지</th>
                                    <th style="width:90px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${_rows.length === 0 ? `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px;">등록된 표준서가 없습니다.</td></tr>` :
                                _rows.map(function (r, i) {
                                    const statusColor = r.status === '유효' ? '#059669' : r.status === '폐기' ? '#dc2626' : '#d97706';
                                    const hasImg = r.images && r.images.length > 0;
                                    return `<tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td><code style="font-size:.82rem;">${esc(r.docNo)}</code></td>
                                        <td style="font-weight:500;">${esc(r.title)}</td>
                                        <td style="text-align:center;">Rev.${esc(r.revNo || '0')}</td>
                                        <td>${esc(r.revDate)}</td>
                                        <td>${esc(r.author)}</td>
                                        <td><span style="padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;background:${statusColor}22;color:${statusColor};">${esc(r.status || '유효')}</span></td>
                                        <td style="text-align:center;">
                                            ${hasImg ? `<span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6;cursor:pointer;" onclick="SafetyStandardModule._view('${js(r.id)}')">photo_library</span>` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="SafetyStandardModule._edit('${js(r.id)}')" style="margin-right:4px;">수정</button>
                                            <button class="btn btn-sm btn-danger" onclick="SafetyStandardModule._del('${js(r.id)}')">삭제</button>
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
        const isEdit = !!row;
        const esc = SafetyCommon.esc;
        const today = SafetyCommon.today();

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">문서번호 *</label>
                    <input class="form-control" id="ssd-docNo" value="${esc(row ? row.docNo : '')}" placeholder="예) SS-001">
                </div>
                <div class="form-group">
                    <label class="form-label">개정번호</label>
                    <input class="form-control" id="ssd-revNo" type="number" min="0" value="${esc(row ? (row.revNo || 0) : 0)}">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">제목 *</label>
                    <input class="form-control" id="ssd-title" value="${esc(row ? row.title : '')}" placeholder="표준서 제목">
                </div>
                <div class="form-group">
                    <label class="form-label">개정일자</label>
                    <input class="form-control" id="ssd-revDate" type="date" value="${esc(row ? row.revDate : today)}">
                </div>
                <div class="form-group">
                    <label class="form-label">작성자</label>
                    <input class="form-control" id="ssd-author" value="${esc(row ? row.author : '')}" placeholder="작성자">
                </div>
                <div class="form-group">
                    <label class="form-label">상태</label>
                    <select class="form-control" id="ssd-status">
                        ${['유효','개정중','폐기'].map(function (s) {
                            return `<option value="${s}" ${row && row.status === s ? 'selected' : ''}>${s}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">내용</label>
                    <textarea class="form-control" id="ssd-content" rows="5" style="resize:vertical;">${esc(row ? row.content : '')}</textarea>
                </div>
            </div>
            ${SafetyImageEditor.imageAreaHTML('ssdImgContainer')}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SafetyStandardModule._save('${row ? row.id : ''}')">
                ${isEdit ? '수정' : '등록'}
            </button>
        `;

        UIUtils.showModal(isEdit ? '표준서 수정' : '표준서 신규 등록', body, footer, 'lg');

        if (row && row.images) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('ssdImgContainer', row.images);
            }, 50);
        }
    }

    async function _save(editId) {
        const docNo = document.getElementById('ssd-docNo').value.trim();
        const title = document.getElementById('ssd-title').value.trim();
        if (!docNo || !title) { UIUtils.toast('문서번호와 제목은 필수입니다.', 'warning'); return; }

        const row = {
            id: editId || SafetyCommon.genId(),
            docNo,
            title,
            revNo: parseInt(document.getElementById('ssd-revNo').value, 10) || 0,
            revDate: document.getElementById('ssd-revDate').value,
            author: document.getElementById('ssd-author').value.trim(),
            status: document.getElementById('ssd-status').value,
            content: document.getElementById('ssd-content').value.trim(),
            images: SafetyImageEditor.collectImages('ssdImgContainer'),
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
        UIUtils.toast(editId ? '표준서가 수정되었습니다.' : '표준서가 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 표준서를 삭제하시겠습니까?', async function () {
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
            ${SafetyImageEditor.imageAreaHTML('ssdViewImgContainer')}
            <style>#ssdViewImgContainer .safety-img-delete, #ssdViewImgContainer .safety-img-resize { display:none!important; }</style>
        `;
        UIUtils.showModal('첨부 이미지 — ' + SafetyCommon.esc(r.title), body, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
        setTimeout(function () { SafetyImageEditor.renderImageArea('ssdViewImgContainer', r.images, true); }, 50);
    }

    return { render, _openAdd, _edit, _save, _del, _view };
})();

/* ════════════════════════════════════════════════════════════════════
   MSDSModule — MSDS 등록대장
════════════════════════════════════════════════════════════════════ */
var MSDSModule = (function () {
    const KEY = 'safety_msds_v1';
    let _rows = [];

    const RISK_LEVELS = ['1급(매우위험)','2급(위험)','3급(경고)','4급(주의)','해당없음'];

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-msds', 'MSDS 등록대장', '물질안전보건자료를 등록하고 관리합니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4 style="margin:0;font-size:1rem;">MSDS 목록 <span style="color:var(--text-muted);font-size:.85rem;">(${_rows.length}건)</span></h4>
                    <button class="btn btn-primary btn-sm" onclick="MSDSModule._openAdd()">
                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">add</span> 신규 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">No</th>
                                    <th>물질명(화학물질명)</th>
                                    <th>공급업체</th>
                                    <th style="width:110px;">CAS No.</th>
                                    <th style="width:110px;">위험등급</th>
                                    <th>보관위치</th>
                                    <th style="width:100px;">접수일</th>
                                    <th style="width:100px;">갱신일</th>
                                    <th style="width:50px;">사진</th>
                                    <th style="width:90px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${_rows.length === 0 ? `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px;">등록된 MSDS가 없습니다.</td></tr>` :
                                _rows.map(function (r, i) {
                                    const riskColor = r.riskLevel && r.riskLevel.startsWith('1') ? '#dc2626'
                                        : r.riskLevel && r.riskLevel.startsWith('2') ? '#d97706'
                                        : r.riskLevel && r.riskLevel.startsWith('3') ? '#f59e0b'
                                        : r.riskLevel && r.riskLevel.startsWith('4') ? '#2563eb' : '#6b7280';
                                    const hasImg = r.images && r.images.length > 0;
                                    return `<tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td style="font-weight:500;">${esc(r.chemName)}</td>
                                        <td>${esc(r.supplier)}</td>
                                        <td><code style="font-size:.8rem;">${esc(r.casNo)}</code></td>
                                        <td><span style="font-size:.75rem;font-weight:700;padding:2px 7px;border-radius:999px;background:${riskColor}22;color:${riskColor};">${esc(r.riskLevel || '-')}</span></td>
                                        <td>${esc(r.storageLocation)}</td>
                                        <td>${esc(r.receiptDate)}</td>
                                        <td>${esc(r.updateDate)}</td>
                                        <td style="text-align:center;">
                                            ${hasImg ? `<span class="material-symbols-outlined" style="font-size:16px;color:#3b82f6;cursor:pointer;" onclick="MSDSModule._view('${js(r.id)}')">photo_library</span>` : '-'}
                                        </td>
                                        <td style="text-align:center;">
                                            <button class="btn btn-sm btn-outline" onclick="MSDSModule._edit('${js(r.id)}')" style="margin-right:4px;">수정</button>
                                            <button class="btn btn-sm btn-danger" onclick="MSDSModule._del('${js(r.id)}')">삭제</button>
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
        const today = SafetyCommon.today();

        const body = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">물질명(화학물질명) *</label>
                    <input class="form-control" id="msds-chemName" value="${esc(row ? row.chemName : '')}" placeholder="화학물질명">
                </div>
                <div class="form-group">
                    <label class="form-label">공급업체</label>
                    <input class="form-control" id="msds-supplier" value="${esc(row ? row.supplier : '')}" placeholder="공급업체명">
                </div>
                <div class="form-group">
                    <label class="form-label">CAS No.</label>
                    <input class="form-control" id="msds-casNo" value="${esc(row ? row.casNo : '')}" placeholder="예) 67-64-1">
                </div>
                <div class="form-group">
                    <label class="form-label">위험등급</label>
                    <select class="form-control" id="msds-riskLevel">
                        ${RISK_LEVELS.map(function (lv) {
                            return `<option value="${lv}" ${row && row.riskLevel === lv ? 'selected' : ''}>${lv}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">보관위치</label>
                    <input class="form-control" id="msds-storageLocation" value="${esc(row ? row.storageLocation : '')}" placeholder="보관 위치">
                </div>
                <div class="form-group">
                    <label class="form-label">접수일</label>
                    <input class="form-control" id="msds-receiptDate" type="date" value="${esc(row ? row.receiptDate : today)}">
                </div>
                <div class="form-group">
                    <label class="form-label">갱신일</label>
                    <input class="form-control" id="msds-updateDate" type="date" value="${esc(row ? row.updateDate : today)}">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">비고</label>
                    <textarea class="form-control" id="msds-note" rows="3">${esc(row ? row.note : '')}</textarea>
                </div>
            </div>
            ${SafetyImageEditor.imageAreaHTML('msdsImgContainer')}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="MSDSModule._save('${row ? row.id : ''}')">
                ${row ? '수정' : '등록'}
            </button>
        `;

        UIUtils.showModal(row ? 'MSDS 수정' : 'MSDS 신규 등록', body, footer, 'lg');

        if (row && row.images) {
            setTimeout(function () {
                SafetyImageEditor.renderImageArea('msdsImgContainer', row.images);
            }, 50);
        }
    }

    async function _save(editId) {
        const chemName = document.getElementById('msds-chemName').value.trim();
        if (!chemName) { UIUtils.toast('물질명은 필수입니다.', 'warning'); return; }

        const row = {
            id: editId || SafetyCommon.genId(),
            chemName,
            supplier: document.getElementById('msds-supplier').value.trim(),
            casNo: document.getElementById('msds-casNo').value.trim(),
            riskLevel: document.getElementById('msds-riskLevel').value,
            storageLocation: document.getElementById('msds-storageLocation').value.trim(),
            receiptDate: document.getElementById('msds-receiptDate').value,
            updateDate: document.getElementById('msds-updateDate').value,
            note: document.getElementById('msds-note').value.trim(),
            images: SafetyImageEditor.collectImages('msdsImgContainer'),
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
        UIUtils.toast(editId ? 'MSDS가 수정되었습니다.' : 'MSDS가 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 MSDS를 삭제하시겠습니까?', async function () {
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
            ${SafetyImageEditor.imageAreaHTML('msdsViewImgContainer')}
            <style>#msdsViewImgContainer .safety-img-delete, #msdsViewImgContainer .safety-img-resize { display:none!important; }</style>
        `;
        UIUtils.showModal('MSDS 첨부 이미지 — ' + SafetyCommon.esc(r.chemName), body, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'xl');
        setTimeout(function () { SafetyImageEditor.renderImageArea('msdsViewImgContainer', r.images, true); }, 50);
    }

    return { render, _openAdd, _edit, _save, _del, _view };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyChecklistModule — 안전관리 점검표
════════════════════════════════════════════════════════════════════ */
var SafetyChecklistModule = (function () {
    const KEY = 'safety_checklist_v1';
    let _rows = [];

    const CATEGORIES = ['화재예방','전기안전','설비안전','개인보호구','작업환경','화학물질관리'];
    const DEFAULT_ITEMS = [
        { category: '화재예방', item: '소화기 위치 및 상태 확인', criteria: '소화기 지정 위치에 있고 점검 유효기간 이내' },
        { category: '화재예방', item: '가연성 물질 보관 상태 확인', criteria: '지정 보관 구역 내 밀폐 용기에 보관' },
        { category: '전기안전', item: '전기 배선 절연 상태 확인', criteria: '피복 손상 없이 정상 상태 유지' },
        { category: '전기안전', item: '분전함 개폐 상태 확인', criteria: '분전함 닫힘 상태, 과부하 없음' },
        { category: '설비안전', item: '방호장치 설치 상태 확인', criteria: '모든 회전·절단 부위 방호덮개 설치' },
        { category: '설비안전', item: '비상정지 스위치 작동 확인', criteria: '비상정지 버튼 정상 작동' },
        { category: '개인보호구', item: '보호구 착용 상태 확인', criteria: '작업 특성에 맞는 보호구 착용' },
        { category: '개인보호구', item: '보호구 상태 및 보관 확인', criteria: '보호구 손상 없이 지정 보관함에 보관' },
        { category: '작업환경', item: '환기 시설 작동 확인', criteria: '환기팬·후드 정상 작동' },
        { category: '작업환경', item: '통로 및 작업 공간 정리', criteria: '통로 폭 확보, 불필요 물건 없음' },
        { category: '화학물질관리', item: 'MSDS 게시 상태 확인', criteria: '취급 화학물질 MSDS 현장 게시' },
        { category: '화학물질관리', item: '화학물질 용기 표시 확인', criteria: '용기에 물질명·위험 표시 부착' }
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
        // Default items
        const items = DEFAULT_ITEMS.map(function (it) {
            return { id: SafetyCommon.genId(), category: it.category, item: it.item, criteria: it.criteria, result: '적합', action: '' };
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

        const itemsHTML = items.map(function (it, idx) {
            return `<tr>
                <td style="text-align:center;font-size:.8rem;">${idx + 1}</td>
                <td style="font-size:.8rem;">
                    <span style="padding:1px 6px;border-radius:4px;background:#f1f5f9;font-size:.7rem;color:var(--text-muted);">${esc(it.category)}</span><br>
                    ${esc(it.item)}
                </td>
                <td style="font-size:.78rem;color:var(--text-muted);">${esc(it.criteria)}</td>
                <td style="text-align:center;">
                    <select class="form-control" style="padding:3px 6px;font-size:.8rem;width:80px;" id="cl-result-${esc(it.id)}" data-idx="${idx}">
                        <option value="적합" ${it.result === '적합' ? 'selected' : ''}>적합 ○</option>
                        <option value="부적합" ${it.result === '부적합' ? 'selected' : ''}>부적합 ×</option>
                        <option value="해당없음" ${it.result === '해당없음' ? 'selected' : ''}>해당없음</option>
                    </select>
                </td>
                <td><input class="form-control" style="padding:3px 6px;font-size:.8rem;" id="cl-action-${esc(it.id)}" value="${esc(it.action)}" placeholder="조치내용"></td>
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
                    <label class="form-label">점검자</label>
                    <input class="form-control" id="cl-inspector" value="${esc(row ? row.inspector : '')}" placeholder="점검자명">
                </div>
            </div>
            <div class="data-table-wrapper" style="max-height:320px;overflow-y:auto;margin-bottom:12px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:36px;">No</th>
                            <th>점검항목</th>
                            <th style="width:160px;">기준</th>
                            <th style="width:90px;">결과</th>
                            <th style="width:140px;">조치내용</th>
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
                category: it.category,
                item: it.item,
                criteria: it.criteria,
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

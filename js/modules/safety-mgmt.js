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
        return '<div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;">' +
            MENUS.map(function (m) {
                const active = m.id === activePage;
                return '<button type="button" onclick="Router.navigate(\'' + m.id + '\')"' +
                    ' style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;' +
                    'border:' + (active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)') + ';' +
                    'background:var(--bg-primary);color:var(--text-primary);cursor:pointer;min-width:140px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">' +
                    '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex-shrink:0;' +
                    'background:' + (active ? 'var(--accent-blue)' : 'var(--bg-secondary)') + ';">' +
                    '<span class="material-symbols-outlined" style="font-size:24px;color:' + (active ? '#fff' : 'var(--text-muted)') + ';">' + m.icon + '</span></span>' +
                    '<span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">' + m.label + '</span></button>';
            }).join('') + '</div>';
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

    // 도료 MSDS 관련 GHS 그림문자
    const HAZARD_ICONS = [
        { no: 'GHS02', label: '인화성',    sym: '🔥', color: '#ef4444' },
        { no: 'GHS05', label: '부식성',    sym: '🧪', color: '#d97706' },
        { no: 'GHS06', label: '급성독성',  sym: '☠',  color: '#7c3aed' },
        { no: 'GHS07', label: '경고',      sym: '⚠',  color: '#f59e0b' },
        { no: 'GHS08', label: '건강유해성',sym: '🫁', color: '#be185d' },
        { no: 'GHS09', label: '환경유해성',sym: '🐟', color: '#059669' }
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
        const saved = await Storage.getConfigValue(KEY).catch(function(){ return null; });
        _dict = (saved && !Array.isArray(saved) && typeof saved === 'object') ? saved : {};
        _mats = (typeof Storage !== 'undefined' && DB && DB.STORES)
            ? (Storage.getAll(DB.STORES.PAINT_MATERIALS) || [])
            : [];
        _draw(container);
    }

    /* itemType 정규화: '양산품'→'양산', '개발용'→'개발', 'A/S용'→'A/S' */
    function _normType(raw) {
        if (!raw) return '';
        let s = String(raw).replace(/품$/, '').trim();
        if (s === '개발용') return '개발';
        if (s === 'A/S용' || s === 'AS용' || s === 'AS') return 'A/S';
        if (s === '양산용') return '양산';
        return s;
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

    /* 정렬: 구매처 → 카테고리 → 이름 */
    function _sortedMats() {
        const catOrder = { '세척제': 0, '주제': 1, '경화제': 2, '희석 신너': 3 };
        return _mats.slice().sort(function(a, b) {
            const supA = (a.supplier || '(미등록)').localeCompare(b.supplier || '(미등록)');
            if (supA !== 0) return supA;
            const catA = _paintCat(a), catB = _paintCat(b);
            const ca = catOrder[catA] !== undefined ? catOrder[catA] : 9;
            const cb = catOrder[catB] !== undefined ? catOrder[catB] : 9;
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

        /* 행 HTML — 구매처별 그룹 헤더 삽입 */
        const COL_COUNT = 4 + HAZARD_ICONS.length + 4; // No+제품명+도료유형+제품구분 + GHS + 제조사+파일+비고+작업
        let _lastSup = null;
        let _groupNo = 0;
        const rows = sorted.map(function(mat, i) {
            const d    = _dict[mat.id] || {};
            const hz   = (d.hazards && d.hazards.length > 0) ? d.hazards : ['GHS02', 'GHS07', 'GHS08'];
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
                if (!hasF) return `<span style="color:#e5e7eb;font-size:.8rem;">—</span>`;
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

            /* 구매처 그룹 헤더 */
            let groupHeader = '';
            const supLabel = sup || '(구매처 미등록)';
            if (supLabel !== _lastSup) {
                _lastSup = supLabel;
                _groupNo++;
                groupHeader = `<tr class="msds-sup-header" data-sup="${esc(sup)}"
                    style="background:var(--bg-secondary);border-top:2px solid var(--border-color);">
                    <td colspan="${COL_COUNT}" style="padding:6px 12px;font-size:.78rem;font-weight:700;
                        color:var(--text-secondary);letter-spacing:.03em;">
                        <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:4px;">business</span>
                        ${esc(supLabel)}
                    </td>
                </tr>`;
            }

            return groupHeader + `<tr style="${rowBg}" data-pt="${esc(pt)}" data-cat="${esc(cat)}" data-sup="${esc(sup)}" data-missing="${hasF ? '0' : '1'}">
                <td style="text-align:center;font-size:.8rem;">${i + 1}</td>
                <td style="font-size:.82rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(mat.name)}"><strong>${esc(mat.name)}</strong></td>
                <td style="text-align:center;">${catBadge}</td>
                <td style="text-align:center;">${ptBadge}</td>
                ${HAZARD_ICONS.map(function(h){ return `<td style="text-align:center;">${hCell(h.no)}</td>`; }).join('')}
                <td style="font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(sup)}">${esc(sup || '-')}</td>
                <td style="text-align:center;">${fileCell}</td>
                <td style="font-size:.76rem;color:var(--text-muted);">${esc(d.note || '')}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm btn-outline" onclick="MSDSModule._edit('${js(mat.id)}')">편집</button>
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
                    <!-- 1행: 도료 유형 + 누락 + 초기화 -->
                    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
                        <span style="font-size:.72rem;color:var(--text-muted);margin-right:2px;white-space:nowrap;">도료 유형</span>
                        ${catBtns}
                        <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:.78rem;
                            padding:5px 10px;border-radius:6px;flex-shrink:0;margin-left:8px;
                            border:1px solid ${_fState.missing ? '#dc2626' : 'var(--border-color)'};
                            background:${_fState.missing ? '#dc262611' : 'var(--bg-secondary)'};
                            color:${_fState.missing ? '#dc2626' : 'var(--text-primary)'};">
                            <input type="checkbox" id="msds-chk-missing" ${_fState.missing ? 'checked' : ''}
                                onchange="MSDSModule._applyFilter()" style="accent-color:#dc2626;">
                            ⚠ 누락만
                        </label>
                        <button class="btn btn-sm btn-outline" onclick="MSDSModule._resetFilter()" style="font-size:.76rem;flex-shrink:0;">초기화</button>
                    </div>
                    <!-- 2행: 제품 구분 + 제조사 -->
                    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                        <span style="font-size:.72rem;color:var(--text-muted);margin-right:2px;white-space:nowrap;">제품 구분</span>
                        ${ptBtns}
                        <div style="margin-left:auto;min-width:150px;">
                            <select id="msds-search-sup" class="form-control" style="font-size:.8rem;" onchange="MSDSModule._applyFilter()">
                                <option value="">전체 제조사</option>
                                ${suppliers.map(function(s){
                                    return `<option value="${esc(s)}" ${_fState.sup === s ? 'selected' : ''}>${esc(s)}</option>`;
                                }).join('')}
                            </select>
                        </div>
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
                                <col style="width:200px;">       <!-- 제품명 -->
                                <col style="width:80px;">        <!-- 도료 유형 -->
                                <col style="width:66px;">        <!-- 제품 구분 -->
                                <col style="width:36px;">        <!-- ① -->
                                <col style="width:36px;">        <!-- ② -->
                                <col style="width:36px;">        <!-- ③ -->
                                <col style="width:36px;">        <!-- ④ -->
                                <col style="width:36px;">        <!-- ⑤ -->
                                <col style="width:36px;">        <!-- ⑥ -->
                                <col style="width:110px;">       <!-- 제조사 -->
                                <col style="width:66px;">        <!-- MSDS 파일 -->
                                <col style="width:120px;">       <!-- 비고 -->
                                <col style="width:70px;">        <!-- 작업 -->
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>제품명 (도료명)</th>
                                    <th style="text-align:center;">도료 유형</th>
                                    <th style="text-align:center;">제품 구분</th>
                                    ${HAZARD_ICONS.map(h => `<th style="text-align:center;padding:5px 1px;line-height:1.3;">${h.sym}<br><span style="font-size:.58rem;font-weight:400;color:var(--text-muted);">${h.label}</span></th>`).join('')}
                                    <th>제조사</th>
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
        const supEl = document.getElementById('msds-search-sup');
        const misEl = document.getElementById('msds-chk-missing');
        if (supEl) _fState.sup = supEl.value;
        if (misEl) _fState.missing = misEl.checked;

        const tbody = document.getElementById('msds-tbody');
        if (!tbody) return;

        let visible = 0;
        const rows = Array.from(tbody.rows);
        /* 데이터 행 먼저 필터 */
        rows.forEach(function(tr) {
            if (tr.classList.contains('msds-sup-header')) return;
            const pt      = tr.getAttribute('data-pt')  || '';
            const cat     = tr.getAttribute('data-cat') || '';
            const sup     = tr.getAttribute('data-sup') || '';
            const missing = tr.getAttribute('data-missing') === '1';

            const ptOk  = _fState.pt  === '전체' || pt  === _fState.pt;
            const catOk = _fState.cat === '전체' || cat === _fState.cat;
            const supOk = !_fState.sup     || sup === _fState.sup;
            const misOk = !_fState.missing || missing;

            const show = ptOk && catOk && supOk && misOk;
            tr.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        /* 구매처 헤더: 다음 헤더 전까지 보이는 데이터 행이 없으면 숨김 */
        rows.forEach(function(tr, idx) {
            if (!tr.classList.contains('msds-sup-header')) return;
            var hasVisible = false;
            for (var j = idx + 1; j < rows.length; j++) {
                if (rows[j].classList.contains('msds-sup-header')) break;
                if (rows[j].style.display !== 'none') { hasVisible = true; break; }
            }
            tr.style.display = hasVisible ? '' : 'none';
        });

        const total = rows.filter(function(tr){ return !tr.classList.contains('msds-sup-header'); }).length;
        const lbl = document.getElementById('msds-count-label');
        if (lbl) lbl.textContent = `표시 ${visible} / 전체 ${total}종`;
    }

    /* ── 필터 초기화 ── */
    function _resetFilter() {
        _fState = { pt: '전체', cat: '전체', sup: '', missing: false };
        const sp = document.getElementById('msds-search-sup');
        const ms = document.getElementById('msds-chk-missing');
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

        const DEFAULT_HAZARDS = ['GHS02', 'GHS07', 'GHS08'];
        const effectiveHazards = (d.hazards && d.hazards.length > 0) ? d.hazards : DEFAULT_HAZARDS;
        const hazardHTML = HAZARD_ICONS.map(function(h) {
            const chk = effectiveHazards.includes(h.no) ? 'checked' : '';
            return `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;
                        border-radius:8px;cursor:pointer;border:2px solid ${chk ? h.color : 'var(--border-color)'};
                        background:${chk ? h.color + '18' : 'var(--bg-secondary)'};" id="hz-lbl-${h.no}">
                    <input type="checkbox" class="msds-hzchk" value="${h.no}" ${chk}
                        onchange="MSDSModule._onHzChange(this,'${h.no}')">
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
                <button type="button" class="btn btn-sm" style="padding:2px 8px;font-size:.72rem;color:#dc2626;border:1px solid #dc262622;"
                    onclick="MSDSModule._deleteFile('${js(matId)}',${i})">삭제</button>
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

            <!-- 제품 구분(선택) + 쪽수 + 비고 -->
            <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">제품 구분</label>
                    <select class="form-select" id="msds-itemType">
                        <option value="">-- 미지정 --</option>
                        ${['양산','A/S','개발'].map(function(t){
                            const sel = _normType(mat.itemType) === t ? 'selected' : '';
                            return `<option value="${t}" ${sel}>${t}</option>`;
                        }).join('')}
                    </select>
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
                <label class="form-label">MSDS 파일 첨부 (PDF / ZIP / 이미지)</label>
                <div id="msds-drop-zone"
                    ondragover="event.preventDefault();this.classList.add('msds-drag-over')"
                    ondragleave="this.classList.remove('msds-drag-over')"
                    ondrop="event.preventDefault();this.classList.remove('msds-drag-over');MSDSModule._onDrop(event,'${js(matId)}')"
                    style="border:2px dashed var(--border-color);border-radius:8px;padding:18px 16px;
                           text-align:center;cursor:pointer;transition:border-color .2s,background .2s;
                           background:var(--bg-secondary);"
                    onclick="document.getElementById('msds-fileInput').click()">
                    <span class="material-symbols-outlined" style="font-size:32px;color:var(--text-muted);display:block;margin-bottom:4px;">upload_file</span>
                    <div style="font-size:0.85rem;color:var(--text-muted);">파일을 끌어다 놓거나 클릭해서 선택</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">PDF / ZIP / 이미지 (JPG, PNG, GIF)</div>
                    <input type="file" id="msds-fileInput" multiple accept=".pdf,.zip,.jpg,.jpeg,.png,.gif"
                        style="display:none;" onchange="MSDSModule._onFileSelect(this,'${js(matId)}')">
                </div>
                <div id="msds-file-list" style="margin-top:8px;">${fileListHTML}</div>
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
    function _onHzChange(cb, no) {
        const h = HAZARD_ICONS.find(function(x){ return x.no === no; });
        if (!h) return;
        const lbl = document.getElementById('hz-lbl-' + no);
        if (!lbl) return;
        lbl.style.borderColor    = cb.checked ? h.color : 'var(--border-color)';
        lbl.style.background     = cb.checked ? h.color + '18' : 'var(--bg-secondary)';
    }

    /* ── 드래그&드롭 ── */
    function _onDrop(event, matId) {
        const files = event.dataTransfer && event.dataTransfer.files;
        if (!files || !files.length) return;
        _processFiles(files, matId);
    }

    /* ── 파일 선택 → 대기 목록 추가 (NAS 업로드는 저장 시) ── */
    var _pendingFiles = {};  // matId → [{name, _fileObj, size, type}]
    var _pendingDelIdx = [];

    function _hasKorean(str) {
        return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(str);
    }

    function _processFiles(fileList, matId) {
        if (!_pendingFiles[matId]) _pendingFiles[matId] = [];
        const container = document.getElementById('msds-new-files');
        var rejected = [];
        Array.from(fileList).forEach(function(file) {
            if (_hasKorean(file.name)) {
                rejected.push(file.name);
                return;
            }
            const entry = { name: file.name, _fileObj: file, size: file.size, type: file.type };
            _pendingFiles[matId].push(entry);
            if (!container) return;
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid #2563eb44;border-radius:6px;margin-bottom:4px;background:#eff6ff;';
            div.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;color:#2563eb;">attach_file</span>
                <span style="flex:1;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${SafetyCommon.esc(file.name)}</span>
                <span style="font-size:.72rem;color:#6b7280;">${_fmtSize(file.size)}</span>
                <span style="font-size:.72rem;color:#059669;font-weight:700;">신규</span>`;
            container.appendChild(div);
        });
        if (rejected.length) {
            UIUtils.toast(
                '파일명에 한글이 포함된 파일은 첨부할 수 없습니다.\n영문 파일명으로 변경 후 다시 시도하세요.\n\n' + rejected.join('\n'),
                'error'
            );
        }
    }

    function _onFileSelect(input, matId) {
        if (!input.files || !input.files.length) return;
        _processFiles(input.files, matId);
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
        const hazards  = Array.from(document.querySelectorAll('.msds-hzchk:checked')).map(function(cb){ return cb.value; });
        const itemType = (document.getElementById('msds-itemType') || {}).value || '';

        /* itemType 변경 시 paint_materials 업데이트 */
        const mat = _mats.find(function(m){ return m.id === matId; });
        if (mat && itemType !== _normType(mat.itemType)) {
            try { await Storage.update(DB.STORES.PAINT_MATERIALS, Object.assign({}, mat, { itemType: itemType || '' })); } catch(e) {}
            if (mat) mat.itemType = itemType;
        }

        /* 기존 파일에서 삭제된 것 제거 */
        let files = ((_dict[matId] || {}).files || []).filter(function(_, i){ return _pendingDelIdx.indexOf(i) === -1; });

        /* 신규 파일 → NAS /mnt/nas-photo/MSDS 업로드 (원본 파일명 유지) */
        const pending = _pendingFiles[matId] || [];
        for (var pi = 0; pi < pending.length; pi++) {
            var pf = pending[pi];
            UIUtils.toast('업로드 중 (' + (pi + 1) + '/' + pending.length + '): ' + pf.name, 'info');
            try {
                var uploadedUrl = await ApiClient.uploadPhoto(pf._fileObj, 'MSDS', {
                    noAutoYearMonth: true,
                    filename: pf.name
                });
                files.push({ name: pf.name, url: uploadedUrl, size: pf.size, type: pf.type });
            } catch(uploadErr) {
                UIUtils.toast('업로드 실패: ' + (uploadErr && uploadErr.message ? uploadErr.message : String(uploadErr)), 'error');
                console.error('[MSDS] NAS upload failed:', uploadErr);
                return;
            }
        }
        delete _pendingFiles[matId];
        _pendingDelIdx = [];

        _dict[matId] = {
            hazards,
            pageNo:    document.getElementById('msds-pageNo').value.trim(),
            note:      document.getElementById('msds-note').value.trim(),
            files,
            updatedAt: SafetyCommon.today()
        };

        await Storage.setConfigValue(KEY, _dict);
        UIUtils.closeModal();
        UIUtils.toast('MSDS가 저장되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    /* ── 파일 인쇄 ── */
    async function _printFile(matId, idx) {
        const f = ((_dict[matId] || {}).files || [])[idx];
        if (!f) return;
        const href = f.url ? ApiClient.photoUrl(f.url) : f.data;
        if (!href) return;
        /* 크로스오리진 PDF는 새 탭에서 브라우저 PDF 뷰어로 인쇄 */
        window.open(href, '_blank');
    }

    /* ── 파일 삭제 (NAS + DB) ── */
    async function _deleteFile(matId, idx) {
        const d = _dict[matId] || {};
        const f = (d.files || [])[idx];
        if (!f) return;
        if (!confirm('"' + f.name + '"\n이 파일을 NAS에서도 삭제합니다. 계속하시겠습니까?')) return;

        /* NAS에서 삭제 */
        if (f.url) {
            try { await ApiClient.deletePhoto(f.url); } catch(e) { console.warn('[MSDS] NAS delete failed:', e); }
        }

        /* _dict에서 제거 후 즉시 저장 */
        d.files = (d.files || []).filter(function(_, i){ return i !== idx; });
        _dict[matId] = d;
        try { await Storage.setConfigValue(KEY, _dict); } catch(e) {}

        /* 모달 내 해당 항목 제거 */
        const el = document.getElementById('msds-file-item-' + idx);
        if (el) el.remove();

        /* idx 이후 항목들의 id·버튼 재인덱싱 */
        const list = document.getElementById('msds-file-list');
        if (list) {
            Array.from(list.children).forEach(function(el, newIdx) {
                el.id = 'msds-file-item-' + newIdx;
                const btns = el.querySelectorAll('button');
                if (btns[0]) btns[0].setAttribute('onclick', "MSDSModule._downloadFile('" + matId + "'," + newIdx + ")");
                if (btns[1]) btns[1].setAttribute('onclick', "MSDSModule._deleteFile('" + matId + "'," + newIdx + ")");
            });
        }
        UIUtils.toast(f.name + ' 삭제되었습니다.', 'success');
    }

    /* ── 파일 다운로드 ── */
    async function _downloadFile(matId, idx) {
        const f = ((_dict[matId] || {}).files || [])[idx];
        if (!f) return;

        if (f.url) {
            const href = ApiClient.photoUrl(f.url);
            try {
                UIUtils.toast('다운로드 준비 중…', 'info');
                const resp = await fetch(href);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href     = blobUrl;
                a.download = f.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 2000);
            } catch(e) {
                console.warn('[MSDS] download via fetch failed, opening tab:', e);
                window.open(href, '_blank');
            }
        } else if (f.data) {
            const a = document.createElement('a');
            a.href     = f.data;
            a.download = f.name;
            a.click();
        }
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
                ${isImg && (f.url || f.data) ? `<img src="${f.url ? SafetyCommon.esc(ApiClient.photoUrl(f.url)) : f.data}" style="height:50px;border-radius:4px;object-fit:cover;">` : ''}
                <button class="btn btn-sm btn-outline" onclick="MSDSModule._printFile('${js(matId)}',${i})" title="인쇄">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">print</span>
                </button>
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
        const itemTypes = [
            { value: '양산', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
            { value: 'A/S', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { value: '개발', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
        ];
        const body = `
            <div style="display:flex;flex-direction:column;gap:18px;padding-top:4px;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label" style="font-weight:800;font-size:0.95rem;color:var(--text-primary);margin-bottom:8px;">도료명 (세척제명) <span style="color:#dc2626;">*</span></label>
                    <input class="form-control" id="cl-name" placeholder="예) IPA 세척제, 세척신너 SP-100" autofocus
                        style="height:42px;font-size:.96rem;border-radius:8px;">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">세척제 종류</label>
                        <select class="form-control" id="cl-type" style="height:42px;font-size:.95rem;border-radius:8px;">
                            <option value="IPA세척제">IPA 세척제</option>
                            <option value="세척신너">세척신너</option>
                            <option value="세척제">기타 세척제</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">제품 구분</label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${itemTypes.map(function(item, index){
                                return `<label style="position:relative;display:flex;align-items:center;justify-content:center;min-width:62px;height:42px;padding:0 16px;border-radius:10px;border:1px solid ${item.border};background:${item.bg};color:${item.color};font-size:.95rem;font-weight:800;cursor:pointer;box-sizing:border-box;">
                                    <input type="radio" name="cl-itemType" value="${item.value}" ${index === 0 ? 'checked' : ''} style="position:absolute;opacity:0;pointer-events:none;">
                                    <span>${item.value}</span>
                                </label>`;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <div style="height:1px;background:var(--border-color);"></div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">구매처 / 공급사</label>
                        <input class="form-control" id="cl-supplier" placeholder="예) 화인플러스, KCC"
                            style="height:42px;font-size:.95rem;border-radius:8px;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">제조사</label>
                        <input class="form-control" id="cl-manufacturer" placeholder="제조사명"
                            style="height:42px;font-size:.95rem;border-radius:8px;">
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">포장 용량 (KG)</label>
                        <input class="form-control" id="cl-pack" type="number" min="0" placeholder="예) 20"
                            style="height:42px;font-size:.95rem;border-radius:8px;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-weight:700;margin-bottom:8px;">유효기간</label>
                        <input class="form-control" id="cl-shelf" placeholder="예) 12개월"
                            style="height:42px;font-size:.95rem;border-radius:8px;">
                    </div>
                </div>
            </div>
        `;
        const footer = `
            <div style="display:flex;justify-content:flex-end;gap:10px;width:100%;padding-top:8px;">
                <button class="btn btn-secondary" style="min-width:88px;height:46px;border-radius:14px;font-weight:800;" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" style="background:#0891b2;min-width:118px;height:46px;border-radius:14px;font-weight:800;box-shadow:0 10px 24px rgba(8,145,178,.22);" onclick="MSDSModule._saveCleaner()">
                    <span class="material-symbols-outlined" style="font-size:17px;vertical-align:middle;">add</span> 등록
                </button>
            </div>
        `;
        UIUtils.showModal('세척제 신규 등록', body, footer, 'sm');
    }

    async function _saveCleaner() {
        const name = document.getElementById('cl-name').value.trim();
        if (!name) { UIUtils.toast('도료명을 입력하세요.', 'warning'); return; }

        const newMat = {
            name,
            paintType:    document.getElementById('cl-type').value,
            itemType:     (document.querySelector('input[name="cl-itemType"]:checked') || {}).value || '',
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
             _onHzChange, _onFileSelect, _onDrop, _downloadFile, _printFile, _deleteFile, _openFiles,
             _gotoSettings, _addCleaner, _saveCleaner };
})();

/* ════════════════════════════════════════════════════════════════════
   SafetyChecklistModule — 안전관리 점검표 (월간 일일 일지)
   데이터: { "YYYY-MM": { results:{itemKey:{day:val}}, dailySig:{day:name},
                           monthlySig, note, checker:{writer,reviewer,approver} } }
════════════════════════════════════════════════════════════════════ */
var SafetyChecklistModule = (function () {
    const KEY = 'safety_checklist_v2';
    let _data  = {};
    let _ym    = '';
    let _m     = 1;    // 현재 월 (숫자, _openPhotoModal에서 참조)

    /* 점검 항목 정의 — ①은 3개 서브행 */
    const ITEMS = [
        { key: '①-세척',      no: '①', sub: '세척',      label: '작업자 보호구\n착용여부', rowspan: 3, cycle: '일' },
        { key: '①-배합도장',  no: '',  sub: '배합·도장', label: '',                        rowspan: 0, cycle: '일' },
        { key: '①-레이저포장',no: '',  sub: '레이저,포장',label: '',                        rowspan: 0, cycle: '일' },
        { key: '②', no: '②', sub: '', label: '도장부스 출입문 안전장치 작동은 이상 없는가?',          rowspan: 1, cycle: '일' },
        { key: '③', no: '③', sub: '', label: '작업자 휴대폰 지정장소 보관 하는가?',                  rowspan: 1, cycle: '일' },
        { key: '④', no: '④', sub: '', label: '컨베이어 벨트주변 안전관리는 잘 이루어지고 있는가?',    rowspan: 1, cycle: '일' },
        { key: '⑤', no: '⑤', sub: '', label: '전선 및 배선관리의 안정성은 확보 되어 있는가?',        rowspan: 1, cycle: '일' },
        { key: '⑥', no: '⑥', sub: '', label: '대차적재 이동 시 시야가 확보 되는가?',                 rowspan: 1, cycle: '일' },
        { key: '⑦', no: '⑦', sub: '', label: '인화성 도료 주변에 발화용품이 있지 않는가? (성냥/라이터 등)', rowspan: 1, cycle: '일' },
        { key: '⑧', no: '⑧', sub: '', label: '신체적 과부담 업무가 진행되지 않는가? (단순반복/고중량 이동작업)', rowspan: 1, cycle: '일' },
        { key: '⑨', no: '⑨', sub: '', label: '환기에 대한 적정기준은 유지되고 있는가?',              rowspan: 1, cycle: '일' },
        { key: '⑩', no: '⑩', sub: '', label: '조명에 대한 적정기준을 유지하고 있는가?',              rowspan: 1, cycle: '일' }
    ];
    const TOGGLE = { '': 'O', 'O': '△', '△': 'X', 'X': '' };
    const VAL_STYLE = {
        'O':  'color:#1d4ed8;font-weight:900;',
        '△': 'color:#d97706;font-weight:900;',
        'X':  'color:#dc2626;font-weight:900;'
    };

    async function render(container) {
        const saved = await SafetyCommon.load(KEY);
        _data = (saved && !Array.isArray(saved) && typeof saved === 'object') ? saved : {};
        const now = new Date();
        _ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        _draw(container);
    }

    /* ── 현재 월 데이터 (없으면 빈 객체) ── */
    function _cur() {
        if (!_data[_ym]) _data[_ym] = { results: {}, dailySig: {}, monthlySig: '', note: '', checker: {} };
        return _data[_ym];
    }

    /* ── 달력 일수 ── */
    function _daysInMonth(ym) {
        const [y, m] = ym.split('-').map(Number);
        return new Date(y, m, 0).getDate();
    }

    function _draw(container) {
        const esc   = SafetyCommon.esc;
        const cur   = _cur();
        const days  = _daysInMonth(_ym);
        const [y, m] = _ym.split('-').map(Number);
        _m = m;

        /* 날짜 헤더 (1 ~ days) */
        const dateCols = Array.from({ length: days }, function(_, i) { return i + 1; });

        /* 셀 렌더 */
        /* 셀 렌더 — data-key / data-day 속성으로 행열 특정 */
        function cell(key, day) {
            const val      = ((cur.results[key] || {})[day]) || '';
            const hasPhoto = !!(cur.photos && cur.photos[key] && cur.photos[key][day] && cur.photos[key][day].images && cur.photos[key][day].images.length);
            const st       = VAL_STYLE[val] || 'color:#bbb;';
            const dot      = hasPhoto ? `<span style="position:absolute;top:1px;right:2px;width:5px;height:5px;border-radius:50%;background:#dc2626;"></span>` : '';
            return `<td data-key="${key}" data-day="${day}"
                        style="text-align:center;padding:1px 0;cursor:pointer;border:1px solid #ccc;font-size:.82rem;position:relative;${st}"
                        onclick="SafetyChecklistModule._toggle('${key}',${day})">${dot}${val || '·'}</td>`;
        }

        /* 항목 행 생성 */
        let itemRows = '';
        const s1 = ITEMS[0], s2 = ITEMS[1], s3 = ITEMS[2];
        itemRows += `<tr style="height:40px;">
            <td rowspan="3" style="text-align:center;font-weight:700;border:1px solid #ccc;vertical-align:middle;font-size:.88rem;">①</td>
            <td rowspan="3" style="font-size:.76rem;text-align:center;border:1px solid #ccc;vertical-align:middle;padding:2px 4px;white-space:nowrap;">작업자<br>보호구<br>착용여부</td>
            <td style="font-size:.72rem;text-align:center;border:1px solid #ccc;padding:2px 3px;white-space:nowrap;">${s1.sub}</td>
            <td style="text-align:center;font-size:.68rem;border:1px solid #ccc;white-space:nowrap;">일</td>
            ${dateCols.map(function(d){ return cell(s1.key, d); }).join('')}
            <td style="border:1px solid #ccc;"></td>
        </tr><tr style="height:40px;">
            <td style="font-size:.72rem;text-align:center;border:1px solid #ccc;padding:2px 3px;white-space:nowrap;">${s2.sub}</td>
            <td style="text-align:center;font-size:.68rem;border:1px solid #ccc;">일</td>
            ${dateCols.map(function(d){ return cell(s2.key, d); }).join('')}
            <td style="border:1px solid #ccc;"></td>
        </tr><tr style="height:40px;">
            <td style="font-size:.72rem;text-align:center;border:1px solid #ccc;padding:2px 3px;white-space:nowrap;">${s3.sub}</td>
            <td style="text-align:center;font-size:.68rem;border:1px solid #ccc;">일</td>
            ${dateCols.map(function(d){ return cell(s3.key, d); }).join('')}
            <td style="border:1px solid #ccc;"></td>
        </tr>`;

        ITEMS.slice(3).forEach(function(it) {
            itemRows += `<tr style="height:40px;">
                <td style="text-align:center;font-weight:700;border:1px solid #ccc;font-size:.82rem;">${it.no}</td>
                <td colspan="2" style="font-size:.75rem;border:1px solid #ccc;padding:3px 5px;">${esc(it.label)}</td>
                <td style="text-align:center;font-size:.68rem;border:1px solid #ccc;white-space:nowrap;">일</td>
                ${dateCols.map(function(d){ return cell(it.key, d); }).join('')}
                <td style="border:1px solid #ccc;"></td>
            </tr>`;
        });

        /* 현장관리자 서명 행 — 날짜별 클릭 → 서명 팝업 */
        /* 서명 행 — 로그인 사용자 seal 실시간 참조 */
        const loginUserForSig = _getLoginUser();
        const loginSeal = loginUserForSig && loginUserForSig.seal ? loginUserForSig.seal : null;

        const sigRow = dateCols.map(function(d) {
            const sigData = cur.sigPhotos && cur.sigPhotos[d];
            const sig     = cur.dailySig  && cur.dailySig[d];
            /* 저장된 도장 → 없으면 로그인 사용자 도장(서명 전 미리보기용) */
            const sealImg = (sigData && sigData.sealImage) || null;
            const sigName = sigData && sigData.name;

            let inner;
            if (sig && sealImg) {
                /* 서명 완료 + 도장 있음 */
                inner = `<img src="${SafetyCommon.esc(sealImg)}" style="max-height:30px;max-width:100%;object-fit:contain;" title="${SafetyCommon.esc(sigName||'')}">`;
            } else if (sig) {
                /* 서명 완료, 도장 없음 → 이름 텍스트 */
                inner = `<span style="color:#1d4ed8;font-weight:700;font-size:.58rem;display:block;line-height:1.2;">${SafetyCommon.esc(sig)}</span>`;
            } else {
                /* 미서명 */
                inner = `<span style="color:#d1d5db;font-size:.6rem;">(인)</span>`;
            }

            return `<td data-day="${d}" style="text-align:center;border:1px solid #ccc;padding:1px;cursor:pointer;
                        height:34px;vertical-align:middle;position:relative;"
                        onclick="SafetyChecklistModule._openSig(${d})" title="${d}일 서명">
                        ${inner}
                    </td>`;
        }).join('');

        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-checklist', '안전관리 점검표', '월간 일일 안전점검 일지입니다.')}

            <!-- 월 이동 + 저장 -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-outline" onclick="SafetyChecklistModule._goMonth('${_prevYm(_ym)}')">◀ 이전 달</button>
                <span style="font-size:1rem;font-weight:700;">${y}년 ${m}월</span>
                <button class="btn btn-sm btn-outline" onclick="SafetyChecklistModule._goMonth('${_nextYm(_ym)}')">다음 달 ▶</button>
                <button class="btn btn-sm btn-primary" onclick="SafetyChecklistModule._saveMonth()" style="margin-left:8px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">save</span> 저장
                </button>
                <button class="btn btn-sm btn-outline" onclick="SafetyChecklistModule._printDoc()" style="margin-left:4px;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">print</span> 인쇄
                </button>
            </div>

            <div class="card">
                <div class="card-body" style="padding:8px;overflow-x:auto;">
                    <div id="cl-doc" style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;">

                        <!-- 헤더 -->
                        <table style="width:100%;border-collapse:collapse;">
                            <tr>
                                <td style="border:2px solid #555;padding:6px 10px;width:120px;vertical-align:middle;">
                                    <div style="display:flex;align-items:center;gap:5px;">
                                        <div style="width:32px;height:32px;background:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                            <span style="color:#fff;font-weight:900;font-size:.72rem;">KC</span>
                                        </div>
                                        <div style="font-size:.65rem;font-weight:700;line-height:1.3;">KC 케미칼<br>주식회사</div>
                                    </div>
                                </td>
                                <td style="border:2px solid #555;padding:8px;text-align:center;">
                                    <span style="font-size:1.25rem;font-weight:900;">${y}년 ${m}월 안전관리 점검표</span>
                                </td>
                                <td style="border:2px solid #555;padding:0;vertical-align:top;width:480px;">
                                    <table style="width:100%;border-collapse:collapse;height:100%;">
                                        <tr style="background:#e5e7eb;">
                                            <td rowspan="3" style="border:1px solid #aaa;padding:6px 10px;text-align:center;font-size:.82rem;font-weight:700;vertical-align:middle;white-space:nowrap;">범<br>례</td>
                                            <td style="border:1px solid #aaa;padding:4px 14px;font-size:.82rem;font-weight:600;">양호</td>
                                            <td style="border:1px solid #aaa;padding:4px 16px;text-align:center;font-size:1.1rem;font-weight:900;color:#1d4ed8;">O</td>
                                        </tr>
                                        <tr>
                                            <td style="border:1px solid #aaa;padding:4px 14px;font-size:.78rem;line-height:1.4;">주의요 · 계속관찰</td>
                                            <td style="border:1px solid #aaa;padding:4px 16px;text-align:center;font-size:1.1rem;font-weight:900;color:#d97706;">△</td>
                                        </tr>
                                        <tr>
                                            <td style="border:1px solid #aaa;padding:4px 14px;font-size:.78rem;line-height:1.4;">불량 · 조치필요</td>
                                            <td style="border:1px solid #aaa;padding:4px 16px;text-align:center;font-size:1.1rem;font-weight:900;color:#dc2626;">X</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        <!-- 점검 테이블: table-layout fixed, 내용컬럼 고정 + 날짜컬럼 균등 분배 -->
                        <table style="width:100%;border-collapse:collapse;font-size:.76rem;table-layout:fixed;">
                            <colgroup>
                                <col style="width:26px;">   <!-- 항목번호 -->
                                <col style="width:250px;">  <!-- 점검내용 라벨 -->
                                <col style="width:150px;">  <!-- 서브 구분 -->
                                <col style="width:40px;">   <!-- 주기 -->
                                ${dateCols.map(function(){ return '<col>'; }).join('')}  <!-- 날짜: 균등 분배 -->
                                <col style="width:36px;">   <!-- 비고 -->
                            </colgroup>
                            <thead>
                                <tr style="background:#dbeafe;">
                                    <th style="border:1px solid #aaa;padding:3px 1px;text-align:center;font-size:.7rem;">항<br>목</th>
                                    <th colspan="2" style="border:1px solid #aaa;padding:3px;text-align:center;font-size:.72rem;">점검 내용</th>
                                    <th style="border:1px solid #aaa;padding:2px 0;text-align:center;font-size:.65rem;writing-mode:vertical-rl;letter-spacing:.1em;">점검주기</th>
                                    ${dateCols.map(function(d){ return `<th data-day="${d}" style="border:1px solid #aaa;padding:1px 0;text-align:center;font-size:.7rem;">${d}</th>`; }).join('')}
                                    <th style="border:1px solid #aaa;padding:3px 1px;text-align:center;font-size:.7rem;">비고</th>
                                </tr>
                            </thead>
                            <tbody id="cl-tbody">
                                ${itemRows}
                            </tbody>
                            <tfoot>
                                <tr style="background:#f0fdf4;">
                                    <td colspan="2" style="border:1px solid #aaa;padding:3px;font-weight:700;font-size:.72rem;text-align:center;">점검<br>담당자</td>
                                    <td style="border:1px solid #aaa;padding:3px;font-size:.7rem;text-align:center;">현장<br>관리자</td>
                                    <td style="border:1px solid #aaa;padding:2px 0;font-size:.62rem;text-align:center;writing-mode:vertical-rl;">1회/일 점검</td>
                                    ${sigRow}
                                    <td style="border:1px solid #aaa;"></td>
                                </tr>
                                <tr style="background:#f0fdf4;">
                                    <td colspan="2" style="border:1px solid #aaa;"></td>
                                    <td style="border:1px solid #aaa;padding:3px;font-size:.7rem;text-align:center;">생산<br>부장</td>
                                    <td style="border:1px solid #aaa;padding:2px 0;font-size:.62rem;text-align:center;writing-mode:vertical-rl;">1회/월 말일</td>
                                    ${dateCols.map(function(){ return '<td style="border:1px solid #ccc;"></td>'; }).join('')}
                                    <td style="border:1px solid #aaa;padding:3px;font-size:.72rem;text-align:center;cursor:pointer;"
                                        onclick="SafetyChecklistModule._toggleMonthSig()">
                                        ${cur.monthlySig ? '<span style="color:#1d4ed8;font-weight:700;">(인)</span>' : '<span style="color:#ddd;">(인)</span>'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        <!-- 이상 발생 시 조치 사항 -->
                        <table style="width:100%;border-collapse:collapse;">
                            <tr>
                                <td style="border:2px solid #555;padding:5px 8px;width:100px;font-size:.76rem;font-weight:700;text-align:center;vertical-align:top;">이상 발생 시<br>조치 사항</td>
                                <td style="border:2px solid #555;padding:3px 6px;">
                                    <textarea id="cl-note" style="width:100%;min-height:42px;border:none;resize:vertical;background:transparent;font-family:inherit;font-size:.8rem;"
                                        placeholder="이상 발생 내용 및 조치 사항을 입력하세요.">${esc(cur.note || '')}</textarea>
                                </td>
                            </tr>
                        </table>
                        <div style="display:flex;justify-content:space-between;padding:3px 2px;font-size:.68rem;color:#888;">
                            <span>Rev.00</span><span>케이씨케미칼㈜</span><span>A4 (297 × 210 mm)</span>
                        </div>
                    </div>

                    <!-- 이슈 목록 (인쇄 제외) -->
                    <div style="margin-top:16px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <h4 style="margin:0;font-size:.95rem;">
                                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;color:#dc2626;">report_problem</span>
                                불량·주의 이슈 목록
                            </h4>
                            <span style="font-size:.78rem;color:var(--text-muted);">${y}년 ${m}월 — △/X 항목 전체</span>
                        </div>
                        <div id="cl-issue-list">${_buildIssueListHTML()}</div>
                    </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /* ── 월 이동 ── */
    function _prevYm(ym) {
        const [y, m] = ym.split('-').map(Number);
        return m === 1 ? (y-1) + '-12' : y + '-' + String(m-1).padStart(2,'0');
    }
    function _nextYm(ym) {
        const [y, m] = ym.split('-').map(Number);
        return m === 12 ? (y+1) + '-01' : y + '-' + String(m+1).padStart(2,'0');
    }
    function _goMonth(ym) {
        _ym = ym;
        if (!_data[_ym]) _data[_ym] = { results:{}, dailySig:{}, sigPhotos:{}, photos:{}, monthlySig:'', note:'', checker:{} };
        _draw(document.getElementById('contentArea'));
    }

    /* ── 행/열 하이라이트 적용/제거 (data-key / data-day 기반) ── */
    function _hlApply(key, day) {
        _hlClear();

        /* 행: 같은 key를 가진 모든 결과 셀 → 연노랑 */
        document.querySelectorAll('[data-key="' + key + '"]').forEach(function(c) {
            c.dataset.hl = '1';
            c.style.backgroundColor = '#fef9c3';
        });

        /* 열: 같은 day를 가진 모든 셀(thead th 포함) → 연파랑 */
        document.querySelectorAll('[data-day="' + day + '"]').forEach(function(c) {
            c.dataset.hl = '1';
            /* 날짜 헤더(th) → 진한 파랑 + 흰 글자 */
            if (c.tagName === 'TH') {
                c.dataset.hlOrig = c.style.cssText;
                c.style.backgroundColor = '#1d4ed8';
                c.style.color = '#fff';
                c.style.fontWeight = '900';
            } else {
                c.dataset.hlOrig = c.style.backgroundColor || '';
                c.style.backgroundColor = '#dbeafe';
            }
        });

        /* 교차 셀(클릭한 셀) → 중간 파랑 */
        document.querySelectorAll('[data-key="' + key + '"][data-day="' + day + '"]').forEach(function(c) {
            c.style.backgroundColor = '#93c5fd';
        });
    }

    function _hlClear() {
        document.querySelectorAll('[data-hl="1"]').forEach(function(c) {
            if (c.tagName === 'TH') {
                if (c.dataset.hlOrig !== undefined) { c.style.cssText = c.dataset.hlOrig; delete c.dataset.hlOrig; }
                else { c.style.backgroundColor = ''; c.style.color = ''; c.style.fontWeight = ''; }
            } else {
                c.style.backgroundColor = c.dataset.hlOrig || '';
                if (c.dataset.hlOrig !== undefined) delete c.dataset.hlOrig;
            }
            delete c.dataset.hl;
        });
    }

    /* ── 셀 클릭: 선택 팝업 표시 ── */
    function _toggle(key, day) {
        /* 이미 열려 있는 팝업 제거 */
        const old = document.getElementById('cl-sel-popup');
        if (old) { old.remove(); _hlClear(); return; }

        const cur = _cur();
        const cur_val = ((cur.results[key] || {})[day]) || '';

        const OPTIONS = [
            { val: 'O',  label: 'O',  desc: '양호',        color: '#1d4ed8' },
            { val: '△', label: '△', desc: '주의·계속관찰', color: '#d97706' },
            { val: 'X',  label: 'X',  desc: '불량·조치필요', color: '#dc2626' },
            { val: '',   label: '─',  desc: '취소/초기화',   color: '#9ca3af' }
        ];

        /* 행/열 하이라이트 */
        _hlApply(key, day);

        /* 클릭한 TD 위치 기준 팝업 */
        const td = event.currentTarget || event.target.closest('td');
        const rect = td ? td.getBoundingClientRect() : { left: event.clientX, bottom: event.clientY };

        const popup = document.createElement('div');
        popup.id = 'cl-sel-popup';
        popup.style.cssText = `position:fixed;z-index:9999;
            left:${Math.min(rect.left, window.innerWidth - 220)}px;
            top:${rect.bottom + 4}px;
            background:var(--bg-primary);border:1px solid var(--border-color);
            border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.18);
            padding:6px;display:flex;gap:6px;`;

        OPTIONS.forEach(function(opt) {
            const btn = document.createElement('button');
            const isCur = opt.val === cur_val;
            btn.style.cssText = `border:2px solid ${isCur ? opt.color : opt.color + '44'};
                border-radius:6px;background:${isCur ? opt.color + '18' : 'transparent'};
                cursor:pointer;padding:6px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;
                min-width:46px;`;
            btn.innerHTML = `<span style="font-size:1.3rem;font-weight:900;color:${opt.color};line-height:1;">${opt.label}</span>
                             <span style="font-size:.62rem;color:${opt.color};white-space:nowrap;">${opt.desc}</span>`;
            btn.onclick = function(e) {
                e.stopPropagation();
                popup.remove();
                _hlClear();
                if (!cur.results[key]) cur.results[key] = {};
                if (opt.val === '') {
                    delete cur.results[key][day];
                    _updateCell(key, day, '', cur);
                } else {
                    cur.results[key][day] = opt.val;
                    _updateCell(key, day, opt.val, cur);
                    if (opt.val === '△' || opt.val === 'X') {
                        _openPhotoModal(key, day, opt.val);
                    }
                }
            };
            popup.appendChild(btn);
        });

        document.body.appendChild(popup);

        /* 외부 클릭 시 닫기 + 하이라이트 제거 */
        setTimeout(function() {
            document.addEventListener('click', function handler(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    _hlClear();
                    document.removeEventListener('click', handler);
                }
            });
        }, 50);
    }

    function _updateCell(key, day, val, cur) {
        const st = VAL_STYLE[val] || 'color:#bbb;';
        const hasPhoto = !!(cur.photos && cur.photos[key] && cur.photos[key][day] && cur.photos[key][day].images && cur.photos[key][day].images.length);
        const dot = hasPhoto ? `<span style="position:absolute;top:1px;right:2px;width:5px;height:5px;border-radius:50%;background:#dc2626;"></span>` : '';
        document.querySelectorAll('#cl-tbody td[onclick]').forEach(function(td) {
            const a = td.getAttribute('onclick') || '';
            if (a.includes("'" + key + "'," + day + ")")) {
                td.style.cssText = 'text-align:center;padding:1px 0;cursor:pointer;border:1px solid #ccc;font-size:.82rem;position:relative;' + st;
                td.innerHTML = dot + (val || '·');
            }
        });
    }

    /* ── △/X 사진 등록 팝업 ── */
    /* ── △/X 사진·조치 등록 팝업 (문제점 + 조치 2단 구성) ── */
    /* ── △/X 클릭 시: 문제점만 등록 ── */
    function _openPhotoModal(key, day, val) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        const cur = _cur();
        const ex  = (cur.photos && cur.photos[key] && cur.photos[key][day]) || {};
        const valLabel = val === '△' ? '⚠ 주의요 · 계속관찰' : '✖ 불량 · 조치필요';
        const valColor = val === '△' ? '#d97706' : '#dc2626';
        const itLabel  = ITEMS.find(function(it){ return it.key === key; });
        const itName   = itLabel ? (itLabel.label || itLabel.sub || itLabel.no) : key;

        const body = `
            <div style="background:${valColor}11;border-left:4px solid ${valColor};border-radius:6px;
                        padding:8px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:.95rem;font-weight:700;color:${valColor};">${valLabel}</span>
                <span style="font-size:.82rem;color:var(--text-muted);">${_m}월 ${day}일</span>
                <span style="font-size:.8rem;background:var(--bg-secondary);border-radius:4px;padding:2px 8px;">${esc(itName)}</span>
            </div>

            <div style="border:1px solid #fbbf24;border-radius:8px;padding:14px;background:#fffbeb;">
                <p style="margin:0 0 10px;font-size:.88rem;font-weight:700;color:#92400e;">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">warning</span>
                    문제점 내용
                </p>
                <div class="form-group" style="margin-bottom:10px;">
                    <textarea class="form-control" id="clp-problem" rows="4" style="resize:vertical;"
                        placeholder="발생한 문제 상황을 상세히 입력하세요.">${esc(ex.problem || '')}</textarea>
                </div>
                ${SafetyImageEditor.imageAreaHTML('clpProblemImg')}
            </div>
            <p style="margin:10px 0 0;font-size:.78rem;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
                조치 내용은 하단 이슈 목록에서 등록하세요.
            </p>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" onclick="SafetyChecklistModule._savePhoto('${js(key)}',${day})">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">save</span> 문제점 저장
            </button>
        `;

        UIUtils.showModal('문제점 등록', body, footer, 'md');

        setTimeout(function(){
            if (ex.problemImages && ex.problemImages.length)
                SafetyImageEditor.renderImageArea('clpProblemImg', ex.problemImages);
        }, 60);
    }

    async function _savePhoto(key, day) {
        const cur = _cur();
        if (!cur.photos) cur.photos = {};
        if (!cur.photos[key]) cur.photos[key] = {};
        /* 기존 조치 정보는 유지하고 문제점만 갱신 */
        const prev = cur.photos[key][day] || {};
        cur.photos[key][day] = Object.assign({}, prev, {
            problem:       (document.getElementById('clp-problem') || {}).value || '',
            problemImages: SafetyImageEditor.collectImages('clpProblemImg'),
            updatedAt:     SafetyCommon.today()
        });
        await SafetyCommon.save(KEY, _data);
        UIUtils.closeModal();
        UIUtils.toast('문제점이 저장되었습니다.', 'success');
        _updateCell(key, day, (cur.results[key] || {})[day] || '', cur);
        _refreshIssueList();
    }

    /* ── 이슈 목록에서 조치 등록 ── */
    function _openActionModal(key, day) {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        const cur = _cur();
        const ex  = (cur.photos && cur.photos[key] && cur.photos[key][day]) || {};
        const val = (cur.results[key] || {})[day] || '';
        const valColor = val === 'X' ? '#dc2626' : '#d97706';
        const itLabel  = ITEMS.find(function(it){ return it.key === key; });
        const itName   = itLabel ? (itLabel.label || itLabel.sub || itLabel.no) : key;

        const body = `
            <!-- 문제점 요약 (읽기 전용) -->
            <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
                <p style="margin:0 0 4px;font-size:.78rem;font-weight:700;color:#92400e;">
                    <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">warning</span>
                    문제점 — ${_m}월 ${day}일 · ${esc(itName)}
                </p>
                <p style="margin:0;font-size:.82rem;color:#78350f;">${esc(ex.problem || '(문제점 내용 없음)')}</p>
            </div>

            <!-- 조치 내용 -->
            <div style="border:1px solid #6ee7b7;border-radius:8px;padding:14px;background:#f0fdf4;">
                <p style="margin:0 0 10px;font-size:.88rem;font-weight:700;color:#065f46;">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">build</span>
                    조치 내용
                </p>
                <div class="form-group" style="margin-bottom:10px;">
                    <textarea class="form-control" id="cla-action" rows="4" style="resize:vertical;"
                        placeholder="취한 조치 내용을 입력하세요.">${esc(ex.action || '')}</textarea>
                </div>
                ${SafetyImageEditor.imageAreaHTML('claActionImg')}
                <label style="display:inline-flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;
                    padding:8px 12px;background:#dcfce7;border-radius:6px;border:1px solid #6ee7b7;">
                    <input type="checkbox" id="cla-resolved" style="accent-color:#059669;width:16px;height:16px;"
                        ${ex.resolved ? 'checked' : ''}>
                    <span style="font-size:.88rem;font-weight:700;color:#059669;">조치 완료 — 문제 해소됨</span>
                </label>
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" style="background:#059669;" onclick="SafetyChecklistModule._saveAction('${js(key)}',${day})">
                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">check_circle</span> 조치 저장
            </button>
        `;

        UIUtils.showModal('조치 내용 등록', body, footer, 'md');

        setTimeout(function(){
            if (ex.actionImages && ex.actionImages.length)
                SafetyImageEditor.renderImageArea('claActionImg', ex.actionImages);
        }, 60);
    }

    async function _saveAction(key, day) {
        const cur = _cur();
        if (!cur.photos) cur.photos = {};
        if (!cur.photos[key]) cur.photos[key] = {};
        const prev = cur.photos[key][day] || {};
        cur.photos[key][day] = Object.assign({}, prev, {
            action:       (document.getElementById('cla-action')   || {}).value || '',
            actionImages: SafetyImageEditor.collectImages('claActionImg'),
            resolved:     !!(document.getElementById('cla-resolved') || {}).checked,
            resolvedAt:   SafetyCommon.today()
        });
        await SafetyCommon.save(KEY, _data);
        UIUtils.closeModal();
        UIUtils.toast('조치 내용이 저장되었습니다.', 'success');
        _updateCell(key, day, (cur.results[key] || {})[day] || '', cur);
        _refreshIssueList();
    }

    /* ── 이슈 목록 렌더 (점검표 하단) ── */
    function _refreshIssueList() {
        const el = document.getElementById('cl-issue-list');
        if (!el) return;
        el.innerHTML = _buildIssueListHTML();
    }

    function _buildIssueListHTML() {
        const esc = SafetyCommon.esc;
        const js  = SafetyCommon.js;
        const cur = _cur();

        /* 모든 △/X 항목 수집 */
        const issues = [];
        ITEMS.forEach(function(it) {
            const dayMap = (cur.results && cur.results[it.key]) || {};
            Object.keys(dayMap).forEach(function(d) {
                const v = dayMap[d];
                if (v === '△' || v === 'X') {
                    const ph = (cur.photos && cur.photos[it.key] && cur.photos[it.key][Number(d)]) || {};
                    issues.push({ key: it.key, day: Number(d), val: v, item: it, ph: ph });
                }
            });
        });
        issues.sort(function(a, b){ return a.day - b.day || (a.val === 'X' ? -1 : 1); });

        if (!issues.length) return `<p style="color:var(--text-muted);font-size:.85rem;padding:12px 0;">이번 달 △/X 항목이 없습니다.</p>`;

        return issues.map(function(iss) {
            const valColor = iss.val === 'X' ? '#dc2626' : '#d97706';
            const valLabel = iss.val === 'X' ? '✖ 불량·조치필요' : '⚠ 주의요·계속관찰';
            const resolved = iss.ph.resolved;
            const itName   = iss.item.label || iss.item.sub || iss.item.no;
            const probPic  = iss.ph.problemImages && iss.ph.problemImages.length;
            const actPic   = iss.ph.actionImages  && iss.ph.actionImages.length;

            return `
            <div style="border:1px solid ${resolved ? '#6ee7b7' : valColor + '55'};border-radius:8px;padding:10px 14px;
                        background:${resolved ? '#f0fdf4' : valColor + '08'};margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                    <span style="font-size:.78rem;font-weight:700;background:${valColor}22;color:${valColor};
                        border-radius:4px;padding:2px 8px;">${valLabel}</span>
                    <span style="font-size:.8rem;font-weight:700;">${_m}월 ${iss.day}일</span>
                    <span style="font-size:.78rem;color:var(--text-muted);">${esc(itName)}</span>
                    ${resolved
                        ? `<span style="margin-left:auto;font-size:.75rem;font-weight:700;color:#059669;background:#dcfce7;border-radius:4px;padding:2px 8px;">✔ 조치 완료</span>`
                        : `<span style="margin-left:auto;font-size:.75rem;color:#dc2626;background:#fee2e2;border-radius:4px;padding:2px 8px;">미조치</span>`
                    }
                    <button class="btn btn-sm btn-outline" style="font-size:.72rem;"
                        onclick="SafetyChecklistModule._openPhotoModal('${js(iss.key)}',${iss.day},'${iss.val}')">문제점 편집</button>
                    <button class="btn btn-sm" style="font-size:.72rem;background:#059669;color:#fff;border:none;"
                        onclick="SafetyChecklistModule._openActionModal('${js(iss.key)}',${iss.day})">
                        ${resolved ? '조치 수정' : '조치 등록'}
                    </button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.8rem;">
                    <div>
                        <p style="margin:0 0 2px;font-weight:600;color:#92400e;">문제점</p>
                        <p style="margin:0;color:var(--text-muted);">${esc(iss.ph.problem || '—')}</p>
                        ${probPic ? `<span style="font-size:.72rem;color:#2563eb;">📷 사진 ${iss.ph.problemImages.length}장</span>` : ''}
                    </div>
                    <div>
                        <p style="margin:0 0 2px;font-weight:600;color:#065f46;">조치 내용</p>
                        <p style="margin:0;color:var(--text-muted);">${esc(iss.ph.action || '—')}</p>
                        ${actPic ? `<span style="font-size:.72rem;color:#2563eb;">📷 사진 ${iss.ph.actionImages.length}장</span>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    /* ── 현장관리자 서명 팝업 ── */
    /* ── 현재 로그인 사용자 + seal 이미지 가져오기 ── */
    function _getLoginUser() {
        try {
            if (typeof AuthModule === 'undefined') return null;
            const session = AuthModule.getCurrentUser();
            if (!session) return null;
            const users   = AuthModule.getUsers ? AuthModule.getUsers() : [];
            const full    = users.find(function(u){ return u.id === session.id; });
            return full || session;
        } catch(e) { return null; }
    }

    function _openSig(day) {
        const esc      = SafetyCommon.esc;
        const js       = SafetyCommon.js;
        const cur      = _cur();
        const existing = (cur.sigPhotos && cur.sigPhotos[day]) || {};
        const loginUser = _getLoginUser();

        /* 현재 등록된 서명 또는 로그인 사용자 기본값 */
        const sigName  = existing.name || (loginUser ? loginUser.displayName || loginUser.username : '');
        const sealImg  = existing.sealImage || (loginUser ? loginUser.seal : null);
        const hasSeal  = !!sealImg;

        const sealPreview = hasSeal
            ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;">
                   <p style="margin:0;font-size:.78rem;color:var(--text-muted);">등록된 서명 도장</p>
                   <img src="${esc(sealImg)}" style="max-height:80px;max-width:160px;object-fit:contain;
                       border:1px solid var(--border-color);border-radius:6px;padding:6px;background:#fff;">
               </div>`
            : `<div style="padding:10px;background:var(--bg-secondary);border-radius:6px;margin-bottom:14px;
                    font-size:.78rem;color:var(--text-muted);text-align:center;">
                   등록된 도장 이미지 없음 — 설정 &gt; 사용자 관리에서 도장을 등록하세요.
               </div>`;

        const autoSignBtn = loginUser
            ? `<button type="button" class="btn btn-primary" style="width:100%;margin-bottom:14px;"
                   onclick="SafetyChecklistModule._autoSign(${day})">
                   <span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">how_to_reg</span>
                   ${loginUser.displayName || loginUser.username} 로 자동 서명
               </button>`
            : '';

        const body = `
            <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;
                        padding:8px 12px;margin-bottom:14px;">
                <span style="font-size:.88rem;font-weight:700;color:#2563eb;">${_m}월 ${day}일 — 현장 관리자 점검 서명</span>
                ${loginUser ? `<span style="font-size:.78rem;color:var(--text-muted);margin-left:8px;">로그인: ${esc(loginUser.displayName || loginUser.username)}</span>` : ''}
            </div>

            ${autoSignBtn}
            ${sealPreview}
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${existing.name || existing.sealImage
                ? `<button class="btn btn-danger btn-sm" onclick="SafetyChecklistModule._clearSig(${day})" style="margin-right:auto;">서명 삭제</button>`
                : ''}
            <button class="btn btn-outline" onclick="SafetyChecklistModule._saveSig(${day})">서명 완료</button>
        `;

        UIUtils.showModal('현장관리자 서명', body, footer, 'sm');
    }

    /* ── 자동 서명: 로그인 사용자 + 도장 이미지 자동 등록 ── */
    async function _autoSign(day) {
        const loginUser = _getLoginUser();
        if (!loginUser) { UIUtils.toast('로그인이 필요합니다.', 'warning'); return; }
        const cur = _cur();
        if (!cur.sigPhotos) cur.sigPhotos = {};
        cur.sigPhotos[day] = {
            name:       loginUser.displayName || loginUser.username,
            sealImage:  loginUser.seal || null,
            userId:     loginUser.id,
            signedAt:   SafetyCommon.today()
        };
        cur.dailySig[day] = loginUser.displayName || loginUser.username;
        await SafetyCommon.save(KEY, _data);
        UIUtils.closeModal();
        UIUtils.toast(_m + '월 ' + day + '일 자동 서명 완료.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    async function _saveSig(day) {
        const cur       = _cur();
        const loginUser = _getLoginUser();
        const name      = loginUser ? (loginUser.displayName || loginUser.username) : '✓';
        if (!cur.sigPhotos) cur.sigPhotos = {};
        const prev = cur.sigPhotos[day] || {};
        cur.sigPhotos[day] = Object.assign({}, prev, {
            name,
            sealImage: (loginUser && loginUser.seal) || prev.sealImage || null,
            userId:    loginUser ? loginUser.id : null,
            signedAt:  SafetyCommon.today()
        });
        cur.dailySig[day] = name;
        await SafetyCommon.save(KEY, _data);
        UIUtils.closeModal();
        UIUtils.toast(day + '일 서명이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    async function _clearSig(day) {
        const cur = _cur();
        delete cur.dailySig[day];
        if (cur.sigPhotos) delete cur.sigPhotos[day];
        await SafetyCommon.save(KEY, _data);
        UIUtils.closeModal();
        _draw(document.getElementById('contentArea'));
    }

    function _toggleMonthSig() {
        const cur = _cur();
        cur.monthlySig = cur.monthlySig ? '' : '✓';
        _draw(document.getElementById('contentArea'));
    }

    /* ── 저장 ── */
    async function _saveMonth() {
        const cur = _cur();
        const noteEl = document.getElementById('cl-note');
        if (noteEl) cur.note = noteEl.value;
        await SafetyCommon.save(KEY, _data);
        UIUtils.toast(_ym + ' 점검표가 저장되었습니다.', 'success');
    }

    /* ── 인쇄 ── */
    function _printDoc() {
        const el = document.getElementById('cl-doc');
        if (!el) return;
        const w = window.open('', '_blank', 'width=1200,height=800');
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>안전관리 점검표</title>
            <style>
                body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:8mm;font-size:8pt;}
                table{border-collapse:collapse;width:100%;}
                td,th{border:1px solid #555;padding:2px 3px;font-size:7.5pt;}
                textarea{border:none;resize:none;font-family:inherit;font-size:7.5pt;width:100%;}
                @page{size:A4 landscape;margin:8mm;}
            </style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(function(){ w.print(); }, 400);
    }

    return { render, _toggle, _openSig, _autoSign, _saveSig, _clearSig, _toggleMonthSig,
             _openPhotoModal, _savePhoto, _openActionModal, _saveAction,
             _goMonth, _saveMonth, _printDoc, _refreshIssueList };
})();

/* ════════════════════════════════════════════════════════════════════
   PPEStandardModule — 공정별 보호구 착용 기준서 (단일 문서)
════════════════════════════════════════════════════════════════════ */
var PPEStandardModule = (function () {
    const KEY = 'safety_ppe_v2';
    let _doc = null;

    /* 기본 작업자 구역 정의 */
    const DEFAULT_SECTIONS = [
        { id: 's1', title: '로딩·세척·레이저·언로딩·포장 작업자', titleEn: 'Line worker',
          subGroups: [
              { label: '하절기', labelEn: 'Summer season', images: [] },
              { label: '동절기', labelEn: 'Winter season', images: [] }
          ]
        },
        { id: 's2', title: '배합 작업자', titleEn: 'Paint mixing worker',
          subGroups: [{ label: '', labelEn: '', images: [] }]
        },
        { id: 's3', title: '스프레이 작업자', titleEn: 'Painting worker',
          subGroups: [{ label: '', labelEn: '', images: [] }]
        }
    ];

    /* 기본 보호구 목록 */
    const DEFAULT_PPE = [
        { name: '장갑',      nameEn: 'Gloves',                    image: null },
        { name: '방진복',    nameEn: 'Anti-static clothing',      image: null },
        { name: '제전슬리퍼', nameEn: 'Work slippers',             image: null },
        { name: '보호장갑',  nameEn: 'Protective gloves',         image: null },
        { name: '방독마스크', nameEn: 'Gas mask',                  image: null },
        { name: '보안경',    nameEn: 'Safety glasses',            image: null },
        { name: '방진복',    nameEn: 'Anti-static clothing',      image: null },
        { name: '제전슬리퍼', nameEn: 'Work slippers',             image: null }
    ];

    async function render(container) {
        const saved = await SafetyCommon.load(KEY);
        _doc = (saved && !Array.isArray(saved) && typeof saved === 'object') ? saved : null;
        _draw(container);
    }

    function _draw(container) {
        const d = _doc;
        container.innerHTML = `<div class="fade-in-up">
            ${SafetyProcessUI.renderSection('safety-ppe', '보호구 적용기준', '공정별 보호구 착용 기준서입니다.')}
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                    <h4 style="margin:0;font-size:1rem;">공정별 보호구 착용 기준서</h4>
                    <div style="display:flex;gap:6px;">
                        ${d ? `<button class="btn btn-sm btn-outline" onclick="PPEStandardModule._print()">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">print</span> 인쇄
                        </button>` : ''}
                        <button class="btn btn-sm btn-primary" onclick="PPEStandardModule._edit()">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span>
                            ${d ? '편집' : '작성'}
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;overflow-x:auto;">
                    <div id="ppe-doc">
                        ${d ? _docHTML(d) : _emptyHTML()}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _emptyHTML() {
        return `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
            <span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px;opacity:.4;">security</span>
            <p style="margin:0 0 16px;">아직 작성된 보호구 기준서가 없습니다.</p>
            <button class="btn btn-primary" onclick="PPEStandardModule._edit()">작성 시작</button>
        </div>`;
    }

    function _docHTML(d) {
        const esc = SafetyCommon.esc;
        const sections = d.sections && d.sections.length ? d.sections : DEFAULT_SECTIONS;
        const ppeItems = d.ppeItems && d.ppeItems.length ? d.ppeItems : DEFAULT_PPE;

        /* 개정이력 행 */
        const revHist = d.revHistory && d.revHistory.length ? d.revHistory : [];
        while (revHist.length < 4) revHist.push({ no: revHist.length, date: '', content: '', writer: '', reviewer: '', approver: '' });
        const revRows = revHist.slice(0, 4).map(function(h) {
            return `<tr>
                <td style="border:1px solid #888;padding:3px 5px;text-align:center;font-size:.72rem;">${esc(h.no !== undefined ? h.no : '')}</td>
                <td style="border:1px solid #888;padding:3px 5px;text-align:center;font-size:.72rem;">${esc(h.date)}</td>
                <td style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">${esc(h.content)}</td>
                <td style="border:1px solid #888;padding:3px 5px;text-align:center;font-size:.72rem;min-width:44px;">${esc(h.writer)}</td>
                <td style="border:1px solid #888;padding:3px 5px;text-align:center;font-size:.72rem;min-width:44px;">${esc(h.reviewer)}</td>
                <td style="border:1px solid #888;padding:3px 5px;text-align:center;font-size:.72rem;min-width:44px;">${esc(h.approver)}</td>
            </tr>`;
        }).join('');

        /* 작업자 구역 컬럼 */
        const sectionCols = sections.map(function(sec) {
            const subHTML = sec.subGroups && sec.subGroups.length
                ? sec.subGroups.map(function(sg) {
                    const imgs = sg.images && sg.images.length
                        ? sg.images.map(function(img) {
                            return `<img src="${img.data || img}" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:4px;margin:2px;">`;
                          }).join('')
                        : `<div style="background:#f3f4f6;border-radius:6px;padding:20px;text-align:center;color:#aaa;font-size:.78rem;">사진 없음</div>`;
                    const labelHTML = sg.label
                        ? `<p style="margin:6px 0 4px;font-size:.85rem;font-weight:700;">${esc(sg.label)}
                               <span style="font-size:.75rem;font-weight:400;color:#666;">${esc(sg.labelEn)}</span>
                           </p>`
                        : '';
                    return `<div style="margin-bottom:8px;">${labelHTML}<div style="display:flex;flex-wrap:wrap;gap:4px;">${imgs}</div></div>`;
                  }).join('')
                : '';
            return `<td style="border:1px solid #aaa;padding:8px;vertical-align:top;width:${Math.floor(100/sections.length)}%;">
                ${subHTML}
            </td>`;
        }).join('');

        /* 보호구 목록 */
        const ppeHTML = ppeItems.map(function(item) {
            const imgHTML = item.image
                ? `<img src="${esc(item.image)}" style="max-height:70px;max-width:100%;object-fit:contain;">`
                : `<div style="height:60px;background:#f3f4f6;border-radius:4px;display:flex;align-items:center;justify-content:center;">
                       <span class="material-symbols-outlined" style="color:#d1d5db;font-size:28px;">shield</span>
                   </div>`;
            return `<td style="border:1px solid #aaa;padding:6px;text-align:center;vertical-align:top;min-width:80px;">
                <p style="margin:0 0 4px;font-size:.82rem;font-weight:700;">${esc(item.name)}</p>
                <p style="margin:0 0 8px;font-size:.68rem;color:#666;">${esc(item.nameEn)}</p>
                ${imgHTML}
            </td>`;
        }).join('');

        return `
        <div style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;padding:14px;min-width:800px;">

            <!-- 헤더 -->
            <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
                <tr>
                    <td style="border:2px solid #555;padding:8px 10px;width:150px;vertical-align:middle;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <div style="width:36px;height:36px;background:#1d4ed8;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <span style="color:#fff;font-weight:900;font-size:.72rem;">KC</span>
                            </div>
                            <div style="font-size:.65rem;font-weight:700;line-height:1.4;">KC 케미칼<br>주식회사</div>
                        </div>
                    </td>
                    <td style="border:2px solid #555;padding:10px;text-align:center;vertical-align:middle;">
                        <div style="font-size:1.5rem;font-weight:900;letter-spacing:.05em;">공정별 보호구 착용 기준서</div>
                        <div style="font-size:.82rem;color:#555;margin-top:3px;">Protective equipment wearing standards by process</div>
                    </td>
                    <td style="border:2px solid #555;padding:0;vertical-align:top;width:310px;">
                        <table style="width:100%;border-collapse:collapse;">
                            <tr style="background:#e5e7eb;">
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">No</th>
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">개정일자</th>
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">개정내용</th>
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">작성</th>
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">검토</th>
                                <th style="border:1px solid #888;padding:3px 5px;font-size:.72rem;">승인</th>
                            </tr>
                            ${revRows}
                        </table>
                    </td>
                </tr>
            </table>

            <!-- 작업자 구역 헤더 -->
            <table style="width:100%;border-collapse:collapse;">
                <tr style="background:#e8edf5;">
                    ${sections.map(function(sec) {
                        return `<th style="border:1px solid #aaa;padding:8px;text-align:center;font-size:.92rem;font-weight:700;">
                            ${esc(sec.title)}<br>
                            <span style="font-size:.75rem;font-weight:400;color:#555;">${esc(sec.titleEn)}</span>
                        </th>`;
                    }).join('')}
                </tr>
                <tr>${sectionCols}</tr>
            </table>

            <!-- 보호구 착용 기준 -->
            <table style="width:100%;border-collapse:collapse;">
                <tr style="background:#d1d5db;">
                    <th colspan="${ppeItems.length}" style="border:1px solid #888;padding:7px;text-align:center;font-size:.9rem;font-weight:700;">
                        보호구 착용 기준
                        <span style="font-size:.75rem;font-weight:400;color:#444;margin-left:8px;">Protective equipment wearing standards</span>
                    </th>
                </tr>
                <tr>${ppeHTML}</tr>
            </table>

            <!-- 푸터 -->
            <div style="display:flex;justify-content:space-between;padding:4px 2px;font-size:.7rem;color:#888;margin-top:2px;">
                <span>Rev.00</span>
                <span>케이씨케미칼㈜</span>
                <span>A3 (420 × 297 mm)</span>
            </div>
        </div>`;
    }

    /* ── 편집 모달 ── */
    function _edit() {
        const esc = SafetyCommon.esc;
        const d   = _doc || {};
        const sections = d.sections && d.sections.length ? d.sections : JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
        const ppeItems = d.ppeItems && d.ppeItems.length ? d.ppeItems : JSON.parse(JSON.stringify(DEFAULT_PPE));
        const revHist  = d.revHistory && d.revHistory.length ? d.revHistory : [{ no: 0, date: SafetyCommon.today(), content: '최초 작성', writer: '', reviewer: '', approver: '' }];

        /* 개정이력 입력 행 */
        const revInputRows = revHist.slice(0, 4).map(function(h, i) {
            return `<tr>
                <td style="border:1px solid var(--border-color);padding:3px;text-align:center;font-size:.78rem;">${i}</td>
                <td style="border:1px solid var(--border-color);padding:2px;"><input type="date" class="form-control" style="padding:3px;font-size:.76rem;" id="ppe-rv-date-${i}" value="${esc(h.date)}"></td>
                <td style="border:1px solid var(--border-color);padding:2px;"><input class="form-control" style="padding:3px;font-size:.76rem;" id="ppe-rv-cont-${i}" value="${esc(h.content)}" placeholder="개정내용"></td>
                <td style="border:1px solid var(--border-color);padding:2px;"><input class="form-control" style="padding:3px;font-size:.76rem;" id="ppe-rv-wr-${i}" value="${esc(h.writer)}" placeholder="작성"></td>
                <td style="border:1px solid var(--border-color);padding:2px;"><input class="form-control" style="padding:3px;font-size:.76rem;" id="ppe-rv-re-${i}" value="${esc(h.reviewer)}" placeholder="검토"></td>
                <td style="border:1px solid var(--border-color);padding:2px;"><input class="form-control" style="padding:3px;font-size:.76rem;" id="ppe-rv-ap-${i}" value="${esc(h.approver)}" placeholder="승인"></td>
            </tr>`;
        }).join('');

        /* 작업자 구역 사진 입력 */
        const secInputs = sections.map(function(sec, si) {
            const sgHTML = sec.subGroups.map(function(sg, gi) {
                const labelPart = sg.label
                    ? `<label class="form-label" style="font-size:.8rem;">${esc(sg.label)} 사진</label>`
                    : '';
                return `<div style="margin-bottom:10px;">
                    ${labelPart}
                    ${SafetyImageEditor.imageAreaHTML('ppe-sec-' + si + '-' + gi)}
                </div>`;
            }).join('');
            return `<div style="border:1px solid var(--border-color);border-radius:8px;padding:10px;margin-bottom:10px;">
                <p style="margin:0 0 8px;font-weight:700;font-size:.85rem;">${esc(sec.title)}</p>
                ${sgHTML}
            </div>`;
        }).join('');

        /* 보호구 이미지 입력 */
        const ppeInputs = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${ppeItems.map(function(item, pi) {
                const thumb = item.image
                    ? `<img src="${esc(item.image)}" style="max-height:50px;object-fit:contain;display:block;margin:4px auto;">`
                    : '';
                return `<div style="border:1px solid var(--border-color);border-radius:6px;padding:8px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:.8rem;font-weight:700;">${esc(item.name)}</p>
                    <p style="margin:0 0 6px;font-size:.68rem;color:var(--text-muted);">${esc(item.nameEn)}</p>
                    ${thumb}
                    <label style="cursor:pointer;font-size:.72rem;color:#2563eb;">
                        <input type="file" accept="image/*" style="display:none;" onchange="PPEStandardModule._onPpeImg(this,${pi})">
                        📷 이미지 선택
                    </label>
                    ${item.image ? `<button type="button" onclick="PPEStandardModule._clearPpeImg(${pi})" style="display:block;margin:2px auto 0;background:none;border:none;cursor:pointer;font-size:.7rem;color:#dc2626;">✕ 삭제</button>` : ''}
                </div>`;
            }).join('')}
        </div>`;

        const body = `
            <!-- 개정이력 -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label">개정 이력</label>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                        <tr style="background:var(--bg-secondary);">
                            <th style="border:1px solid var(--border-color);padding:5px;width:30px;">No</th>
                            <th style="border:1px solid var(--border-color);padding:5px;width:110px;">개정일자</th>
                            <th style="border:1px solid var(--border-color);padding:5px;">개정내용</th>
                            <th style="border:1px solid var(--border-color);padding:5px;width:70px;">작성</th>
                            <th style="border:1px solid var(--border-color);padding:5px;width:70px;">검토</th>
                            <th style="border:1px solid var(--border-color);padding:5px;width:70px;">승인</th>
                        </tr>
                        <tbody>${revInputRows}</tbody>
                    </table>
                </div>
            </div>

            <!-- 작업자 구역 사진 -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label">작업자 구역별 사진</label>
                ${secInputs}
            </div>

            <!-- 보호구 이미지 -->
            <div class="form-group">
                <label class="form-label">보호구 이미지</label>
                ${ppeInputs}
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="PPEStandardModule._save()">저장</button>
        `;

        UIUtils.showModal('보호구 기준서 편집', body, footer, 'xl');

        /* 기존 이미지 렌더 */
        setTimeout(function() {
            sections.forEach(function(sec, si) {
                sec.subGroups.forEach(function(sg, gi) {
                    if (sg.images && sg.images.length)
                        SafetyImageEditor.renderImageArea('ppe-sec-' + si + '-' + gi, sg.images);
                });
            });
        }, 80);
    }

    /* ── 보호구 이미지 선택 ── */
    var _ppeImgPending = {};
    function _onPpeImg(input, idx) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            _ppeImgPending[idx] = e.target.result;
            /* 미리보기 갱신 */
            const cont = input.closest('div');
            if (!cont) return;
            let img = cont.querySelector('img');
            if (!img) { img = document.createElement('img'); img.style.cssText = 'max-height:50px;object-fit:contain;display:block;margin:4px auto;'; cont.insertBefore(img, input.parentElement); }
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    function _clearPpeImg(idx) {
        _ppeImgPending[idx] = null;
        _save._forceRedraw = true;
    }

    /* ── 저장 ── */
    async function _save() {
        const d = _doc || {};
        const sections = (d.sections && d.sections.length) ? JSON.parse(JSON.stringify(d.sections)) : JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
        const ppeItems = (d.ppeItems && d.ppeItems.length) ? JSON.parse(JSON.stringify(d.ppeItems)) : JSON.parse(JSON.stringify(DEFAULT_PPE));

        /* 개정이력 수집 */
        const revHistory = [0,1,2,3].map(function(i) {
            return {
                no:       i,
                date:     (document.getElementById('ppe-rv-date-' + i) || {}).value || '',
                content:  (document.getElementById('ppe-rv-cont-' + i) || {}).value || '',
                writer:   (document.getElementById('ppe-rv-wr-'   + i) || {}).value || '',
                reviewer: (document.getElementById('ppe-rv-re-'   + i) || {}).value || '',
                approver: (document.getElementById('ppe-rv-ap-'   + i) || {}).value || ''
            };
        }).filter(function(h){ return h.content || h.date; });

        /* 작업자 구역 사진 수집 */
        sections.forEach(function(sec, si) {
            sec.subGroups.forEach(function(sg, gi) {
                sg.images = SafetyImageEditor.collectImages('ppe-sec-' + si + '-' + gi);
            });
        });

        /* 보호구 이미지 적용 */
        ppeItems.forEach(function(item, pi) {
            if (_ppeImgPending.hasOwnProperty(pi)) {
                item.image = _ppeImgPending[pi];
            }
        });
        _ppeImgPending = {};

        _doc = { revHistory, sections, ppeItems, updatedAt: SafetyCommon.today() };
        await SafetyCommon.save(KEY, _doc);
        UIUtils.closeModal();
        UIUtils.toast('보호구 기준서가 저장되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    /* ── 인쇄 ── */
    function _print() {
        const el = document.getElementById('ppe-doc');
        if (!el) return;
        const w = window.open('', '_blank', 'width=1200,height=800');
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>보호구 기준서</title>
            <style>
                body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;margin:8mm;font-size:9pt;}
                table{border-collapse:collapse;width:100%;}
                td,th{border:1px solid #666;padding:3px 4px;font-size:8pt;}
                img{max-width:100%;object-fit:contain;}
                @page{size:A3 landscape;margin:8mm;}
            </style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(function(){ w.print(); }, 400);
    }

    return { render, _edit, _save, _print, _onPpeImg, _clearPpeImg };
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

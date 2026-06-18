/**
 * 소방 안전 관리
 *  - FireSafetyNavUI         : 소방 안전 공통 네비게이션
 *  - FireSafetyHubModule     : 소방관리 허브
 *  - FireFacilityCheckModule : 소방시설 점검
 *  - FireExtCheckModule      : 소화기 점검
 *  - FireEduModule           : 소방 안전 교육 일지
 */

/* ──────────────────────────────────────────────
   소방관리 허브
────────────────────────────────────────────── */
var FireSafetyHubModule = (function () {
    const MENUS = [
        { id: 'fire-facility-check', label: '소방시설 점검',  desc: '소방 시설 정기 점검 결과 기록', icon: 'fire_truck',            accent: '#ea580c', key: 'fire_facility_check' },
        { id: 'fire-ext-check',      label: '소화기 점검',    desc: '소화기 배치 및 점검 현황 관리', icon: 'fire_extinguisher',     accent: '#b91c1c', key: 'fire_ext_check'      },
        { id: 'fire-edu',            label: '소방안전 교육',  desc: '소방 안전 교육 일지 관리',      icon: 'co2',                   accent: '#c2410c', key: 'fire_edu'            }
    ];

    function _esc(v) { return SafetyCommon ? SafetyCommon.esc(v) : (v || '').replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); }

    async function render(container) {
        const counts = {};
        for (const m of MENUS) {
            try { counts[m.id] = ((await SafetyCommon.load(m.key)) || []).length; } catch(e) { counts[m.id] = 0; }
        }
        container.innerHTML = `<div class="fade-in-up">
            <div style="margin-bottom:20px;">
                <h3 style="margin:0 0 4px;font-size:1.15rem;">소방관리</h3>
                <p style="margin:0;color:var(--text-muted);font-size:.88rem;">소방 시설 점검, 소화기 점검, 소방 안전 교육을 관리합니다.</p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;">
                ${MENUS.map(function(m) {
                    return `<div onclick="Router.navigate('${m.id}')"
                                 style="cursor:pointer;border-radius:12px;border:1px solid var(--border-color);
                                        background:var(--bg-primary);padding:20px;
                                        border-top:4px solid ${m.accent};
                                        transition:box-shadow .15s;"
                                 onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.10)'"
                                 onmouseout="this.style.boxShadow='none'">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                            <div style="width:40px;height:40px;border-radius:10px;background:${m.accent};
                                        display:flex;align-items:center;justify-content:center;">
                                <span class="material-symbols-outlined" style="font-size:22px;color:#fff;">${m.icon}</span>
                            </div>
                            <div>
                                <div style="font-weight:700;font-size:.95rem;">${_esc(m.label)}</div>
                                <div style="font-size:.78rem;color:var(--text-muted);">${_esc(m.desc)}</div>
                            </div>
                        </div>
                        <div style="font-size:1.6rem;font-weight:800;color:${m.accent};">${counts[m.id] || 0}</div>
                        <div style="font-size:.75rem;color:var(--text-muted);">등록 건수</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    return { render, init: function(container) { render(container); } };
})();

/* ──────────────────────────────────────────────
   공통 네비게이션
────────────────────────────────────────────── */
var FireSafetyNavUI = (function () {
    const MENUS = [
        { id: 'fire-facility-check', label: '소방시설 점검',   icon: 'fire_truck',            accent: '#ea580c' },
        { id: 'fire-ext-check',      label: '소화기 점검',     icon: 'fire_extinguisher',     accent: '#b91c1c' },
        { id: 'fire-edu',            label: '소방 안전 교육',  icon: 'local_fire_department', accent: '#c2410c' }
    ];

    function renderSection(activePage, title, desc) {
        const tiles = MENUS.map(function (m) {
            const active = m.id === activePage;
            const borderStyle = active
                ? `border-left:4px solid ${m.accent};background:var(--bg-primary);`
                : 'border-left:4px solid transparent;background:var(--bg-secondary);';
            const iconBg    = active ? m.accent : 'var(--border-color)';
            const iconColor = active ? '#fff' : 'var(--text-muted)';
            const checkIcon = active
                ? `<span class="material-symbols-outlined" style="position:absolute;top:6px;right:6px;font-size:14px;color:${m.accent};">check_circle</span>`
                : '';
            return `
                <div onclick="Router.navigate('${m.id}')"
                     style="position:relative;cursor:pointer;border-radius:10px;padding:10px 14px;
                            display:flex;align-items:center;gap:10px;min-width:150px;
                            border:1px solid var(--border-color);${borderStyle}
                            transition:box-shadow .15s;user-select:none;"
                     onmouseover="this.style.boxShadow='0 2px 10px rgba(0,0,0,.10)'"
                     onmouseout="this.style.boxShadow='none'">
                    <div style="width:34px;height:34px;border-radius:8px;background:${iconBg};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:${iconColor};">${m.icon}</span>
                    </div>
                    <span style="font-size:0.82rem;font-weight:${active ? '700' : '500'};
                                 color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};">${SafetyCommon.esc(m.label)}</span>
                    ${checkIcon}
                </div>`;
        }).join('');

        return `
            <div style="margin-bottom:20px;">
                <div style="margin-bottom:12px;">
                    <h3 style="margin:0 0 4px;font-size:1.15rem;">${SafetyCommon.esc(title)}</h3>
                    <p style="margin:0;color:var(--text-muted);font-size:.88rem;">${SafetyCommon.esc(desc || '')}</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">${tiles}</div>
            </div>`;
    }

    return { renderSection };
})();


/* ──────────────────────────────────────────────
   1. 소방시설 점검
────────────────────────────────────────────── */
var FireFacilityCheckModule = (function () {
    const KEY = 'fire_facility_check';
    const FACILITY_TYPES = ['스프링클러', '화재감지기', '유도등', '비상경보설비', '소화전', '방화문', '비상조명', '기타'];
    const RESULT_LIST    = ['정상', '불량', '보수필요', '교체필요'];
    let _rows = [], _month = new Date().toISOString().slice(0, 7), _q = '';

    function _esc(v) { return SafetyCommon.esc(v); }
    function _js(v)  { return SafetyCommon.js(v); }

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _resultBadge(s) {
        const map = {
            '정상':    ['#10b981', 'rgba(16,185,129,.1)'],
            '불량':    ['#ef4444', 'rgba(239,68,68,.1)'],
            '보수필요':['#f59e0b', 'rgba(245,158,11,.1)'],
            '교체필요':['#dc2626', 'rgba(220,38,38,.1)']
        };
        const [c, bg] = map[s] || ['#64748b', 'var(--bg-secondary)'];
        return `<span style="padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;color:${c};background:${bg};">${_esc(s)}</span>`;
    }

    function _draw(container) {
        const filtered = _rows.filter(r => {
            if (_month && String(r.date || '').slice(0, 7) !== _month) return false;
            if (_q) { const q = _q.toLowerCase(); return [r.facilityType, r.location, r.inspector].some(v => (v || '').toLowerCase().includes(q)); }
            return true;
        });
        container.innerHTML = FireSafetyNavUI.renderSection('fire-facility-check', '소방시설 점검', '소방 시설 정기 점검 결과를 기록합니다.') + `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <div class="form-group" style="margin:0;"><label class="form-label">월</label>
                <input type="month" class="form-input" value="${_month}" onchange="FireFacilityCheckModule._setMonth(this.value)" style="min-width:140px;"></div>
            <div class="form-group" style="margin:0;flex:1;min-width:180px;"><label class="form-label">검색</label>
                <input class="form-input" value="${_esc(_q)}" placeholder="시설 종류, 위치, 점검자" oninput="FireFacilityCheckModule._setQ(this.value)"></div>
            <button class="btn btn-primary" onclick="FireFacilityCheckModule._openAdd()">
                <span class="material-symbols-outlined">add</span> 점검 등록
            </button>
        </div>
        <div class="card">
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>점검일</th><th>시설 종류</th><th>설치 위치</th>
                            <th>점검자</th><th>점검 결과</th><th>다음 점검일</th><th>비고</th>
                            <th style="width:110px;">작업</th>
                        </tr></thead>
                        <tbody>${filtered.length ? filtered.map(_rowHtml).join('') :
                            '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">점검 기록이 없습니다.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function _rowHtml(r) {
        return `<tr>
            <td>${_esc(r.date)}</td>
            <td><strong>${_esc(r.facilityType)}</strong></td>
            <td>${_esc(r.location || '-')}</td>
            <td>${_esc(r.inspector || '-')}</td>
            <td>${_resultBadge(r.result || '정상')}</td>
            <td>${_esc(r.nextDate || '-')}</td>
            <td style="font-size:.82rem;color:var(--text-muted);">${_esc(r.notes || '')}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" onclick="FireFacilityCheckModule._edit('${_js(r.id)}')">수정</button>
                <button class="btn btn-sm btn-danger" onclick="FireFacilityCheckModule._del('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }

    function _selOpts(val, list) {
        return list.map(o => `<option value="${_esc(o)}" ${val === o ? 'selected' : ''}>${_esc(o)}</option>`).join('');
    }

    function _formHtml(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="ffcDate" value="${_esc(r.date || SafetyCommon.today())}"></div>
                <div class="form-group"><label class="form-label">점검자 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="ffcInspector" value="${_esc(r.inspector || '')}" placeholder="점검자 성명"></div>
                <div class="form-group"><label class="form-label">시설 종류 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="ffcFacilityType">
                        <option value="">선택</option>${_selOpts(r.facilityType, FACILITY_TYPES)}
                    </select></div>
                <div class="form-group"><label class="form-label">설치 위치</label>
                    <input class="form-input" id="ffcLocation" value="${_esc(r.location || '')}" placeholder="예) 1층 복도, 2층 사무실"></div>
                <div class="form-group"><label class="form-label">점검 결과</label>
                    <select class="form-select" id="ffcResult">
                        ${_selOpts(r.result || '정상', RESULT_LIST)}
                    </select></div>
                <div class="form-group"><label class="form-label">다음 점검 예정일</label>
                    <input type="date" class="form-input" id="ffcNextDate" value="${_esc(r.nextDate || '')}"></div>
            </div>
            <div class="form-group"><label class="form-label">점검 내용 / 조치 사항</label>
                <textarea class="form-textarea" id="ffcNotes" rows="3">${_esc(r.notes || '')}</textarea></div>
        </div>`;
    }

    function _openAdd() {
        UIUtils.showModal('소방시설 점검 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireFacilityCheckModule._save()">저장</button>`, 'lg');
    }

    function _edit(id) {
        const r = _rows.find(x => x.id === id);
        if (!r) return;
        UIUtils.showModal('소방시설 점검 수정', _formHtml(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireFacilityCheckModule._save('${_js(id)}')">저장</button>`, 'lg');
    }

    async function _save(id = '') {
        const g = i => document.getElementById(i)?.value?.trim() || '';
        const date = g('ffcDate'), inspector = g('ffcInspector'), facilityType = g('ffcFacilityType');
        if (!date || !inspector || !facilityType) { UIUtils.toast('점검일, 점검자, 시설 종류는 필수입니다.', 'warning'); return; }
        const row = { id: id || SafetyCommon.genId(), date, inspector, facilityType,
            location: g('ffcLocation'), result: g('ffcResult') || '정상',
            nextDate: g('ffcNextDate'), notes: g('ffcNotes'),
            updatedAt: new Date().toISOString() };
        if (id) { const i = _rows.findIndex(x => x.id === id); if (i !== -1) _rows[i] = row; }
        else _rows.unshift(row);
        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '점검이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 점검 기록을 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(x => x.id !== id);
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _setMonth(v) { _month = v; _draw(document.getElementById('contentArea')); }
    function _setQ(v)     { _q = v;     _draw(document.getElementById('contentArea')); }

    return { render, _openAdd, _edit, _save, _del, _setMonth, _setQ };
})();


/* ──────────────────────────────────────────────
   2. 소화기 점검
────────────────────────────────────────────── */
var FireExtCheckModule = (function () {
    const KEY = 'fire_ext_check';
    const CHECK_ITEMS = [
        { key: 'pressure', label: '압력 정상' },
        { key: 'pin',      label: '안전핀 정상' },
        { key: 'nozzle',   label: '노즐 정상' },
        { key: 'body',     label: '외관 이상 없음' },
        { key: 'label',    label: '라벨 선명' },
    ];
    let _rows = [], _q = '', _month = new Date().toISOString().slice(0, 7);

    function _esc(v) { return SafetyCommon.esc(v); }
    function _js(v)  { return SafetyCommon.js(v); }

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const filtered = _rows.filter(r => {
            if (_month && String(r.date || '').slice(0, 7) !== _month) return false;
            if (_q) { const q = _q.toLowerCase(); return [r.equipId, r.location, r.inspector].some(v => (v || '').toLowerCase().includes(q)); }
            return true;
        });
        container.innerHTML = FireSafetyNavUI.renderSection('fire-ext-check', '소화기 점검', '소화기 정기 점검 결과를 기록합니다.') + `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;">
            <div class="form-group" style="margin:0;"><label class="form-label">월</label>
                <input type="month" class="form-input" value="${_month}" onchange="FireExtCheckModule._setMonth(this.value)" style="min-width:140px;"></div>
            <div class="form-group" style="margin:0;flex:1;min-width:180px;"><label class="form-label">검색</label>
                <input class="form-input" value="${_esc(_q)}" placeholder="설비번호, 위치, 점검자" oninput="FireExtCheckModule._setQ(this.value)"></div>
            <button class="btn btn-primary" onclick="FireExtCheckModule._openAdd()">
                <span class="material-symbols-outlined">add</span> 점검 등록
            </button>
        </div>
        <div class="card">
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>점검일</th><th>설비 번호</th><th>설치 위치</th><th>점검자</th>
                            <th>압력</th><th>안전핀</th><th>노즐</th><th>외관</th><th>라벨</th>
                            <th>결과</th><th>비고</th><th style="width:110px;">작업</th>
                        </tr></thead>
                        <tbody>${filtered.length ? filtered.map(_rowHtml).join('') :
                            '<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-muted);">점검 기록이 없습니다.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function _ok(v) { return v !== false ? '✅' : '❌'; }
    function _resultBadge(r) {
        const pass = CHECK_ITEMS.every(c => r[c.key] !== false);
        return `<span style="padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;color:${pass ? '#10b981' : '#ef4444'};background:${pass ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};">${pass ? '합격' : '불합격'}</span>`;
    }

    function _rowHtml(r) {
        return `<tr>
            <td>${_esc(r.date)}</td><td><strong>${_esc(r.equipId)}</strong></td>
            <td>${_esc(r.location)}</td><td>${_esc(r.inspector)}</td>
            <td style="text-align:center;">${_ok(r.pressure)}</td>
            <td style="text-align:center;">${_ok(r.pin)}</td>
            <td style="text-align:center;">${_ok(r.nozzle)}</td>
            <td style="text-align:center;">${_ok(r.body)}</td>
            <td style="text-align:center;">${_ok(r.label)}</td>
            <td>${_resultBadge(r)}</td>
            <td style="font-size:.82rem;color:var(--text-muted);">${_esc(r.notes || '')}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" onclick="FireExtCheckModule._edit('${_js(r.id)}')">수정</button>
                <button class="btn btn-sm btn-danger" onclick="FireExtCheckModule._del('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }

    function _chk(key, val) {
        const checked = val !== false;
        return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border-radius:6px;
                    border:1px solid ${checked ? '#86efac' : 'var(--border-color)'};background:${checked ? 'rgba(16,185,129,.06)' : 'transparent'};">
            <input type="checkbox" id="fec_${key}" ${checked ? 'checked' : ''} style="width:16px;height:16px;"
                onchange="this.parentElement.style.borderColor=this.checked?'#86efac':'var(--border-color)';this.parentElement.style.background=this.checked?'rgba(16,185,129,.06)':'transparent';">
            <span style="font-size:.85rem;">${SafetyCommon.esc(CHECK_ITEMS.find(c => c.key === key)?.label || key)}</span>
        </label>`;
    }

    function _formHtml(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="fecDate" value="${_esc(r.date || SafetyCommon.today())}"></div>
                <div class="form-group"><label class="form-label">점검자 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fecInspector" value="${_esc(r.inspector || '')}" placeholder="점검자 성명"></div>
                <div class="form-group"><label class="form-label">설비 번호 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fecEquipId" value="${_esc(r.equipId || '')}" placeholder="예) EXT-001"></div>
                <div class="form-group"><label class="form-label">설치 위치</label>
                    <input class="form-input" id="fecLocation" value="${_esc(r.location || '')}" placeholder="예) 1층 복도"></div>
            </div>
            <div class="form-group"><label class="form-label">점검 항목</label>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                    ${CHECK_ITEMS.map(c => _chk(c.key, r[c.key])).join('')}
                </div>
            </div>
            <div class="form-group"><label class="form-label">비고 / 조치 사항</label>
                <textarea class="form-textarea" id="fecNotes" rows="2">${_esc(r.notes || '')}</textarea></div>
        </div>`;
    }

    function _openAdd() {
        UIUtils.showModal('소화기 점검 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireExtCheckModule._save()">저장</button>`, 'lg');
    }

    function _edit(id) {
        const r = _rows.find(x => x.id === id);
        if (!r) return;
        UIUtils.showModal('소화기 점검 수정', _formHtml(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireExtCheckModule._save('${_js(id)}')">저장</button>`, 'lg');
    }

    async function _save(id = '') {
        const g = i => document.getElementById(i)?.value?.trim() || '';
        const chk = key => document.getElementById('fec_' + key)?.checked !== false;
        const date = g('fecDate'), inspector = g('fecInspector'), equipId = g('fecEquipId');
        if (!date || !inspector || !equipId) { UIUtils.toast('점검일, 점검자, 설비 번호는 필수입니다.', 'warning'); return; }
        const row = { id: id || SafetyCommon.genId(), date, inspector, equipId,
            location: g('fecLocation'), notes: g('fecNotes'),
            ...Object.fromEntries(CHECK_ITEMS.map(c => [c.key, chk(c.key)])),
            updatedAt: new Date().toISOString() };
        if (id) { const i = _rows.findIndex(x => x.id === id); if (i !== -1) _rows[i] = row; }
        else _rows.unshift(row);
        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '점검이 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 점검 기록을 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(x => x.id !== id);
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _setMonth(v) { _month = v; _draw(document.getElementById('contentArea')); }
    function _setQ(v)     { _q = v;     _draw(document.getElementById('contentArea')); }

    return { render, _openAdd, _edit, _save, _del, _setMonth, _setQ };
})();


/* ──────────────────────────────────────────────
   3. 소방 안전 교육 일지
────────────────────────────────────────────── */
var FireEduModule = (function () {
    const KEY = 'fire_edu';
    let _rows = [], _month = new Date().toISOString().slice(0, 7);

    function _esc(v) { return SafetyCommon.esc(v); }
    function _js(v)  { return SafetyCommon.js(v); }

    function _peopleList() {
        if (typeof AuthModule === 'undefined') return [];
        return (AuthModule.getUsers() || [])
            .filter(u => u.active !== false && u.displayName)
            .map(u => u.displayName)
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _participantCheckboxes(selected = []) {
        const people = _peopleList();
        if (!people.length) return '<span style="font-size:.8rem;color:var(--text-muted);">등록된 사용자 없음</span>';
        return people.map(name => {
            const checked = selected.includes(name);
            return `<label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;padding:3px 8px;border-radius:4px;
                        background:${checked ? 'rgba(59,130,246,.1)' : 'transparent'};border:1px solid ${checked ? '#93c5fd' : 'transparent'};">
                <input type="checkbox" value="${_esc(name)}" ${checked ? 'checked' : ''} style="margin:0;"
                    onchange="this.parentElement.style.background=this.checked?'rgba(59,130,246,.1)':'transparent';this.parentElement.style.border=this.checked?'1px solid #93c5fd':'1px solid transparent';">
                ${_esc(name)}
            </label>`;
        }).join('');
    }

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const filtered = _rows.filter(r => !_month || String(r.date || '').slice(0, 7) === _month);
        container.innerHTML = FireSafetyNavUI.renderSection('fire-edu', '소방 안전 교육 일지', '소방 안전 교육 실시 내역을 기록합니다.') + `
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;">
            <div class="form-group" style="margin:0;"><label class="form-label">월</label>
                <input type="month" class="form-input" value="${_month}" onchange="FireEduModule._setMonth(this.value)" style="min-width:140px;"></div>
            <button class="btn btn-primary" style="margin-left:auto;" onclick="FireEduModule._openAdd()">
                <span class="material-symbols-outlined">add</span> 교육 등록
            </button>
        </div>
        <div style="display:grid;gap:12px;">
            ${filtered.length ? filtered.map(_cardHtml).join('') :
                '<div style="text-align:center;padding:48px;color:var(--text-muted);">등록된 교육 일지가 없습니다.</div>'}
        </div>`;
    }

    function _cardHtml(r) {
        const parts = Array.isArray(r.participants) ? r.participants : [];
        return `<div class="card">
            <div class="card-body">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
                    <div>
                        <div style="font-weight:700;font-size:1rem;">${_esc(r.topic)}</div>
                        <div style="font-size:.82rem;color:var(--text-muted);margin-top:3px;">
                            ${_esc(r.date)} · 강사: ${_esc(r.instructor || '-')} · 장소: ${_esc(r.location || '-')} · ${_esc(r.duration || '')}
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                        <button class="btn btn-sm btn-outline" onclick="FireEduModule._edit('${_js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="FireEduModule._del('${_js(r.id)}')">삭제</button>
                    </div>
                </div>
                ${r.content ? `<div style="font-size:.85rem;white-space:pre-wrap;margin-bottom:8px;">${_esc(r.content)}</div>` : ''}
                ${parts.length ? `<div style="font-size:.8rem;color:var(--text-muted);">참가자 (${parts.length}명): ${parts.map(_esc).join(', ')}</div>` : ''}
            </div>
        </div>`;
    }

    function _formHtml(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">교육일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="feDate" value="${_esc(r.date || SafetyCommon.today())}"></div>
                <div class="form-group"><label class="form-label">교육 주제 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="feTopic" value="${_esc(r.topic || '')}" placeholder="예) 소화기 사용법 교육"></div>
                <div class="form-group"><label class="form-label">강사</label>
                    <input class="form-input" id="feInstructor" value="${_esc(r.instructor || '')}" placeholder="강사 성명 또는 기관"></div>
                <div class="form-group"><label class="form-label">교육 장소</label>
                    <input class="form-input" id="feLocation" value="${_esc(r.location || '')}" placeholder="예) 회의실 A, 현장"></div>
                <div class="form-group"><label class="form-label">교육 시간</label>
                    <input class="form-input" id="feDuration" value="${_esc(r.duration || '')}" placeholder="예) 1시간, 30분"></div>
            </div>
            <div class="form-group"><label class="form-label">교육 내용</label>
                <textarea class="form-textarea" id="feContent" rows="4" placeholder="교육 내용을 입력하세요.">${_esc(r.content || '')}</textarea></div>
            <div class="form-group"><label class="form-label">참가자</label>
                <div id="feParticipantsBox" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border-color);border-radius:8px;min-height:42px;background:var(--bg-secondary);">
                    ${_participantCheckboxes(r.participants || [])}
                </div>
            </div>
        </div>`;
    }

    function _openAdd() {
        UIUtils.showModal('소방 안전 교육 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireEduModule._save()">저장</button>`, 'xl');
    }

    function _edit(id) {
        const r = _rows.find(x => x.id === id);
        if (!r) return;
        UIUtils.showModal('소방 안전 교육 수정', _formHtml(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireEduModule._save('${_js(id)}')">저장</button>`, 'xl');
    }

    async function _save(id = '') {
        const g = i => document.getElementById(i)?.value?.trim() || '';
        const date = g('feDate'), topic = g('feTopic');
        if (!date || !topic) { UIUtils.toast('교육일과 교육 주제는 필수입니다.', 'warning'); return; }
        const box = document.getElementById('feParticipantsBox');
        const participants = box ? Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value) : [];
        const row = { id: id || SafetyCommon.genId(), date, topic,
            instructor: g('feInstructor'), location: g('feLocation'),
            duration: g('feDuration'), content: g('feContent'),
            participants, updatedAt: new Date().toISOString() };
        if (id) { const i = _rows.findIndex(x => x.id === id); if (i !== -1) _rows[i] = row; }
        else _rows.unshift(row);
        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '교육 일지가 등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 교육 일지를 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(x => x.id !== id);
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    function _setMonth(v) { _month = v; _draw(document.getElementById('contentArea')); }

    return { render, _openAdd, _edit, _save, _del, _setMonth };
})();

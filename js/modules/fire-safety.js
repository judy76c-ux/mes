/**
 * 소방 안전 관리
 *  - FireSafetyRegModule  : 소방 안전 등록대장
 *  - FireExtCheckModule   : 소화기 점검일지
 *  - FireEduModule        : 소화 안전 교육 일지
 */

/* ──────────────────────────────────────────────
   1. 소방 안전 등록대장
────────────────────────────────────────────── */
var FireSafetyRegModule = (function () {
    const KEY = 'fire_safety_reg';
    const EQUIP_TYPES = ['소화기', '스프링클러', '화재감지기', '유도등', '비상경보설비', '소화전', '기타'];
    const STATUS_LIST = ['정상', '요주의', '교체필요'];
    let _rows = [];

    function _esc(v) { return SafetyCommon.esc(v); }
    function _js(v)  { return SafetyCommon.js(v); }

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const html = SafetyCommon ? SafetyProcessUI.renderSection('fire-safety-reg', '소방 안전 등록대장', '소방 설비 현황을 등록하고 관리합니다.') : '';
        container.innerHTML = html + `
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
            <button class="btn btn-primary" onclick="FireSafetyRegModule._openAdd()">
                <span class="material-symbols-outlined">add</span> 설비 등록
            </button>
        </div>
        <div class="card">
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>설비 종류</th><th>설비 번호</th><th>설치 위치</th>
                            <th>설치일</th><th>다음 점검일</th><th>상태</th><th>비고</th>
                            <th style="width:120px;">작업</th>
                        </tr></thead>
                        <tbody>${_rows.length ? _rows.map(_rowHtml).join('') :
                            '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">등록된 소방 설비가 없습니다.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function _statusBadge(s) {
        const map = { '정상': ['#10b981','rgba(16,185,129,.1)'], '요주의': ['#f59e0b','rgba(245,158,11,.1)'], '교체필요': ['#ef4444','rgba(239,68,68,.1)'] };
        const [c, bg] = map[s] || ['#64748b','var(--bg-secondary)'];
        return `<span style="padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;color:${c};background:${bg};">${_esc(s)}</span>`;
    }

    function _rowHtml(r) {
        return `<tr>
            <td>${_esc(r.equipType)}</td>
            <td><strong>${_esc(r.equipId)}</strong></td>
            <td>${_esc(r.location)}</td>
            <td>${_esc(r.installDate||'-')}</td>
            <td>${_esc(r.nextInspDate||'-')}</td>
            <td>${_statusBadge(r.status)}</td>
            <td style="font-size:.82rem;color:var(--text-muted);">${_esc(r.notes||'')}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" onclick="FireSafetyRegModule._edit('${_js(r.id)}')">수정</button>
                <button class="btn btn-sm btn-danger" onclick="FireSafetyRegModule._del('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }

    function _formHtml(r = {}) {
        const sel = (v, list) => list.map(o => `<option value="${_esc(o)}" ${r[v]===o?'selected':''}>${_esc(o)}</option>`).join('');
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">설비 종류 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="fsrEquipType"><option value="">선택</option>${sel('equipType', EQUIP_TYPES)}</select></div>
                <div class="form-group"><label class="form-label">설비 번호 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fsrEquipId" value="${_esc(r.equipId||'')}" placeholder="예) EXT-001"></div>
                <div class="form-group"><label class="form-label">설치 위치 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fsrLocation" value="${_esc(r.location||'')}" placeholder="예) 1층 복도 우측"></div>
                <div class="form-group"><label class="form-label">상태</label>
                    <select class="form-select" id="fsrStatus">${sel('status', STATUS_LIST)}</select></div>
                <div class="form-group"><label class="form-label">설치일</label>
                    <input type="date" class="form-input" id="fsrInstallDate" value="${_esc(r.installDate||'')}"></div>
                <div class="form-group"><label class="form-label">다음 점검일</label>
                    <input type="date" class="form-input" id="fsrNextInspDate" value="${_esc(r.nextInspDate||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label>
                <textarea class="form-textarea" id="fsrNotes" rows="2">${_esc(r.notes||'')}</textarea></div>
        </div>`;
    }

    function _openAdd() {
        UIUtils.showModal('소방 설비 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireSafetyRegModule._save()">저장</button>`, 'lg');
    }

    function _edit(id) {
        const r = _rows.find(x => x.id === id);
        if (!r) return;
        UIUtils.showModal('소방 설비 수정', _formHtml(r), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireSafetyRegModule._save('${_js(id)}')">저장</button>`, 'lg');
    }

    async function _save(id = '') {
        const g = i => document.getElementById(i)?.value?.trim() || '';
        const equipType = g('fsrEquipType'), equipId = g('fsrEquipId'), location = g('fsrLocation');
        if (!equipType || !equipId || !location) { UIUtils.toast('설비 종류, 설비 번호, 설치 위치는 필수입니다.', 'warning'); return; }
        const row = { id: id || SafetyCommon.genId(), equipType, equipId, location,
            status: g('fsrStatus') || '정상', installDate: g('fsrInstallDate'),
            nextInspDate: g('fsrNextInspDate'), notes: g('fsrNotes'), updatedAt: new Date().toISOString() };
        if (id) { const i = _rows.findIndex(x => x.id === id); if (i !== -1) _rows[i] = row; }
        else _rows.unshift(row);
        await SafetyCommon.save(KEY, _rows);
        UIUtils.closeModal();
        UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
        _draw(document.getElementById('contentArea'));
    }

    function _del(id) {
        UIUtils.confirm('이 소방 설비를 삭제하시겠습니까?', async function () {
            _rows = _rows.filter(x => x.id !== id);
            await SafetyCommon.save(KEY, _rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            _draw(document.getElementById('contentArea'));
        });
    }

    return { render, _openAdd, _edit, _save, _del };
})();


/* ──────────────────────────────────────────────
   2. 소화기 점검일지
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
            if (_month && String(r.date||'').slice(0,7) !== _month) return false;
            if (_q) { const q = _q.toLowerCase(); return [r.equipId, r.location, r.inspector].some(v => (v||'').toLowerCase().includes(q)); }
            return true;
        });
        container.innerHTML = SafetyProcessUI.renderSection('fire-ext-check', '소화기 점검일지', '소화기 정기 점검 결과를 기록합니다.') + `
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
        return `<span style="padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;color:${pass?'#10b981':'#ef4444'};background:${pass?'rgba(16,185,129,.1)':'rgba(239,68,68,.1)'};">${pass?'합격':'불합격'}</span>`;
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
            <td style="font-size:.82rem;color:var(--text-muted);">${_esc(r.notes||'')}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" onclick="FireExtCheckModule._edit('${_js(r.id)}')">수정</button>
                <button class="btn btn-sm btn-danger" onclick="FireExtCheckModule._del('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }

    function _chk(key, val) {
        const checked = val !== false;
        return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 10px;border-radius:6px;border:1px solid ${checked?'#86efac':'var(--border-color)'};background:${checked?'rgba(16,185,129,.06)':'transparent'};">
            <input type="checkbox" id="fec_${key}" ${checked?'checked':''} style="width:16px;height:16px;"
                onchange="this.parentElement.style.borderColor=this.checked?'#86efac':'var(--border-color)';this.parentElement.style.background=this.checked?'rgba(16,185,129,.06)':'transparent';">
            <span style="font-size:.85rem;">${SafetyCommon.esc(CHECK_ITEMS.find(c=>c.key===key)?.label||key)}</span>
        </label>`;
    }

    function _formHtml(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="fecDate" value="${_esc(r.date||SafetyCommon.today())}"></div>
                <div class="form-group"><label class="form-label">점검자 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fecInspector" value="${_esc(r.inspector||'')}" placeholder="점검자 성명"></div>
                <div class="form-group"><label class="form-label">설비 번호 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="fecEquipId" value="${_esc(r.equipId||'')}" placeholder="예) EXT-001"></div>
                <div class="form-group"><label class="form-label">설치 위치</label>
                    <input class="form-input" id="fecLocation" value="${_esc(r.location||'')}" placeholder="예) 1층 복도"></div>
            </div>
            <div class="form-group"><label class="form-label">점검 항목</label>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);">
                    ${CHECK_ITEMS.map(c => _chk(c.key, r[c.key])).join('')}
                </div>
            </div>
            <div class="form-group"><label class="form-label">비고 / 조치 사항</label>
                <textarea class="form-textarea" id="fecNotes" rows="2">${_esc(r.notes||'')}</textarea></div>
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
    function _setQ(v) { _q = v; _draw(document.getElementById('contentArea')); }

    return { render, _openAdd, _edit, _save, _del, _setMonth, _setQ };
})();


/* ──────────────────────────────────────────────
   3. 소화 안전 교육 일지
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
            return `<label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;padding:3px 8px;border-radius:4px;background:${checked?'rgba(59,130,246,.1)':'transparent'};border:1px solid ${checked?'#93c5fd':'transparent'};">
                <input type="checkbox" value="${_esc(name)}" ${checked?'checked':''}
                    style="margin:0;" onchange="this.parentElement.style.background=this.checked?'rgba(59,130,246,.1)':'transparent';this.parentElement.style.border=this.checked?'1px solid #93c5fd':'1px solid transparent';">
                ${_esc(name)}
            </label>`;
        }).join('');
    }

    async function render(container) {
        _rows = await SafetyCommon.load(KEY);
        _draw(container);
    }

    function _draw(container) {
        const filtered = _rows.filter(r => !_month || String(r.date||'').slice(0,7) === _month);
        container.innerHTML = SafetyProcessUI.renderSection('fire-edu', '소화 안전 교육 일지', '소방 안전 교육 실시 내역을 기록합니다.') + `
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
                            ${_esc(r.date)} · 강사: ${_esc(r.instructor||'-')} · 장소: ${_esc(r.location||'-')} · ${_esc(r.duration||'')}
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
                    <input type="date" class="form-input" id="feDate" value="${_esc(r.date||SafetyCommon.today())}"></div>
                <div class="form-group"><label class="form-label">교육 주제 <span style="color:var(--accent-red)">*</span></label>
                    <input class="form-input" id="feTopic" value="${_esc(r.topic||'')}" placeholder="예) 소화기 사용법 교육"></div>
                <div class="form-group"><label class="form-label">강사</label>
                    <input class="form-input" id="feInstructor" value="${_esc(r.instructor||'')}" placeholder="강사 성명 또는 기관"></div>
                <div class="form-group"><label class="form-label">교육 장소</label>
                    <input class="form-input" id="feLocation" value="${_esc(r.location||'')}" placeholder="예) 회의실 A, 현장"></div>
                <div class="form-group"><label class="form-label">교육 시간</label>
                    <input class="form-input" id="feDuration" value="${_esc(r.duration||'')}" placeholder="예) 1시간, 30분"></div>
            </div>
            <div class="form-group"><label class="form-label">교육 내용</label>
                <textarea class="form-textarea" id="feContent" rows="4" placeholder="교육 내용을 입력하세요.">${_esc(r.content||'')}</textarea></div>
            <div class="form-group"><label class="form-label">참가자</label>
                <div id="feParticipantsBox" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border-color);border-radius:8px;min-height:42px;background:var(--bg-secondary);">
                    ${_participantCheckboxes(r.participants||[])}
                </div>
            </div>
        </div>`;
    }

    function _openAdd() {
        UIUtils.showModal('소화 안전 교육 등록', _formHtml(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="FireEduModule._save()">저장</button>`, 'xl');
    }

    function _edit(id) {
        const r = _rows.find(x => x.id === id);
        if (!r) return;
        UIUtils.showModal('소화 안전 교육 수정', _formHtml(r), `
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

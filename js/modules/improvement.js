/**
 * 공정품질 - 개선활동
 * 현장 제안 접수부터 PDCA 진행, 효과/비용, 유지관리 점검까지 관리한다.
 */
var ImprovementActivityModule = (function() {
    const STORE = DB.STORES.PROD_IMPROVEMENT_ACTIVITIES;
    const STAGES = [
        { key: 'proposal', label: '제안 접수', icon: 'lightbulb' },
        { key: 'approve', label: '관리자 검토', icon: 'how_to_vote' },
        { key: 'plan', label: 'P 계획', icon: 'event_note' },
        { key: 'do', label: 'D 원인/실행', icon: 'psychology' },
        { key: 'check', label: 'C 결과/효과', icon: 'fact_check' },
        { key: 'act', label: 'A 유지관리', icon: 'autorenew' }
    ];
    const STATUS = {
        draft: '제안',
        reviewing: '검토중',
        approved: '승인',
        rejected: '반려',
        planning: '계획수립',
        running: '진행중',
        checking: '효과확인',
        maintaining: '유지관리',
        closed: '완료'
    };
    let state = { status: '', stage: '', q: '', month: (new Date()).toISOString().slice(0, 7) };

    function _esc(v) {
        return String(v || '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
    }
    function _js(v) { return String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function _fmtDate(v) { return v || '-'; }
    function _all() { return (Storage.getAll(STORE) || []).sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')); }
    function _stageIndex(stage) { return Math.max(0, STAGES.findIndex(s => s.key === (stage || 'proposal'))); }
    function _stageLabel(stage) { return (STAGES.find(s => s.key === stage) || STAGES[0]).label; }
    function _statusLabel(status) { return STATUS[status] || status || '제안'; }
    function _badge(text, bg, color) {
        return `<span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:${bg};color:${color};font-size:0.72rem;font-weight:800;white-space:nowrap;">${_esc(text)}</span>`;
    }
    function _filtered() {
        const q = (state.q || '').toLowerCase();
        return _all().filter(r => {
            if (state.status && r.status !== state.status) return false;
            if (state.stage && r.pdcaStage !== state.stage) return false;
            if (!q) return true;
            return [r.title, r.proposer, r.process, r.problem, r.proposal, r.owner]
                .some(v => String(v || '').toLowerCase().includes(q));
        });
    }
    function _monthRows() {
        return _all().filter(r => String(r.date || r.createdAt || '').slice(0, 7) === state.month);
    }
    function _summary(rows) {
        return {
            total: rows.length,
            approved: rows.filter(r => r.approval === 'approved').length,
            running: rows.filter(r => ['planning','running','checking','maintaining'].includes(r.status)).length,
            closed: rows.filter(r => r.status === 'closed').length
        };
    }

    function render(container) {
        const rows = _filtered();
        const monthRows = _monthRows();
        const sum = _summary(_all());
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-toolbar" style="display:flex;justify-content:flex-start;gap:8px;margin-bottom:12px;">
                    <button class="btn btn-primary" onclick="ImprovementActivityModule.openProposalModal()">
                        <span class="material-symbols-outlined">add</span> 제안 등록
                    </button>
                    <button class="btn btn-outline" onclick="ImprovementActivityModule.exportData()">
                        <span class="material-symbols-outlined">download</span> CSV
                    </button>
                </div>

                <div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
                    ${_stat('전체 제안', sum.total, '#3b82f6')}
                    ${_stat('승인 제안', sum.approved, '#10b981')}
                    ${_stat('진행 과제', sum.running, '#f97316')}
                    ${_stat('완료 과제', sum.closed, '#6366f1')}
                </div>

                <div class="card" style="margin-bottom:14px;">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                        <div>
                            <h3 style="margin:0;font-size:1rem;">이달의 제안 활동</h3>
                            <p style="margin:4px 0 0;color:var(--text-muted);font-size:0.82rem;">우수사원 선정 참고용 제안/승인/완료 집계</p>
                        </div>
                        <input type="month" class="form-input" style="width:150px;" value="${state.month}" onchange="ImprovementActivityModule.setMonth(this.value)">
                    </div>
                    <div class="card-body">${_rankHtml(monthRows)}</div>
                </div>

                <div class="filter-bar" style="gap:10px;flex-wrap:wrap;">
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="iaStatus" onchange="ImprovementActivityModule.setFilter('status',this.value)">
                            <option value="">전체 상태</option>
                            ${Object.keys(STATUS).map(k => `<option value="${k}" ${state.status===k?'selected':''}>${STATUS[k]}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">PDCA 단계</label>
                        <select class="form-select" id="iaStage" onchange="ImprovementActivityModule.setFilter('stage',this.value)">
                            <option value="">전체 단계</option>
                            ${STAGES.map(s => `<option value="${s.key}" ${state.stage===s.key?'selected':''}>${s.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="min-width:260px;"><label class="form-label">검색</label>
                        <input class="form-input" id="iaQ" value="${_esc(state.q)}" placeholder="제목, 작업자, 공정, 내용 검색" oninput="ImprovementActivityModule.setFilter('q',this.value)">
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3 style="margin:0;font-size:1rem;">개선활동 목록</h3></div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead><tr>
                                    <th style="width:95px;">등록일</th><th>제안자</th><th>구분</th><th>제목/공정</th>
                                    <th>PDCA</th><th>찬성/반대</th><th>상태</th><th style="width:170px;">작업</th>
                                </tr></thead>
                                <tbody>${rows.length ? rows.map(_rowHtml).join('') : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">등록된 개선활동이 없습니다.</td></tr>'}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function _stat(label, value, color) {
        return `<div class="stat-card" style="border-top:4px solid ${color};"><div class="stat-card-value">${UIUtils.formatNumber(value)}</div><div class="stat-card-label">${label}</div></div>`;
    }
    function _rankHtml(rows) {
        const map = {};
        rows.forEach(r => {
            const name = r.proposer || '미지정';
            if (!map[name]) map[name] = { proposed: 0, approved: 0, closed: 0, score: 0 };
            map[name].proposed++;
            if (r.approval === 'approved') map[name].approved++;
            if (r.status === 'closed') map[name].closed++;
            map[name].score += 1 + (r.approval === 'approved' ? 2 : 0) + (r.status === 'closed' ? 3 : 0);
        });
        const ranks = Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.score - a.score || b.proposed - a.proposed).slice(0, 5);
        if (!ranks.length) return '<div style="color:var(--text-muted);font-size:0.9rem;">해당 월 제안 활동이 없습니다.</div>';
        return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">${ranks.map((r,i)=>`
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;background:${i===0?'rgba(59,130,246,0.08)':'white'};">
                <div style="font-size:0.78rem;color:var(--text-muted);">#${i+1} · 점수 ${r.score}</div>
                <div style="font-weight:900;margin:4px 0;">${_esc(r.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">제안 ${r.proposed} / 승인 ${r.approved} / 완료 ${r.closed}</div>
            </div>`).join('')}</div>`;
    }
    function _rowHtml(r) {
        const votes = r.votes || { agree: 0, disagree: 0 };
        return `<tr>
            <td>${_fmtDate(r.date)}</td>
            <td><strong>${_esc(r.proposer || '-')}</strong></td>
            <td>${r.category === 'proposal' ? _badge('개선제안','rgba(16,185,129,.12)','#047857') : _badge('문제점','rgba(239,68,68,.12)','#b91c1c')}</td>
            <td><strong>${_esc(r.title || '-')}</strong><div style="font-size:0.78rem;color:var(--text-muted);">${_esc(r.process || '-')}</div></td>
            <td>${_pdcaMini(r.pdcaStage)}</td>
            <td><span style="color:var(--accent-green);font-weight:800;">${votes.agree||0}</span> / <span style="color:var(--accent-red);font-weight:800;">${votes.disagree||0}</span></td>
            <td>${_statusBadge(r)}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-xs btn-outline" onclick="ImprovementActivityModule.openDetail('${_js(r.id)}')">상세</button>
                <button class="btn btn-xs btn-secondary" onclick="ImprovementActivityModule.openProposalModal('${_js(r.id)}')">수정</button>
                <button class="btn btn-xs btn-danger" onclick="ImprovementActivityModule.remove('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }
    function _statusBadge(r) {
        if (r.status === 'rejected') return _badge('반려','rgba(239,68,68,.12)','#b91c1c');
        if (r.status === 'closed') return _badge('완료','rgba(99,102,241,.12)','#4338ca');
        if (r.approval === 'approved') return _badge(_statusLabel(r.status),'rgba(16,185,129,.12)','#047857');
        return _badge(_statusLabel(r.status),'rgba(59,130,246,.12)','#1d4ed8');
    }
    function _pdcaMini(stage) {
        const idx = _stageIndex(stage);
        return `<div style="display:flex;gap:3px;align-items:center;">${STAGES.map((s,i)=>`<span title="${s.label}" style="width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;background:${i<=idx?'#3b82f6':'#e5e7eb'};color:${i<=idx?'white':'#64748b'};">${s.key[0].toUpperCase()}</span>`).join('')}</div>`;
    }

    function setFilter(key, value) { state[key] = value; render(document.getElementById('pageContent')); }
    function setMonth(value) { state.month = value || state.month; render(document.getElementById('pageContent')); }

    function _peopleList() {
        const operators = (Storage.getAll(DB.STORES.OPERATORS) || [])
            .map(p => ({ ...p, personKey: `operator:${p.id}`, roleLabel: '작업자', deptText: p.dept || p.position || '' }));
        const inspectors = (Storage.getAll(DB.STORES.INSPECTORS) || [])
            .map(p => ({ ...p, personKey: `inspector:${p.id}`, roleLabel: '검사자', deptText: p.qualification || (p.processes || []).join(', ') || '' }));
        return [...operators, ...inspectors]
            .filter(p => p.name)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    }

    function _personOptions(selectedName = '', selectedRole = '') {
        const people = _peopleList();
        const selectedKey = people.find(p => p.name === selectedName && (!selectedRole || p.roleLabel === selectedRole))?.personKey || '';
        const legacy = selectedName && !selectedKey
            ? `<option value="legacy:${_esc(selectedName)}" selected>${_esc(selectedName)} (기존 등록명)</option>`
            : '';
        return `<option value="">작업자/검사자 선택</option>` + legacy + people.map(p => `
            <option value="${_esc(p.personKey)}" ${selectedKey === p.personKey ? 'selected' : ''}>
                ${_esc(p.name)} (${_esc(p.roleLabel)}${p.deptText ? ' · ' + _esc(p.deptText) : ''})
            </option>`).join('');
    }

    function selectPerson(key) {
        // Selection is kept as the registered proposer only.
    }

    function _form(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">등록일</label><input type="date" class="form-input" id="iaDate" value="${r.date || UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">구분</label><select class="form-select" id="iaCategory"><option value="problem" ${r.category==='problem'?'selected':''}>문제점</option><option value="proposal" ${r.category==='proposal'?'selected':''}>개선제안</option></select></div>
                <div class="form-group"><label class="form-label">제안자 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="iaProposer" onchange="ImprovementActivityModule.selectPerson(this.value)">${_personOptions(r.proposer || '', r.proposerRole || '')}</select></div>
                <div class="form-group"><label class="form-label">공정/위치</label><input class="form-input" id="iaProcess" value="${_esc(r.process||'')}" placeholder="문제 발생 공정 또는 위치"></div>
                <div class="form-group"><label class="form-label">제목</label><input class="form-input" id="iaTitle" value="${_esc(r.title||'')}" placeholder="개선활동 제목"></div>
            </div>
            <div class="form-group"><label class="form-label">문제점</label><textarea class="form-textarea" id="iaProblem" rows="4" placeholder="현장 문제, 낭비, 불편, 품질 위험 등을 입력">${_esc(r.problem||'')}</textarea></div>
            <div class="form-group"><label class="form-label">개선 제안/아이디어</label><textarea class="form-textarea" id="iaProposal" rows="4" placeholder="개선 아이디어, 기대효과를 입력">${_esc(r.proposal||'')}</textarea></div>
            <div class="form-group"><label class="form-label">사진 첨부</label><input type="file" class="form-input" id="iaPhotos" accept="image/*" multiple><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">기존 사진 ${r.photos ? r.photos.length : 0}개. 새 사진을 선택하면 추가 저장됩니다.</div></div>
        </div>`;
    }
    function openProposalModal(id = '') {
        const r = id ? Storage.getById(STORE, id) : {};
        UIUtils.showModal(id ? '개선활동 수정' : '개선활동 제안 등록', _form(r || {}), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ImprovementActivityModule.saveProposal('${_js(id)}')">저장</button>`, 'xl');
    }
    async function _readPhotos(input) {
        const files = Array.from(input?.files || []);
        const jobs = files.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        }));
        return (await Promise.all(jobs)).filter(Boolean);
    }
    async function saveProposal(id = '') {
        const old = id ? Storage.getById(STORE, id) : {};
        const photos = await _readPhotos(document.getElementById('iaPhotos'));
        const personKey = document.getElementById('iaProposer').value;
        const person = _peopleList().find(p => p.personKey === personKey);
        const legacyName = personKey.startsWith('legacy:') ? personKey.replace(/^legacy:/, '') : '';
        const data = {
            date: document.getElementById('iaDate').value || UIUtils.today(),
            category: document.getElementById('iaCategory').value,
            proposer: person?.name || legacyName,
            proposerRole: person?.roleLabel || (legacyName ? old.proposerRole || '' : ''),
            proposerRef: personKey,
            department: '',
            process: document.getElementById('iaProcess').value.trim(),
            title: document.getElementById('iaTitle').value.trim(),
            problem: document.getElementById('iaProblem').value.trim(),
            proposal: document.getElementById('iaProposal').value.trim(),
            photos: [...(old.photos || []), ...photos],
            status: old.status || 'reviewing',
            approval: old.approval || 'pending',
            pdcaStage: old.pdcaStage || 'proposal',
            votes: old.votes || { agree: 0, disagree: 0 },
            createdAt: old.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (!data.title || !data.proposer) { UIUtils.toast('제목과 제안자를 입력하세요.', 'warning'); return; }
        if (id) await Storage.update(STORE, id, data); else await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('개선활동 제안이 저장되었습니다.', 'success');
        render(document.getElementById('pageContent'));
    }

    function openDetail(id) {
        const r = Storage.getById(STORE, id);
        if (!r) return;
        const votes = r.votes || { agree: 0, disagree: 0 };
        UIUtils.showModal('개선활동 상세 / PDCA 진행', `
            <div style="display:grid;gap:14px;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                    <div><h3 style="margin:0 0 6px;">${_esc(r.title)}</h3><div style="color:var(--text-muted);font-size:0.85rem;">${_esc(r.proposer)} · ${_esc(r.process)} · ${_fmtDate(r.date)}</div></div>
                    <div>${_statusBadge(r)}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="card"><div class="card-body"><h4 style="margin-top:0;">문제점</h4><div style="white-space:pre-wrap;">${_esc(r.problem||'-')}</div></div></div>
                    <div class="card"><div class="card-body"><h4 style="margin-top:0;">개선제안</h4><div style="white-space:pre-wrap;">${_esc(r.proposal||'-')}</div></div></div>
                </div>
                ${_photosHtml(r.photos)}
                <div class="card"><div class="card-body">
                    <h4 style="margin-top:0;">관리자 검토</h4>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">찬성 <strong style="color:var(--accent-green);">${votes.agree||0}</strong> / 반대 <strong style="color:var(--accent-red);">${votes.disagree||0}</strong>
                        <button class="btn btn-sm btn-outline" onclick="ImprovementActivityModule.vote('${_js(id)}','agree')">찬성</button>
                        <button class="btn btn-sm btn-outline" onclick="ImprovementActivityModule.vote('${_js(id)}','disagree')">반대</button>
                        <button class="btn btn-sm btn-primary" onclick="ImprovementActivityModule.setApproval('${_js(id)}','approved')">찬성 승인</button>
                        <button class="btn btn-sm btn-danger" onclick="ImprovementActivityModule.setApproval('${_js(id)}','rejected')">반려</button>
                    </div>
                </div></div>
                ${_pdcaForm(r)}
            </div>`, `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button><button class="btn btn-primary" onclick="ImprovementActivityModule.savePdca('${_js(id)}')">PDCA 저장</button>`, 'xxl');
    }
    function _photosHtml(photos = []) {
        if (!photos.length) return '';
        return `<div class="card"><div class="card-body"><h4 style="margin-top:0;">첨부 사진</h4><div style="display:flex;gap:10px;flex-wrap:wrap;">${photos.map(p=>`<img src="${p.dataUrl}" alt="${_esc(p.name)}" style="width:120px;height:90px;object-fit:cover;border:1px solid var(--border-color);border-radius:8px;">`).join('')}</div></div></div>`;
    }
    function _pdcaForm(r) {
        return `<div class="card"><div class="card-body">
            <h4 style="margin-top:0;">PDCA 진행 입력</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;">
                <div class="form-group"><label class="form-label">현재 단계</label><select class="form-select" id="iaPdcaStage">${STAGES.map(s=>`<option value="${s.key}" ${r.pdcaStage===s.key?'selected':''}>${s.label}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">상태</label><select class="form-select" id="iaPdcaStatus">${Object.keys(STATUS).map(k=>`<option value="${k}" ${r.status===k?'selected':''}>${STATUS[k]}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">담당자</label><input class="form-input" id="iaOwner" value="${_esc(r.owner||'')}"></div>
                <div class="form-group"><label class="form-label">완료 예정일</label><input type="date" class="form-input" id="iaDue" value="${r.dueDate||''}"></div>
            </div>
            <div class="form-group"><label class="form-label">처리 방법 / 추진 일정</label><textarea class="form-textarea" id="iaPlan" rows="3">${_esc(r.actionPlan||'')}</textarea></div>
            <div class="form-group"><label class="form-label">개선 목표 설정</label><textarea class="form-textarea" id="iaGoal" rows="2">${_esc(r.goal||'')}</textarea></div>
            <div class="form-group"><label class="form-label">원인분석</label><textarea class="form-textarea" id="iaRootCause" rows="3">${_esc(r.rootCause||'')}</textarea></div>
            <div class="form-group"><label class="form-label">과제 해결 / 개선 결과</label><textarea class="form-textarea" id="iaResult" rows="3">${_esc(r.result||'')}</textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">효과</label><textarea class="form-textarea" id="iaEffect" rows="2">${_esc(r.effect||'')}</textarea></div>
                <div class="form-group"><label class="form-label">비용</label><textarea class="form-textarea" id="iaCost" rows="2">${_esc(r.cost||'')}</textarea></div>
            </div>
            <div class="form-group"><label class="form-label">유지관리 점검</label><textarea class="form-textarea" id="iaSustain" rows="3" placeholder="정기 점검 방법, 주기, 확인 결과">${_esc(r.sustainCheck||'')}</textarea></div>
        </div></div>`;
    }
    async function vote(id, type) {
        const r = Storage.getById(STORE, id); if (!r) return;
        const votes = r.votes || { agree: 0, disagree: 0 };
        votes[type] = (Number(votes[type]) || 0) + 1;
        await Storage.update(STORE, id, { votes, updatedAt: new Date().toISOString() });
        UIUtils.closeModal(); openDetail(id);
    }
    async function setApproval(id, approval) {
        const patch = approval === 'approved'
            ? { approval, status: 'planning', pdcaStage: 'plan' }
            : { approval, status: 'rejected', pdcaStage: 'approve' };
        await Storage.update(STORE, id, { ...patch, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        UIUtils.closeModal(); openDetail(id);
    }
    async function savePdca(id) {
        await Storage.update(STORE, id, {
            pdcaStage: document.getElementById('iaPdcaStage').value,
            status: document.getElementById('iaPdcaStatus').value,
            owner: document.getElementById('iaOwner').value.trim(),
            dueDate: document.getElementById('iaDue').value,
            actionPlan: document.getElementById('iaPlan').value.trim(),
            goal: document.getElementById('iaGoal').value.trim(),
            rootCause: document.getElementById('iaRootCause').value.trim(),
            result: document.getElementById('iaResult').value.trim(),
            effect: document.getElementById('iaEffect').value.trim(),
            cost: document.getElementById('iaCost').value.trim(),
            sustainCheck: document.getElementById('iaSustain').value.trim(),
            updatedAt: new Date().toISOString()
        });
        UIUtils.closeModal();
        UIUtils.toast('PDCA 진행 내용이 저장되었습니다.', 'success');
        render(document.getElementById('pageContent'));
    }
    function remove(id) {
        UIUtils.confirm('개선활동 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            render(document.getElementById('pageContent'));
        });
    }
    function exportData() {
        const rows = _filtered().map(r => [r.date, r.proposer, r.category === 'proposal' ? '개선제안' : '문제점', r.process, r.title, _stageLabel(r.pdcaStage), _statusLabel(r.status), r.approval, r.owner || '', r.dueDate || '', r.goal || '', r.effect || '', r.cost || '']);
        Storage.exportToCSV(['등록일','제안자','구분','공정','제목','PDCA','상태','승인','담당자','예정일','목표','효과','비용'], rows, '개선활동');
    }

    return { render, setFilter, setMonth, selectPerson, openProposalModal, saveProposal, openDetail, vote, setApproval, savePdca, remove, exportData };
})();

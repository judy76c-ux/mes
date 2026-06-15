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
    let _iaPastedFiles = [];  // 클립보드 붙여넣기 이미지 임시 저장

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
            <td><strong>${_esc(r.proposer || '-')}</strong>${r.recipient ? `<div style="font-size:0.75rem;color:var(--text-muted);">→ ${_esc(r.recipient)}</div>` : ''}</td>
            <td>${r.category === 'proposal' ? _badge('개선제안','rgba(16,185,129,.12)','#047857') : _badge('문제점','rgba(239,68,68,.12)','#b91c1c')}</td>
            <td><strong>${_esc(r.title || '-')}</strong><div style="font-size:0.78rem;color:var(--text-muted);">${_esc(r.process || '-')}</div></td>
            <td>${_pdcaMini(r.pdcaStage)}</td>
            <td><span style="color:var(--accent-green);font-weight:800;">${votes.agree||0}</span> / <span style="color:var(--accent-red);font-weight:800;">${votes.disagree||0}</span></td>
            <td>${_statusBadge(r)}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline" onclick="ImprovementActivityModule.openDetail('${_js(r.id)}')">상세</button>
                <button class="btn btn-sm btn-secondary" onclick="ImprovementActivityModule.openProposalModal('${_js(r.id)}')">수정</button>
                <button class="btn btn-sm btn-danger" onclick="ImprovementActivityModule.remove('${_js(r.id)}')">삭제</button>
            </td>
        </tr>`;
    }
    function _statusBadge(r) {
        if (r.status === 'rejected') return _badge('반려','rgba(239,68,68,.12)','#b91c1c');
        if (r.status === 'closed') return _badge('완료','rgba(99,102,241,.12)','#4338ca');
        if (r.approval === 'approved') return _badge(_statusLabel(r.status),'rgba(16,185,129,.12)','#047857');
        return _badge(_statusLabel(r.status),'rgba(59,130,246,.12)','#1d4ed8');
    }
    const PDCA_STEPS = [
        { key: 'plan',  label: 'P 계획', status: 'planning',    color: '#3b82f6' },
        { key: 'do',    label: 'D 실행', status: 'running',     color: '#8b5cf6' },
        { key: 'check', label: 'C 점검', status: 'checking',    color: '#f97316' },
        { key: 'act',   label: 'A 조치', status: 'maintaining', color: '#10b981' }
    ];

    function _pdcaMini(stage) {
        const idx = PDCA_STEPS.findIndex(s => s.key === stage);
        return `<div style="display:flex;gap:3px;align-items:center;">${
            PDCA_STEPS.map((s, i) => `<span title="${s.label}" style="width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;background:${i<=idx&&idx>=0?s.color:'#e5e7eb'};color:${i<=idx&&idx>=0?'white':'#64748b'};">${s.label[0]}</span>`).join('')
        }</div>`;
    }

    function setFilter(key, value) { state[key] = value; render(document.getElementById('contentArea')); }
    function setMonth(value) { state.month = value || state.month; render(document.getElementById('contentArea')); }

    function _peopleList() {
        const users = typeof AuthModule !== 'undefined' ? (AuthModule.getUsers() || []) : [];
        return users
            .filter(u => u.active !== false && u.displayName)
            .map(u => ({ id: u.id, name: u.displayName, personKey: `user:${u.id}`, roleLabel: u.role || '', deptText: '' }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    }

    function _personOptions(selectedName = '', selectedRole = '') {
        const people = _peopleList();
        const selectedKey = people.find(p => p.name === selectedName && (!selectedRole || p.roleLabel === selectedRole))?.personKey || '';
        const legacy = selectedName && !selectedKey
            ? `<option value="legacy:${_esc(selectedName)}" selected>${_esc(selectedName)} (기존 등록명)</option>`
            : '';
        return `<option value="">제안자 선택</option>` + legacy + people.map(p => `
            <option value="${_esc(p.personKey)}" ${selectedKey === p.personKey ? 'selected' : ''}>
                ${_esc(p.name)} (${_esc(p.roleLabel)}${p.deptText ? ' · ' + _esc(p.deptText) : ''})
            </option>`).join('');
    }

    function selectPerson(key) {
        // Selection is kept as the registered proposer only.
    }

    function _recipientOptions(selectedKey = '') {
        const people = _peopleList();
        return `<option value="">수신자 선택 (선택사항)</option>` + people.map(p => `
            <option value="${_esc(p.personKey)}" ${selectedKey === p.personKey ? 'selected' : ''}>
                ${_esc(p.name)} (${_esc(p.roleLabel)}${p.deptText ? ' · ' + _esc(p.deptText) : ''})
            </option>`).join('');
    }

    function _form(r = {}) {
        return `<div style="display:grid;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">등록일</label><input type="date" class="form-input" id="iaDate" value="${r.date || UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">구분</label><select class="form-select" id="iaCategory"><option value="problem" ${r.category==='problem'?'selected':''}>문제점</option><option value="proposal" ${r.category==='proposal'?'selected':''}>개선제안</option></select></div>
                <div class="form-group"><label class="form-label">제안자 <span style="color:var(--accent-red)">*</span></label><select class="form-select" id="iaProposer" onchange="ImprovementActivityModule.selectPerson(this.value)">${_personOptions(r.proposer || '', r.proposerRole || '')}</select></div>
                <div class="form-group"><label class="form-label">수신자 (관리자)</label><select class="form-select" id="iaRecipient">${_recipientOptions(r.recipientRef || '')}</select></div>
                <div class="form-group"><label class="form-label">공정/위치</label><input class="form-input" id="iaProcess" value="${_esc(r.process||'')}" placeholder="문제 발생 공정 또는 위치"></div>
                <div class="form-group"><label class="form-label">제목</label><input class="form-input" id="iaTitle" value="${_esc(r.title||'')}" placeholder="개선활동 제목"></div>
            </div>
            <div class="form-group"><label class="form-label">문제점</label><textarea class="form-textarea" id="iaProblem" rows="4" placeholder="현장 문제, 낭비, 불편, 품질 위험 등을 입력">${_esc(r.problem||'')}</textarea></div>
            <div class="form-group"><label class="form-label">개선 제안/아이디어</label><textarea class="form-textarea" id="iaProposal" rows="4" placeholder="개선 아이디어, 기대효과를 입력">${_esc(r.proposal||'')}</textarea></div>
            <div class="form-group"><label class="form-label">사진 첨부</label>
                <input type="file" class="form-input" id="iaPhotos" accept="image/*" multiple>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">기존 사진 ${r.photos ? r.photos.length : 0}개. 새 사진을 선택하거나 아래 영역에 Ctrl+V로 붙여넣으면 추가됩니다.</div>
                <div id="iaPasteZone" tabindex="0"
                     style="min-height:60px;border:2px dashed var(--border-color);border-radius:8px;margin-top:8px;padding:12px 16px;color:var(--text-muted);font-size:0.85rem;cursor:pointer;outline:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;"
                     onclick="document.getElementById('iaPasteZone').focus()"
                     onfocus="this.style.borderColor='var(--accent-blue)'"
                     onblur="this.style.borderColor='var(--border-color)'">
                    <span id="iaPasteHint" style="pointer-events:none;">여기를 클릭 후 Ctrl+V로 스크린샷 붙여넣기</span>
                </div>
            </div>
        </div>`;
    }
    function _iaPasteHandler(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        let added = 0;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const blob = items[i].getAsFile();
                if (!blob) continue;
                const ts = Date.now() + added;
                const file = new File([blob], `clipboard_${ts}.png`, { type: blob.type || 'image/png' });
                _iaPastedFiles.push(file);
                added++;
                const reader = new FileReader();
                reader.onload = function(ev) {
                    const zone = document.getElementById('iaPasteZone');
                    if (!zone) return;
                    const hint = document.getElementById('iaPasteHint');
                    if (hint) hint.style.display = 'none';
                    const thumb = document.createElement('div');
                    thumb.style.cssText = 'position:relative;display:inline-block;';
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.style.cssText = 'height:64px;width:auto;border-radius:4px;border:1px solid var(--border-color);object-fit:cover;';
                    const rmBtn = document.createElement('button');
                    rmBtn.type = 'button';
                    rmBtn.textContent = '×';
                    rmBtn.style.cssText = 'position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:18px;padding:0;text-align:center;';
                    const fileRef = file;
                    rmBtn.onclick = function() {
                        const idx = _iaPastedFiles.indexOf(fileRef);
                        if (idx !== -1) _iaPastedFiles.splice(idx, 1);
                        thumb.remove();
                        if (!document.querySelectorAll('#iaPasteZone img').length) {
                            const h = document.getElementById('iaPasteHint');
                            if (h) h.style.display = '';
                        }
                    };
                    thumb.appendChild(img);
                    thumb.appendChild(rmBtn);
                    zone.appendChild(thumb);
                };
                reader.readAsDataURL(blob);
            }
        }
        if (added) e.preventDefault();
    }

    function openProposalModal(id = '') {
        _iaPastedFiles = [];
        const r = id ? Storage.getById(STORE, id) : {};
        UIUtils.showModal(id ? '개선활동 수정' : '개선활동 제안 등록', _form(r || {}), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ImprovementActivityModule.saveProposal('${_js(id)}')">저장</button>`, 'xl');
        setTimeout(() => {
            document.addEventListener('paste', _iaDocPasteHandler);
        }, 50);
    }

    function _iaDocPasteHandler(e) {
        const zone = document.getElementById('iaPasteZone');
        if (!zone) { document.removeEventListener('paste', _iaDocPasteHandler); return; }
        _iaPasteHandler(e);
    }
    async function _readPhotos(input) {
        const files = Array.from(input?.files || []);
        if (!files.length) return [];
        const results = [];
        for (const file of files) {
            try {
                const url = await ApiClient.uploadPhoto(file, 'improvement');
                results.push({ name: file.name, url });
            } catch (e) {
                UIUtils.toast(`사진 업로드 실패: ${file.name} — ${e.message}`, 'error');
            }
        }
        return results;
    }
    async function saveProposal(id = '') {
        document.removeEventListener('paste', _iaDocPasteHandler);
        const old = id ? Storage.getById(STORE, id) : {};
        const photos = await _readPhotos(document.getElementById('iaPhotos'));
        const pastedPhotos = [];
        for (const file of _iaPastedFiles) {
            try {
                const url = await ApiClient.uploadPhoto(file, 'improvement');
                pastedPhotos.push({ name: file.name, url });
            } catch (e) {
                UIUtils.toast(`붙여넣기 사진 업로드 실패: ${e.message}`, 'error');
            }
        }
        _iaPastedFiles = [];
        const personKey = document.getElementById('iaProposer').value;
        const person = _peopleList().find(p => p.personKey === personKey);
        const legacyName = personKey.startsWith('legacy:') ? personKey.replace(/^legacy:/, '') : '';
        const recipientKey = document.getElementById('iaRecipient')?.value || '';
        const recipient = _peopleList().find(p => p.personKey === recipientKey);
        const data = {
            date: document.getElementById('iaDate').value || UIUtils.today(),
            category: document.getElementById('iaCategory').value,
            proposer: person?.name || legacyName,
            proposerRole: person?.roleLabel || (legacyName ? old.proposerRole || '' : ''),
            proposerRef: personKey,
            recipientRef: recipientKey,
            recipient: recipient?.name || '',
            recipientRole: recipient?.roleLabel || '',
            department: '',
            process: document.getElementById('iaProcess').value.trim(),
            title: document.getElementById('iaTitle').value.trim(),
            problem: document.getElementById('iaProblem').value.trim(),
            proposal: document.getElementById('iaProposal').value.trim(),
            photos: [...(old.photos || []), ...photos, ...pastedPhotos],
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
        render(document.getElementById('contentArea'));
    }

    function _ownerOptions(selected) {
        const people = _peopleList();
        return `<option value="">담당자 선택</option>` +
            people.map(p => `<option value="${_esc(p.name)}" ${p.name === selected ? 'selected' : ''}>${_esc(p.name)}${p.deptText ? ' · ' + _esc(p.deptText) : ''}</option>`).join('');
    }

    function openDetail(id) {
        const r = Storage.getById(STORE, id);
        if (!r) return;
        const votes = r.votes || { agree: 0, disagree: 0 };
        const isApproved = r.approval === 'approved';
        const isRejected = r.approval === 'rejected';
        const footerBtns = `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`;

        UIUtils.showModal('개선활동 상세', `
            <div style="display:grid;gap:14px;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                    <div><h3 style="margin:0 0 6px;">${_esc(r.title)}</h3>
                        <div style="color:var(--text-muted);font-size:0.85rem;">${_esc(r.proposer)} · ${_esc(r.process||'-')} · ${_fmtDate(r.date)}${r.recipient ? ` · 수신: ${_esc(r.recipient)}` : ''}</div>
                    </div>
                    <div>${_statusBadge(r)}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="card"><div class="card-body"><h4 style="margin-top:0;">문제점</h4><div style="white-space:pre-wrap;">${_esc(r.problem||'-')}</div></div></div>
                    <div class="card"><div class="card-body"><h4 style="margin-top:0;">개선제안</h4><div style="white-space:pre-wrap;">${_esc(r.proposal||'-')}</div></div></div>
                </div>
                ${_photosHtml(r.photos)}
                ${!isRejected && !isApproved ? `<div class="card"><div class="card-body">
                    <h4 style="margin-top:0;">관리자 검토</h4>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button class="btn btn-sm btn-primary" onclick="ImprovementActivityModule.setApproval('${_js(id)}','approved')">찬성 승인</button>
                        <button class="btn btn-sm btn-danger" onclick="ImprovementActivityModule.setApproval('${_js(id)}','rejected')">반려</button>
                    </div>
                </div></div>` : ''}
                ${isApproved ? _pdcaForm(r) : ''}
            </div>`, footerBtns, 'xxl');
    }

    function _photosHtml(photos = []) {
        if (!photos.length) return '';
        const imgs = photos.map(p => {
            const src = p.url ? ApiClient.photoUrl(p.url) : (p.dataUrl || '');
            return src ? `<img src="${src}" alt="${_esc(p.name||'')}" style="width:120px;height:90px;object-fit:cover;border:1px solid var(--border-color);border-radius:8px;">` : '';
        }).join('');
        return `<div class="card"><div class="card-body"><h4 style="margin-top:0;">첨부 사진</h4><div style="display:flex;gap:10px;flex-wrap:wrap;">${imgs}</div></div></div>`;
    }

    function _participantCheckboxes(selected) {
        const sel = Array.isArray(selected) ? selected : [];
        const people = _peopleList();
        if (!people.length) return '<span style="font-size:.8rem;color:var(--text-muted);">등록된 사용자 없음</span>';
        return people.map(p => {
            const checked = sel.includes(p.name);
            return `<label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer;padding:3px 8px;border-radius:4px;background:${checked?'rgba(59,130,246,.1)':'transparent'};border:1px solid ${checked?'#93c5fd':'transparent'};">
                <input type="checkbox" value="${_esc(p.name)}" ${checked?'checked':''}
                    style="margin:0;" onchange="this.parentElement.style.background=this.checked?'rgba(59,130,246,.1)':'transparent';this.parentElement.style.border=this.checked?'1px solid #93c5fd':'1px solid transparent';">
                ${_esc(p.name)}
            </label>`;
        }).join('');
    }

    function _collectParticipants() {
        const box = document.getElementById('iaParticipantsBox');
        if (!box) return [];
        return Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
    }

    function _pdcaForm(r) {
        const stage = r.pdcaStage || 'plan';
        const stepIdx = PDCA_STEPS.findIndex(s => s.key === stage);
        const step = PDCA_STEPS[stepIdx] || PDCA_STEPS[0];
        const hasNext = stepIdx < PDCA_STEPS.length - 1;
        const isFinal = stepIdx === PDCA_STEPS.length - 1;

        // 단계 진행 바
        const progressBar = `<div style="display:flex;gap:0;margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid var(--border-color);">
            ${PDCA_STEPS.map((s, i) => {
                const isDone = i < stepIdx;
                const isActive = i === stepIdx;
                return `<div style="flex:1;padding:7px 4px;text-align:center;font-size:.78rem;font-weight:${isActive?'800':'600'};
                    background:${isDone?'#dbeafe':isActive?s.color:'var(--bg-secondary)'};
                    color:${isDone?'#1d4ed8':isActive?'white':'var(--text-muted)'};
                    border-right:${i<PDCA_STEPS.length-1?'1px solid var(--border-color)':'none'};">
                    ${s.label}${isDone?' ✓':''}
                </div>`;
            }).join('')}
        </div>`;

        // 이전 단계 내용 요약 (읽기 전용)
        function _prevSummary() {
            if (stepIdx === 0) return '';
            const empty = '<span style="font-size:.8rem;color:var(--text-muted);">입력 내용 없음</span>';
            const prevItems = [];
            if (stepIdx > 0) {
                const planParts = [
                    r.goal      && `<b>개선 목표:</b> ${_esc(r.goal)}`,
                    r.rootCause && `<b>원인분석:</b> ${_esc(r.rootCause)}`,
                    r.actionPlan && `<b>실행계획:</b> ${_esc(r.actionPlan)}`
                ].filter(Boolean);
                prevItems.push({ label: 'P 계획', color: '#3b82f6', html: planParts.length ? planParts.join('<br>') : empty });
            }
            if (stepIdx > 1) {
                const doParts = [
                    r.actionPlan && `<b>실행 내용:</b> ${_esc(r.actionPlan)}`,
                    r.result     && `<b>수집 데이터:</b> ${_esc(r.result)}`
                ].filter(Boolean);
                prevItems.push({ label: 'D 실행', color: '#8b5cf6', html: doParts.length ? doParts.join('<br>') : empty });
            }
            if (stepIdx > 2) {
                const checkParts = [
                    r.result      && `<b>성과 평가:</b> ${_esc(r.result)}`,
                    r.effect      && `<b>효과:</b> ${_esc(r.effect)}`,
                    r.sustainCheck && `<b>개선 포인트:</b> ${_esc(r.sustainCheck)}`
                ].filter(Boolean);
                prevItems.push({ label: 'C 점검', color: '#f97316', html: checkParts.length ? checkParts.join('<br>') : empty });
            }
            return `<details style="margin-bottom:12px;" open>
                <summary style="cursor:pointer;font-size:.82rem;font-weight:600;color:var(--text-secondary);padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">history</span> 이전 단계 내용
                </summary>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
                    ${prevItems.map(item => `<div style="padding:10px 12px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${item.color};">
                        <div style="font-size:.75rem;font-weight:700;color:${item.color};margin-bottom:6px;">${item.label}</div>
                        <div style="font-size:.82rem;color:var(--text-secondary);line-height:1.7;">${item.html}</div>
                    </div>`).join('')}
                </div>
            </details>`;
        }
        const prevHtml = _prevSummary();

        // 단계별 입력 필드
        const currentUser = typeof AuthModule !== 'undefined' ? AuthModule.getCurrentUser() : null;
        const currentUserKey = currentUser ? `user:${currentUser.id}` : '';
        const isRecipient = r.recipientRef && currentUserKey && r.recipientRef === currentUserKey;
        const planReadOnly = (stage === 'plan') && r.recipientRef && !isRecipient;

        let fields = prevHtml;
        if (stage === 'plan') {
            if (r.recipient && !isRecipient) {
                fields += `<div style="padding:10px 14px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);color:#92400e;font-size:.85rem;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:#f59e0b;">lock</span>
                    계획 단계는 수신 관리자 <strong>${_esc(r.recipient)}</strong>님만 작성할 수 있습니다.
                </div>`;
            }
            if (!r.recipientRef || isRecipient) {
                fields += `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <div class="form-group"><label class="form-label">담당자 <span style="color:var(--accent-red)">*</span></label>
                        <select class="form-select" id="iaOwner">${_ownerOptions(r.owner||'')}</select>
                    </div>
                    <div class="form-group"><label class="form-label">완료 예정일</label>
                        <input type="date" class="form-input" id="iaDue" value="${r.dueDate||''}">
                    </div>
                </div>
                <div class="form-group"><label class="form-label">참여자</label>
                    <div id="iaParticipantsBox" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--border-color);border-radius:8px;min-height:42px;background:var(--bg-secondary);">
                        ${_participantCheckboxes(r.participants||[])}
                    </div>
                </div>
                <div class="form-group"><label class="form-label">개선 목표</label>
                    <textarea class="form-textarea" id="iaGoal" rows="2" placeholder="무엇을 어느 수준까지 개선할 것인지 목표를 구체적으로 작성">${_esc(r.goal||'')}</textarea>
                </div>
                <div class="form-group"><label class="form-label">원인분석</label>
                    <textarea class="form-textarea" id="iaRootCause" rows="3" placeholder="문제의 근본 원인을 분석 (5-Why, 특성요인도 등)">${_esc(r.rootCause||'')}</textarea>
                </div>
                <div class="form-group"><label class="form-label">실행 계획 / 추진 일정</label>
                    <textarea class="form-textarea" id="iaPlan" rows="3" placeholder="원인 제거를 위한 구체적인 실행 방법과 일정">${_esc(r.actionPlan||'')}</textarea>
                </div>`;
            } else {
                // 읽기 전용: 이미 작성된 내용이 있으면 표시
                fields += `
                <div style="display:grid;gap:10px;">
                    ${r.owner ? `<div class="form-group"><label class="form-label">담당자</label><div class="form-input" style="background:var(--bg-secondary);color:var(--text-secondary);">${_esc(r.owner)}</div></div>` : ''}
                    ${r.dueDate ? `<div class="form-group"><label class="form-label">완료 예정일</label><div class="form-input" style="background:var(--bg-secondary);color:var(--text-secondary);">${_esc(r.dueDate)}</div></div>` : ''}
                    ${r.goal ? `<div class="form-group"><label class="form-label">개선 목표</label><div style="padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);white-space:pre-wrap;">${_esc(r.goal)}</div></div>` : ''}
                    ${r.rootCause ? `<div class="form-group"><label class="form-label">원인분석</label><div style="padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);white-space:pre-wrap;">${_esc(r.rootCause)}</div></div>` : ''}
                    ${r.actionPlan ? `<div class="form-group"><label class="form-label">실행 계획</label><div style="padding:8px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);white-space:pre-wrap;">${_esc(r.actionPlan)}</div></div>` : ''}
                    ${!r.goal && !r.rootCause && !r.actionPlan ? '<div style="font-size:.85rem;color:var(--text-muted);padding:8px 0;">아직 작성된 계획 내용이 없습니다.</div>' : ''}
                </div>`;
            }
        } else if (stage === 'do') {
            fields += `
                <div class="form-group"><label class="form-label">실행 내용</label>
                    <textarea class="form-textarea" id="iaPlan" rows="4" placeholder="계획에 따라 수행한 실행 활동을 기록">${_esc(r.actionPlan||'')}</textarea>
                </div>
                <div class="form-group"><label class="form-label">수집 데이터 / 관찰 사항</label>
                    <textarea class="form-textarea" id="iaResult" rows="4" placeholder="실행 중 수집한 데이터, 관찰된 변화 사항 기록">${_esc(r.result||'')}</textarea>
                </div>`;
        } else if (stage === 'check') {
            fields += `
                <div class="form-group"><label class="form-label">성과 평가 / 결과 분석</label>
                    <textarea class="form-textarea" id="iaResult" rows="4" placeholder="목표 대비 실제 결과를 평가하고 데이터로 분석">${_esc(r.result||'')}</textarea>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label class="form-label">개선 효과</label>
                        <textarea class="form-textarea" id="iaEffect" rows="3" placeholder="수치화된 개선 효과 (불량률, 시간 단축 등)">${_esc(r.effect||'')}</textarea>
                    </div>
                    <div class="form-group"><label class="form-label">소요 비용</label>
                        <textarea class="form-textarea" id="iaCost" rows="3">${_esc(r.cost||'')}</textarea>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">추가 개선 포인트</label>
                    <textarea class="form-textarea" id="iaSustain" rows="2" placeholder="이번 사이클에서 발견된 추가 개선 필요 사항">${_esc(r.sustainCheck||'')}</textarea>
                </div>`;
        } else if (stage === 'act') {
            fields += `
                <div class="form-group"><label class="form-label">표준화 / 프로세스 개선 조치</label>
                    <textarea class="form-textarea" id="iaSustain" rows="4" placeholder="개선 내용을 표준화하고 재발 방지 프로세스 정리">${_esc(r.sustainCheck||'')}</textarea>
                </div>
                <div class="form-group"><label class="form-label">지속 관리 방법</label>
                    <textarea class="form-textarea" id="iaPlan" rows="3" placeholder="정기 점검 주기, 담당자, 확인 방법">${_esc(r.actionPlan||'')}</textarea>
                </div>`;
        }

        const actionBtns = isFinal
            ? `<button class="btn btn-primary" style="background:#10b981;border-color:#10b981;" onclick="ImprovementActivityModule.completePdca('${_js(r.id||'')}')">완료 처리</button>`
            : `<button class="btn btn-primary" onclick="ImprovementActivityModule.nextPdcaStage('${_js(r.id||'')}')">다음 단계 →</button>`;

        const canEdit = stage !== 'plan' || !r.recipientRef || isRecipient;

        return `<div class="card" style="border-left:3px solid ${step.color};"><div class="card-body">
            <h4 style="margin-top:0;">PDCA 진행${r.recipient && stage === 'plan' ? `<span style="font-size:.78rem;font-weight:400;color:var(--text-muted);margin-left:10px;">계획 담당: ${_esc(r.recipient)}</span>` : ''}</h4>
            ${progressBar}
            ${fields}
            ${canEdit ? `<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
                <button class="btn btn-secondary" onclick="ImprovementActivityModule.savePdca('${_js(r.id||'')}')">저장</button>
                ${actionBtns}
            </div>` : ''}
        </div></div>`;
    }

    async function _notifyOwner(r, ownerName) {
        try {
            const currentUser = typeof AuthModule !== 'undefined' ? AuthModule.getCurrentUser() : null;
            const post = {
                id: Storage.generateId ? Storage.generateId() : `notif_${Date.now()}`,
                category: '업무알림',
                title: `[개선활동] PDCA 담당자 지정 — ${_esc(r.title)}`,
                content: `${ownerName}님이 개선활동 PDCA 담당자로 지정되었습니다.\n\n제안자: ${r.proposer}\n제목: ${r.title}\n문제점: ${r.problem || ''}`,
                author: currentUser?.name || '관리자',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                replies: []
            };
            await Storage.add(DB.STORES.BOARD_POSTS, post);
            UIUtils.toast(`${ownerName}님께 게시판 알림이 등록되었습니다.`, 'info');
        } catch (e) {
            console.warn('알림 등록 실패:', e);
        }
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
    function _getPdcaPatch(old) {
        const g = id => document.getElementById(id)?.value ?? null;
        const trim = id => document.getElementById(id)?.value?.trim() ?? null;
        const newOwner = g('iaOwner');
        const patch = { updatedAt: new Date().toISOString() };
        if (newOwner !== null) patch.owner = newOwner;
        if (g('iaDue') !== null) patch.dueDate = g('iaDue');
        if (trim('iaGoal') !== null) patch.goal = trim('iaGoal');
        if (trim('iaPlan') !== null) patch.actionPlan = trim('iaPlan');
        if (trim('iaRootCause') !== null) patch.rootCause = trim('iaRootCause');
        if (trim('iaResult') !== null) patch.result = trim('iaResult');
        if (trim('iaEffect') !== null) patch.effect = trim('iaEffect');
        if (trim('iaCost') !== null) patch.cost = trim('iaCost');
        if (trim('iaSustain') !== null) patch.sustainCheck = trim('iaSustain');
        const participants = _collectParticipants();
        if (participants.length || document.getElementById('iaParticipantsBox')) patch.participants = participants;
        return { patch, newOwner };
    }

    async function savePdca(id) {
        const old = Storage.getById(STORE, id);
        const { patch, newOwner } = _getPdcaPatch(old);
        await Storage.update(STORE, id, patch);
        if (newOwner && newOwner !== (old?.owner || '')) await _notifyOwner(old || {}, newOwner);
        UIUtils.toast('저장되었습니다.', 'success');
        render(document.getElementById('contentArea'));
        openDetail(id);
    }

    async function nextPdcaStage(id) {
        const old = Storage.getById(STORE, id);
        const { patch, newOwner } = _getPdcaPatch(old);
        const curIdx = PDCA_STEPS.findIndex(s => s.key === (old?.pdcaStage || 'plan'));
        const next = PDCA_STEPS[curIdx + 1];
        if (next) {
            patch.pdcaStage = next.key;
            patch.status = next.status;
        }
        await Storage.update(STORE, id, patch);
        if (newOwner && newOwner !== (old?.owner || '')) await _notifyOwner(old || {}, newOwner);
        render(document.getElementById('contentArea'));
        openDetail(id);
    }

    async function completePdca(id) {
        const old = Storage.getById(STORE, id);
        const { patch } = _getPdcaPatch(old);
        patch.status = 'closed';
        patch.closedAt = new Date().toISOString();
        await Storage.update(STORE, id, patch);
        UIUtils.closeModal();
        UIUtils.toast('개선활동이 완료 처리되었습니다.', 'success');
        render(document.getElementById('contentArea'));
    }
    function remove(id) {
        UIUtils.confirm('개선활동 기록을 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            render(document.getElementById('contentArea'));
        });
    }
    function exportData() {
        const rows = _filtered().map(r => [r.date, r.proposer, r.category === 'proposal' ? '개선제안' : '문제점', r.process, r.title, _stageLabel(r.pdcaStage), _statusLabel(r.status), r.approval, r.owner || '', r.dueDate || '', r.goal || '', r.effect || '', r.cost || '']);
        Storage.exportToCSV(['등록일','제안자','구분','공정','제목','PDCA','상태','승인','담당자','예정일','목표','효과','비용'], rows, '개선활동');
    }

    return { render, setFilter, setMonth, selectPerson, openProposalModal, saveProposal, openDetail, vote, setApproval, savePdca, nextPdcaStage, completePdca, remove, exportData };
})();

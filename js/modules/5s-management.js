/**
 * 3정5S 관리 모듈
 * - 점검 일지 (체크시트 기반 3정·5행 현장 점검)
 * - 지적사항·시정조치 (이슈 등록 → 완료 추적)
 * - 점검 계획·업무분담 (구역별 담당자·주기 설정 + 예정 일정)
 */
var FiveSModule = (function () {
    'use strict';

    const STORE       = DB.STORES.S5_INSPECTIONS;
    const ISSUE_STORE = DB.STORES.S5_ISSUES;

    let _tab = 'inspection';

    const _today = () => new Date().toISOString().split('T')[0];
    const _esc   = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const _js    = s => String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    const AREAS = ['사출 공정', '도장 A라인', '도장 B라인', '레이져 공정', '출하·검사', '원자재 창고', '완제품 창고'];

    /* ─── 체크시트 기본 항목 정의 ─────────────────────────────── */
    const CHECK_ITEMS = [
        { key: 'fix_position', cat: '3정', label: '정위치',   desc: '작업장 물품·설비의 보관 위치가 표시·지정되어 있고 위치가 준수되는가' },
        { key: 'fix_item',     cat: '3정', label: '정품',     desc: '정해진 물품(공구·자재)만 작업장에 배치되어 있는가' },
        { key: 'fix_qty',      cat: '3정', label: '정량',     desc: '재고·공구 등 정해진 수량이 유지되고 있는가' },
        { key: 'seiri',        cat: '5행', label: '정리',     desc: '불필요한 물건이 제거되고 필요/불필요 구분이 명확한가' },
        { key: 'seiton',       cat: '5행', label: '정돈',     desc: '필요한 물품을 즉시 찾을 수 있도록 배치·표시되어 있는가' },
        { key: 'seiso',        cat: '5행', label: '청소',     desc: '작업장·설비·공구가 청결하게 유지되고 있는가' },
        { key: 'seiketsu',     cat: '5행', label: '청결',     desc: '청소 상태가 표준화되어 지속적으로 유지되고 있는가' },
        { key: 'shitsuke',     cat: '5행', label: '생활화',   desc: '규칙·표준이 현장에서 준수·생활화되어 있는가' },
        { key: 'safety',       cat: '안전', label: '안전관리', desc: '안전표지·경고문 게시, 보호구 착용, 통로 확보 여부' },
        { key: 'std_work',     cat: '공정', label: '표준작업', desc: '작업표준서 비치 및 내용 준수 여부' },
    ];

    const CAT_COLOR = { '3정': '#3b82f6', '5행': '#22c55e', '안전': '#f59e0b', '공정': '#8b5cf6' };

    /* ─── 점수 → 등급 ─────────────────────────────────────────── */
    function _grade(score) {
        if (score >= 95) return { g: 'S', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' };
        if (score >= 85) return { g: 'A', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
        if (score >= 75) return { g: 'B', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
        return { g: 'C', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    }

    function _calcScore(items) {
        const valid = items.filter(i => Number(i.score) > 0);
        if (!valid.length) return 0;
        return Math.round(valid.reduce((s, i) => s + Number(i.score), 0) / valid.length / 5 * 100);
    }

    /* ══════════════════════════════════════════════════════════
       MAIN RENDER
    ══════════════════════════════════════════════════════════ */
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-actions" id="s5Actions"></div>
            </div>

            <div class="stat-cards" id="s5Stats"></div>

            <div class="tab-bar" style="margin-bottom:16px;">
                <button class="tab-btn active" id="s5TabInspection"
                        onclick="FiveSModule.switchTab('inspection')">
                    <span class="material-symbols-outlined">assignment</span> 점검 일지
                </button>
                <button class="tab-btn" id="s5TabIssue"
                        onclick="FiveSModule.switchTab('issue')">
                    <span class="material-symbols-outlined">report_problem</span> 지적사항·시정조치
                </button>
                <button class="tab-btn" id="s5TabPlan"
                        onclick="FiveSModule.switchTab('plan')">
                    <span class="material-symbols-outlined">calendar_month</span> 점검 계획·업무분담
                </button>
            </div>

            <div id="s5Content"></div>
        </div>`;

        _tab = 'inspection';
        _refreshStats();
        _renderInspectionTab();
    }

    function switchTab(tab) {
        _tab = tab;
        ['inspection', 'issue', 'plan'].forEach(t => {
            const btn = document.getElementById('s5Tab' + t.charAt(0).toUpperCase() + t.slice(1));
            if (btn) btn.className = 'tab-btn' + (t === tab ? ' active' : '');
        });
        if (tab === 'inspection') _renderInspectionTab();
        else if (tab === 'issue') _renderIssueTab();
        else _renderPlanTab();
    }

    /* ══════════════════════════════════════════════════════════
       STATS
    ══════════════════════════════════════════════════════════ */
    function _refreshStats() {
        const el = document.getElementById('s5Stats');
        if (!el) return;
        const thisMonth   = _today().slice(0, 7);
        const inspections = Storage.getAll(STORE)       || [];
        const issues      = Storage.getAll(ISSUE_STORE) || [];
        const monthInsp   = inspections.filter(i => (i.date || '').startsWith(thisMonth));
        const open        = issues.filter(i => i.status !== '완료');
        const overdue     = issues.filter(i => i.status !== '완료' && i.dueDate && i.dueDate < _today());
        const done        = issues.filter(i => i.status === '완료' && (i.completedDate || '').startsWith(thisMonth));
        el.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-card-value">${monthInsp.length}</div>
                <div class="stat-card-label">이번달 점검 횟수</div>
            </div>
            <div class="stat-card ${open.length ? 'orange' : 'green'}">
                <div class="stat-card-value">${open.length}</div>
                <div class="stat-card-label">미결 지적사항</div>
            </div>
            <div class="stat-card ${overdue.length ? 'red' : 'green'}">
                <div class="stat-card-value">${overdue.length}</div>
                <div class="stat-card-label">기한초과 미조치</div>
            </div>
            <div class="stat-card green">
                <div class="stat-card-value">${done.length}</div>
                <div class="stat-card-label">이번달 시정완료</div>
            </div>`;
    }

    /* ══════════════════════════════════════════════════════════
       TAB 1 : 점검 일지
    ══════════════════════════════════════════════════════════ */
    function _renderInspectionTab() {
        const actions = document.getElementById('s5Actions');
        if (actions) actions.innerHTML = `
            <button class="btn btn-primary" onclick="FiveSModule.openInspModal()">
                <span class="material-symbols-outlined">add</span> 새 점검 일지
            </button>`;

        const now  = new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];

        document.getElementById('s5Content').innerHTML = `
        <div class="card"><div class="card-body">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;
                        padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:16px;">
                <input type="date" id="s5IFrom" class="form-input" style="width:130px;" value="${from}">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="s5ITo"   class="form-input" style="width:130px;" value="${_today()}">
                <select id="s5IArea" class="form-select" style="width:140px;">
                    <option value="">전체 구역</option>
                    ${AREAS.map(a => `<option>${_esc(a)}</option>`).join('')}
                </select>
                <button class="btn btn-primary btn-sm" onclick="FiveSModule.searchInsp()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>
            <div id="s5ITable"></div>
        </div></div>`;
        searchInsp();
    }

    function searchInsp() {
        const from = document.getElementById('s5IFrom')?.value || '';
        const to   = document.getElementById('s5ITo')?.value   || '';
        const area = document.getElementById('s5IArea')?.value  || '';
        const el   = document.getElementById('s5ITable');
        if (!el) return;

        const issueCount = {};
        (Storage.getAll(ISSUE_STORE) || []).forEach(i => {
            if (i.inspectionId) issueCount[i.inspectionId] = (issueCount[i.inspectionId] || 0) + 1;
        });

        const recs = (Storage.getAll(STORE) || [])
            .filter(r => (!from || r.date >= from) && (!to || r.date <= to) && (!area || r.area === area))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!recs.length) {
            el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);">
                <span class="material-symbols-outlined"
                    style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">assignment</span>
                조회된 점검 일지가 없습니다.<br>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;"
                    onclick="FiveSModule.openInspModal()">첫 점검 일지 작성하기</button>
            </div>`;
            return;
        }

        const rows = recs.map((r, i) => {
            const g  = _grade(r.totalScore || 0);
            const ic = issueCount[r.id] || 0;
            return `<tr>
                <td style="text-align:center;color:var(--text-muted);">${i + 1}</td>
                <td style="font-weight:600;">${_esc(r.date || '-')}</td>
                <td>${_esc(r.area || '-')}</td>
                <td>${_esc(r.inspector || '-')}</td>
                <td style="text-align:center;font-size:0.95rem;font-weight:700;">${r.totalScore || 0}점</td>
                <td style="text-align:center;">
                    <span style="background:${g.bg};color:${g.color};font-weight:700;
                                 padding:2px 10px;border-radius:4px;">${g.g}등급</span>
                </td>
                <td style="text-align:center;">
                    ${ic ? `<span style="color:var(--accent-orange);font-weight:700;">${ic}건</span>` : '-'}
                </td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-outline"
                            onclick="FiveSModule.viewInsp('${_js(r.id)}')">상세</button>
                        <button class="btn btn-sm btn-danger"
                            onclick="FiveSModule.removeInsp('${_js(r.id)}')">삭제</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        <div class="data-table-wrapper">
        <table class="data-table">
            <thead><tr>
                <th style="width:40px;">No</th><th>점검일</th><th>구역</th><th>점검자</th>
                <th>총점</th><th>등급</th><th>지적건수</th>
                <th style="width:120px;">작업</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    /* ── 점검 일지 작성 / 수정 모달 ──────────────────────────── */
    function openInspModal(id) {
        const rec   = id ? Storage.getById(STORE, id) : null;
        const items = rec
            ? rec.checkItems
            : CHECK_ITEMS.map(d => ({ ...d, score: 0, note: '' }));

        const tbody = items.map((item, idx) => {
            const cc   = CAT_COLOR[item.cat] || '#94a3b8';
            const opts = [
                { v: 5, l: '5 - 우수' }, { v: 4, l: '4 - 양호' }, { v: 3, l: '3 - 보통' },
                { v: 2, l: '2 - 미흡' }, { v: 1, l: '1 - 불량' }, { v: 0, l: '해당없음' }
            ].map(o =>
                `<option value="${o.v}" ${Number(item.score) === o.v ? 'selected' : ''}>${o.l}</option>`
            ).join('');

            return `<tr>
                <td style="text-align:center;padding:6px 8px;">
                    <span style="font-size:0.68rem;padding:1px 5px;border-radius:3px;
                                 background:${cc}22;color:${cc};font-weight:600;">${_esc(item.cat)}</span>
                </td>
                <td style="font-weight:600;font-size:0.82rem;padding:6px 8px;">${_esc(item.label)}</td>
                <td style="font-size:0.77rem;color:var(--text-muted);padding:6px 8px;">${_esc(item.desc)}</td>
                <td style="padding:4px 6px;">
                    <select class="form-select s5-score" data-idx="${idx}"
                            style="width:112px;font-size:0.8rem;"
                            onchange="FiveSModule._calcPreview()">
                        ${opts}
                    </select>
                </td>
                <td style="padding:4px 6px;">
                    <input type="text" class="form-input s5-note" data-idx="${idx}"
                           value="${_esc(item.note || '')}" placeholder="특이사항"
                           style="font-size:0.8rem;">
                </td>
            </tr>`;
        }).join('');

        UIUtils.showModal(
            rec ? '점검 일지 수정' : '3정5S 점검 일지 작성',
            `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">점검일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="s5IDate" value="${rec?.date || _today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">구역 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="s5IAreaSel">
                        ${AREAS.map(a => `<option ${rec?.area === a ? 'selected' : ''}>${_esc(a)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">점검자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="s5IInspector"
                           value="${_esc(rec?.inspector || '')}" placeholder="성명">
                </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <strong style="font-size:0.88rem;">📋 점검 체크시트</strong>
                <span style="font-size:0.82rem;">종합점수: <strong id="s5Preview" style="color:var(--accent-blue);">-</strong></span>
            </div>

            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;margin-bottom:14px;">
            <table style="width:100%;border-collapse:collapse;font-size:0.81rem;">
                <thead>
                    <tr style="background:var(--bg-secondary);">
                        <th style="padding:7px 8px;font-size:0.72rem;color:var(--text-muted);
                                   border-bottom:1px solid var(--border-color);width:48px;text-align:center;">구분</th>
                        <th style="padding:7px 8px;font-size:0.72rem;color:var(--text-muted);
                                   border-bottom:1px solid var(--border-color);width:60px;">항목</th>
                        <th style="padding:7px 8px;font-size:0.72rem;color:var(--text-muted);
                                   border-bottom:1px solid var(--border-color);">평가 기준</th>
                        <th style="padding:7px 8px;font-size:0.72rem;color:var(--text-muted);
                                   border-bottom:1px solid var(--border-color);width:120px;">평가</th>
                        <th style="padding:7px 8px;font-size:0.72rem;color:var(--text-muted);
                                   border-bottom:1px solid var(--border-color);">특이사항</th>
                    </tr>
                </thead>
                <tbody>${tbody}</tbody>
            </table>
            </div>

            <div class="form-group">
                <label class="form-label">종합의견</label>
                <textarea class="form-textarea" id="s5ISummary" rows="2"
                    placeholder="현장 종합 상태 의견">${_esc(rec?.summary || '')}</textarea>
            </div>
            <div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.06);
                        border-left:3px solid var(--accent-blue);border-radius:0 6px 6px 0;
                        font-size:0.77rem;color:var(--text-muted);">
                평가: 5=우수, 4=양호, 3=보통, 2=미흡, 1=불량, 해당없음=점수 제외 |
                <strong>95↑=S</strong> · <strong>85↑=A</strong> · <strong>75↑=B</strong> · <strong>75미만=C</strong>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary"
                onclick="FiveSModule.saveInsp(${id ? `'${_js(id)}'` : 'null'})">
                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">save</span> 저장
             </button>`,
            'xl'
        );
        setTimeout(() => FiveSModule._calcPreview(), 50);
    }

    function _calcPreview() {
        const scores = [...document.querySelectorAll('.s5-score')].map(s => Number(s.value));
        const valid  = scores.filter(s => s > 0);
        const total  = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length / 5 * 100) : 0;
        const el = document.getElementById('s5Preview');
        if (el) {
            const g = _grade(total);
            el.textContent = `${total}점 (${g.g}등급)`;
            el.style.color  = g.color;
        }
    }

    async function saveInsp(id) {
        const date      = document.getElementById('s5IDate')?.value;
        const area      = document.getElementById('s5IAreaSel')?.value;
        const inspector = document.getElementById('s5IInspector')?.value.trim();
        const summary   = document.getElementById('s5ISummary')?.value.trim() || '';

        if (!date)      { UIUtils.toast('점검일을 입력하세요.', 'warning'); return; }
        if (!inspector) { UIUtils.toast('점검자를 입력하세요.', 'warning'); return; }

        const scoreEls = [...document.querySelectorAll('.s5-score')];
        const noteEls  = [...document.querySelectorAll('.s5-note')];
        const checkItems = CHECK_ITEMS.map((def, idx) => ({
            ...def,
            score: Number(scoreEls[idx]?.value || 0),
            note:  noteEls[idx]?.value.trim() || ''
        }));

        const totalScore = _calcScore(checkItems);
        const { g: grade } = _grade(totalScore);
        const data = { date, area, inspector, checkItems, totalScore, grade, summary };

        if (id) {
            await Storage.update(STORE, id, { ...(Storage.getById(STORE, id) || {}), ...data });
            UIUtils.toast('점검 일지가 수정되었습니다.', 'success');
        } else {
            await Storage.add(STORE, data);
            const bad = checkItems.filter(i => i.score > 0 && i.score <= 2);
            if (bad.length) {
                UIUtils.toast(
                    `저장 완료 (${totalScore}점/${grade}등급). 미흡 항목 ${bad.length}건 — 지적사항 탭에서 등록하세요.`,
                    'success'
                );
            } else {
                UIUtils.toast(`점검 일지 저장 완료 (${totalScore}점 / ${grade}등급)`, 'success');
            }
        }
        UIUtils.closeModal();
        _refreshStats();
        searchInsp();
    }

    /* ── 점검 일지 상세 보기 ──────────────────────────────────── */
    function viewInsp(id) {
        const rec = Storage.getById(STORE, id);
        if (!rec) return;
        const g = _grade(rec.totalScore || 0);

        const tbody = (rec.checkItems || []).map(item => {
            const cc     = CAT_COLOR[item.cat] || '#94a3b8';
            const sv     = Number(item.score);
            const sColor = sv >= 4 ? '#22c55e' : sv === 3 ? '#f59e0b' : sv > 0 ? '#ef4444' : '#94a3b8';
            const sLabel = sv === 5 ? '5-우수' : sv === 4 ? '4-양호' : sv === 3 ? '3-보통'
                         : sv === 2 ? '2-미흡'  : sv === 1 ? '1-불량'  : 'N/A';
            return `<tr>
                <td><span style="font-size:0.68rem;padding:1px 5px;border-radius:3px;
                             background:${cc}22;color:${cc};font-weight:600;">${_esc(item.cat)}</span></td>
                <td style="font-weight:600;">${_esc(item.label)}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${_esc(item.desc)}</td>
                <td style="text-align:center;font-weight:700;color:${sColor};">${sLabel}</td>
                <td style="color:var(--text-muted);font-size:0.8rem;">${_esc(item.note || '-')}</td>
            </tr>`;
        }).join('');

        UIUtils.showModal(
            `3정5S 점검 일지 — ${_esc(rec.date)}`,
            `<div style="display:flex;gap:20px;flex-wrap:wrap;padding:14px 16px;
                        background:var(--bg-secondary);border-radius:8px;margin-bottom:16px;">
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">구역</div>
                    <div style="font-weight:700;">${_esc(rec.area || '-')}</div>
                </div>
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">점검자</div>
                    <div style="font-weight:700;">${_esc(rec.inspector || '-')}</div>
                </div>
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">종합점수</div>
                    <div style="font-size:1.6rem;font-weight:800;color:${g.color};line-height:1.1;">
                        ${rec.totalScore || 0}점
                    </div>
                </div>
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">등급</div>
                    <span style="background:${g.bg};color:${g.color};font-size:1.3rem;
                                 font-weight:800;padding:2px 14px;border-radius:6px;">${g.g}등급</span>
                </div>
            </div>
            <div class="data-table-wrapper">
            <table class="data-table" style="font-size:0.82rem;">
                <thead><tr>
                    <th>구분</th><th>항목</th><th>평가 기준</th><th>평가</th><th>특이사항</th>
                </tr></thead>
                <tbody>${tbody}</tbody>
            </table>
            </div>
            ${rec.summary ? `
            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-secondary);
                        border-radius:8px;font-size:0.85rem;">
                <strong>종합의견:</strong> ${_esc(rec.summary)}
            </div>` : ''}`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-outline"
                onclick="UIUtils.closeModal();FiveSModule.openInspModal('${_js(id)}')">수정</button>
             <button class="btn btn-primary"
                onclick="UIUtils.closeModal();FiveSModule.switchTab('issue');setTimeout(()=>FiveSModule.openIssueModal(null,'${_js(id)}'),100)">
                지적사항 등록
             </button>`,
            'xl'
        );
    }

    function removeInsp(id) {
        UIUtils.confirm('이 점검 일지를 삭제하시겠습니까?', async () => {
            await Storage.remove(STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _refreshStats();
            searchInsp();
        });
    }

    /* ══════════════════════════════════════════════════════════
       TAB 2 : 지적사항·시정조치
    ══════════════════════════════════════════════════════════ */
    function _renderIssueTab() {
        const actions = document.getElementById('s5Actions');
        if (actions) actions.innerHTML = `
            <button class="btn btn-primary" onclick="FiveSModule.openIssueModal()">
                <span class="material-symbols-outlined">add</span> 지적사항 등록
            </button>`;

        const now  = new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];

        document.getElementById('s5Content').innerHTML = `
        <div class="card"><div class="card-body">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;
                        padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:16px;">
                <select id="s5JStat" class="form-select" style="width:110px;">
                    <option value="">전체 상태</option>
                    <option value="미조치">미조치</option>
                    <option value="진행중">진행중</option>
                    <option value="완료">완료</option>
                </select>
                <select id="s5JArea" class="form-select" style="width:140px;">
                    <option value="">전체 구역</option>
                    ${AREAS.map(a => `<option>${_esc(a)}</option>`).join('')}
                </select>
                <input type="date" id="s5JFrom" class="form-input" style="width:130px;" value="${from}">
                <span style="color:var(--text-muted);">~</span>
                <input type="date" id="s5JTo"   class="form-input" style="width:130px;" value="${_today()}">
                <button class="btn btn-primary btn-sm" onclick="FiveSModule.searchIssues()">
                    <span class="material-symbols-outlined">search</span> 조회
                </button>
            </div>

            <!-- 미결 요약 배지 -->
            <div id="s5JBadge" style="margin-bottom:12px;"></div>
            <div id="s5JTable"></div>
        </div></div>`;
        searchIssues();
    }

    function searchIssues() {
        const stat = document.getElementById('s5JStat')?.value || '';
        const area = document.getElementById('s5JArea')?.value || '';
        const from = document.getElementById('s5JFrom')?.value || '';
        const to   = document.getElementById('s5JTo')?.value   || '';
        const el   = document.getElementById('s5JTable');
        const badge = document.getElementById('s5JBadge');
        if (!el) return;

        const today = _today();
        const all   = Storage.getAll(ISSUE_STORE) || [];
        const recs  = all
            .filter(r => (!stat || r.status === stat) && (!area || r.area === area)
                      && (!from || r.date >= from) && (!to || r.date <= to))
            .sort((a, b) => {
                const so = { '미조치': 0, '진행중': 1, '완료': 2 };
                const sd = (so[a.status] ?? 3) - (so[b.status] ?? 3);
                return sd !== 0 ? sd : (b.date || '').localeCompare(a.date || '');
            });

        // 요약 배지
        if (badge) {
            const open    = all.filter(r => r.status !== '완료').length;
            const overdue = all.filter(r => r.status !== '완료' && r.dueDate && r.dueDate < today).length;
            badge.innerHTML = open
                ? `<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:0.82rem;">
                    <span style="padding:4px 12px;background:rgba(239,68,68,0.1);color:var(--accent-red);
                                 border-radius:20px;font-weight:700;">
                        미결 ${open}건
                    </span>
                    ${overdue ? `<span style="padding:4px 12px;background:rgba(239,68,68,0.15);color:#dc2626;
                                       border-radius:20px;font-weight:700;">
                        기한초과 ⚠ ${overdue}건
                    </span>` : ''}
                   </div>`
                : '';
        }

        if (!recs.length) {
            el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);">
                <span class="material-symbols-outlined"
                    style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">check_circle</span>
                조회된 지적사항이 없습니다.
            </div>`;
            return;
        }

        const rows = recs.map((r, i) => {
            const isOD   = r.status !== '완료' && r.dueDate && r.dueDate < today;
            const sBg    = r.status === '완료' ? '#22c55e' : r.status === '진행중' ? '#f59e0b' : '#ef4444';
            const sevCol = r.severity === '중요' ? '#ef4444' : r.severity === '중' ? '#f59e0b' : '#94a3b8';
            return `<tr${isOD ? ' style="background:rgba(239,68,68,0.04);"' : ''}>
                <td style="text-align:center;color:var(--text-muted);">${i + 1}</td>
                <td style="font-weight:600;">${_esc(r.date || '-')}</td>
                <td>${_esc(r.area || '-')}</td>
                <td>
                    <span style="font-size:0.7rem;padding:1px 5px;border-radius:3px;
                                 background:${sevCol}22;color:${sevCol};font-weight:700;">${_esc(r.severity || '-')}</span>
                    <span style="margin-left:3px;font-size:0.8rem;">${_esc(r.category || '')}</span>
                </td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${_esc(r.content || '')}">${_esc(r.content || '-')}</td>
                <td>${_esc(r.assignee || '-')}</td>
                <td style="${isOD ? 'color:var(--accent-red);font-weight:700;' : ''}">
                    ${_esc(r.dueDate || '-')}${isOD ? ' ⚠' : ''}
                </td>
                <td>
                    <span style="background:${sBg}22;color:${sBg};font-weight:700;
                                 padding:2px 8px;border-radius:4px;font-size:0.78rem;">${_esc(r.status || '-')}</span>
                </td>
                <td>
                    <div style="display:flex;gap:3px;">
                        <button class="btn btn-sm btn-outline"
                            onclick="FiveSModule.openIssueModal('${_js(r.id)}')">수정</button>
                        ${r.status !== '완료'
                            ? `<button class="btn btn-sm btn-primary"
                                onclick="FiveSModule.completeIssue('${_js(r.id)}')">완료</button>`
                            : ''}
                        <button class="btn btn-sm btn-danger"
                            onclick="FiveSModule.removeIssue('${_js(r.id)}')">삭제</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        <div class="data-table-wrapper">
        <table class="data-table" style="font-size:0.81rem;">
            <thead><tr>
                <th style="width:36px;">No</th><th>발생일</th><th>구역</th><th>분류</th>
                <th>지적내용</th><th>담당자</th><th>완료기한</th><th>상태</th>
                <th style="width:148px;">작업</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    /* ── 지적사항 등록 / 수정 모달 ───────────────────────────── */
    function openIssueModal(id, inspectionId) {
        const rec  = id ? Storage.getById(ISSUE_STORE, id) : null;
        const due7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })();

        UIUtils.showModal(
            rec ? '지적사항 수정' : '지적사항 등록',
            `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">발생일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="s5JDate" value="${rec?.date || _today()}">
                </div>
                <div class="form-group">
                    <label class="form-label">구역 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="s5JAreaSel">
                        ${AREAS.map(a => `<option ${rec?.area === a ? 'selected' : ''}>${_esc(a)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">항목 분류</label>
                    <select class="form-select" id="s5JCat">
                        ${['3정', '정리', '정돈', '청소', '청결', '생활화', '안전관리', '표준작업', '기타']
                            .map(c => `<option ${rec?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">지적 내용 <span style="color:var(--accent-red)">*</span></label>
                <textarea class="form-textarea" id="s5JContent" rows="2"
                    placeholder="구체적인 지적 내용을 입력하세요">${_esc(rec?.content || '')}</textarea>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">중요도</label>
                    <select class="form-select" id="s5JSev">
                        ${['경', '중', '중요'].map(s => `<option ${(rec?.severity || '중') === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">담당자</label>
                    <input type="text" class="form-input" id="s5JAssignee"
                           value="${_esc(rec?.assignee || '')}" placeholder="담당자명">
                </div>
                <div class="form-group">
                    <label class="form-label">완료 기한</label>
                    <input type="date" class="form-input" id="s5JDue"
                           value="${rec?.dueDate || due7}">
                </div>
                <div class="form-group">
                    <label class="form-label">상태</label>
                    <select class="form-select" id="s5JStat2">
                        ${['미조치', '진행중', '완료'].map(s =>
                            `<option ${(rec?.status || '미조치') === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">시정조치 내용</label>
                <textarea class="form-textarea" id="s5JAction" rows="2"
                    placeholder="조치한 내용 입력 (완료 처리 시 필수)">${_esc(rec?.actionTaken || '')}</textarea>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary"
                onclick="FiveSModule.saveIssue(${id ? `'${_js(id)}'` : 'null'},${inspectionId ? `'${_js(inspectionId)}'` : 'null'})">
                저장
             </button>`,
            'lg'
        );
    }

    async function saveIssue(id, inspectionId) {
        const date    = document.getElementById('s5JDate')?.value;
        const content = document.getElementById('s5JContent')?.value.trim();
        if (!date || !content) {
            UIUtils.toast('발생일과 지적내용은 필수입니다.', 'warning');
            return;
        }
        const status = document.getElementById('s5JStat2')?.value || '미조치';
        const prevRec = id ? (Storage.getById(ISSUE_STORE, id) || {}) : {};
        const data = {
            date,
            area:         document.getElementById('s5JAreaSel')?.value       || '',
            category:     document.getElementById('s5JCat')?.value            || '',
            content,
            severity:     document.getElementById('s5JSev')?.value            || '중',
            assignee:     document.getElementById('s5JAssignee')?.value.trim()|| '',
            dueDate:      document.getElementById('s5JDue')?.value            || '',
            status,
            actionTaken:  document.getElementById('s5JAction')?.value.trim() || '',
            completedDate: status === '완료'
                ? (prevRec.completedDate || _today())
                : '',
            inspectionId: inspectionId || prevRec.inspectionId || null
        };

        if (id) {
            await Storage.update(ISSUE_STORE, id, { ...prevRec, ...data });
            UIUtils.toast('수정되었습니다.', 'success');
        } else {
            await Storage.add(ISSUE_STORE, data);
            UIUtils.toast('지적사항이 등록되었습니다.', 'success');
        }
        UIUtils.closeModal();
        _refreshStats();
        searchIssues();
    }

    function completeIssue(id) {
        openIssueModal(id);
        setTimeout(() => {
            const sel = document.getElementById('s5JStat2');
            if (sel) sel.value = '완료';
        }, 150);
    }

    function removeIssue(id) {
        UIUtils.confirm('이 지적사항을 삭제하시겠습니까?', async () => {
            await Storage.remove(ISSUE_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _refreshStats();
            searchIssues();
        });
    }

    /* ══════════════════════════════════════════════════════════
       TAB 3 : 점검 계획·업무분담
    ══════════════════════════════════════════════════════════ */
    async function _renderPlanTab() {
        const actions = document.getElementById('s5Actions');
        if (actions) actions.innerHTML = `
            <button class="btn btn-primary" onclick="FiveSModule.savePlan()">
                <span class="material-symbols-outlined">save</span> 계획 저장
            </button>`;

        const el = document.getElementById('s5Content');
        el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);">로딩 중...</div>`;

        const saved = await Storage.getConfigValue('s5_plan');
        const assignments = saved?.assignments
            || AREAS.map(a => ({ area: a, assignee: '', cycle: '주간', day: '월요일' }));

        const aRows = assignments.map((a, idx) => `
        <tr>
            <td style="font-weight:600;font-size:0.85rem;">${_esc(a.area)}</td>
            <td>
                <input type="text" class="form-input plan-assignee" data-idx="${idx}"
                       value="${_esc(a.assignee || '')}" placeholder="담당자명"
                       style="width:110px;font-size:0.82rem;">
            </td>
            <td>
                <select class="form-select plan-cycle" data-idx="${idx}" style="width:80px;font-size:0.82rem;">
                    ${['주간', '격주', '월간'].map(c => `<option ${a.cycle === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="form-select plan-day" data-idx="${idx}" style="width:90px;font-size:0.82rem;">
                    ${['월요일', '화요일', '수요일', '목요일', '금요일'].map(d =>
                        `<option ${a.day === d ? 'selected' : ''}>${d}</option>`
                    ).join('')}
                </select>
            </td>
        </tr>`).join('');

        const upcoming    = _calcUpcoming(assignments);
        const today       = _today();
        const allInsp     = Storage.getAll(STORE) || [];
        const upcomingRows = upcoming.length
            ? upcoming.map(n => {
                const done   = allInsp.some(i => i.date === n.date && i.area === n.area);
                const missed = !done && n.date < today;
                return `<tr>
                    <td style="${!done && n.date <= today ? 'color:var(--accent-orange);font-weight:700;' : ''}">
                        ${n.date}
                    </td>
                    <td>${_esc(n.area)}</td>
                    <td>${_esc(n.assignee || '-')}</td>
                    <td>${done   ? '<span style="color:#22c55e;font-weight:700;">✓ 완료</span>'
                           : missed ? '<span style="color:var(--accent-red);font-weight:700;">⚠ 미실시</span>'
                           : '<span style="color:var(--text-muted);">예정</span>'}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">
                담당자와 주기를 설정하면 일정이 표시됩니다.
               </td></tr>`;

        const steps = [
            { icon: 'assignment',     title: '① 계획 수립',   desc: '구역별 담당자 지정, 점검 주기 설정' },
            { icon: 'checklist',      title: '② 현장 점검',   desc: '체크시트에 따라 3정·5행 항목별 평가' },
            { icon: 'report_problem', title: '③ 지적사항 등록', desc: '미흡 항목 즉시 등록, 담당자·기한 지정' },
            { icon: 'task_alt',       title: '④ 시정완료 확인', desc: '기한 내 조치 후 결과 입력·이행 확인' },
        ];

        el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
            <div class="card">
                <div class="card-body">
                    <h4 style="margin:0 0 14px;font-size:0.92rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">group</span>
                        구역별 담당자 &amp; 점검 주기
                    </h4>
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead><tr>
                            <th>구역</th><th>담당자</th><th>점검주기</th><th>기준 요일</th>
                        </tr></thead>
                        <tbody>${aRows}</tbody>
                    </table>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:10px 0 0;">
                        담당자를 입력하고 <strong>계획 저장</strong> 버튼을 눌러 저장하세요.
                    </p>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h4 style="margin:0 0 14px;font-size:0.92rem;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="font-size:1rem;color:var(--accent-blue);">event_upcoming</span>
                        점검 예정 일정 (향후 4주)
                    </h4>
                    <table class="data-table" style="font-size:0.82rem;">
                        <thead><tr>
                            <th>예정일</th><th>구역</th><th>담당자</th><th>상태</th>
                        </tr></thead>
                        <tbody>${upcomingRows}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:20px;">
            <div class="card-body">
                <h4 style="margin:0 0 14px;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:1rem;">route</span>
                    3정5S 관리 프로세스
                </h4>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                    ${steps.map(s => `
                    <div style="padding:16px;background:var(--bg-secondary);border-radius:8px;
                                border:1px solid var(--border-color);">
                        <span class="material-symbols-outlined"
                              style="color:var(--accent-blue);font-size:1.4rem;">${s.icon}</span>
                        <div style="font-weight:700;font-size:0.85rem;margin:8px 0 4px;">${s.title}</div>
                        <div style="font-size:0.78rem;color:var(--text-muted);">${s.desc}</div>
                    </div>`).join('')}
                </div>
            </div>
        </div>`;
    }

    /* ── 향후 점검 예정일 계산 ─────────────────────────────────── */
    function _calcUpcoming(assignments) {
        const results  = [];
        const today    = new Date();
        const ms1day   = 24 * 3600 * 1000;
        const dayMap   = { '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5 };

        assignments.forEach(a => {
            if (!a.assignee) return;
            const targetDay = dayMap[a.day] ?? 1;

            for (let w = -1; w <= 4; w++) {
                if (a.cycle === '격주' && ((w + 10) % 2 !== 0)) continue;
                if (a.cycle === '월간' && w !== 0) continue;

                const base = new Date(today.getTime() + w * 7 * ms1day);
                const diff = (targetDay - base.getDay() + 7) % 7;
                const date = new Date(base.getTime() + diff * ms1day);
                const dateStr = date.toISOString().split('T')[0];
                if (!results.find(r => r.date === dateStr && r.area === a.area)) {
                    results.push({ date: dateStr, area: a.area, assignee: a.assignee });
                }
            }
        });

        const fromDate  = new Date(today.getTime() - 7 * ms1day).toISOString().split('T')[0];
        const untilDate = new Date(today.getTime() + 28 * ms1day).toISOString().split('T')[0];

        return results
            .filter(r => r.date >= fromDate && r.date <= untilDate)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 28);
    }

    async function savePlan() {
        const assignments = AREAS.map((area, idx) => {
            const rows = document.querySelectorAll('#s5Content tbody tr');
            const row  = rows[idx];
            if (!row) return { area, assignee: '', cycle: '주간', day: '월요일' };
            return {
                area,
                assignee: row.querySelector('.plan-assignee')?.value.trim() || '',
                cycle:    row.querySelector('.plan-cycle')?.value            || '주간',
                day:      row.querySelector('.plan-day')?.value              || '월요일'
            };
        });
        await Storage.setConfigValue('s5_plan', { assignments });
        UIUtils.toast('점검 계획이 저장되었습니다.', 'success');
        _renderPlanTab();
    }

    /* ══════════════════════════════════════════════════════════
       PUBLIC API
    ══════════════════════════════════════════════════════════ */
    return {
        init:   render,
        render,
        switchTab,
        searchInsp,
        searchIssues,
        openInspModal,
        _calcPreview,
        saveInsp,
        viewInsp,
        removeInsp,
        openIssueModal,
        saveIssue,
        completeIssue,
        removeIssue,
        savePlan
    };
})();

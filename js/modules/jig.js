/**
 * JIG 수명 관리 모듈
 * - 도장 공정 제품만 JIG 등록 대상으로 표시
 * - 제품 정보의 도장-A / 도장-B 공정으로 라인 자동 구분
 * - 색상/품명 변형이 같은 JIG를 쓰는 경우 partAliases로 병합 관리
 */
var JigModule = (function () {
    const STORE = DB.STORES.JIG_MASTER;
    const LOG_STORE = DB.STORES.JIG_LOG;
    const A_LINE_CYCLE = 1092;
    const B_LINE_CYCLE = 175;

    let _currentLine = '';
    let _batchMergeRows = [];

    const _today = () => (UIUtils.today ? UIUtils.today() : new Date().toISOString().split('T')[0]);
    const _monthAgo = () => {
        if (UIUtils.monthAgo) return UIUtils.monthAgo();
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    };
    const _fmt = n => (UIUtils.formatNumber ? UIUtils.formatNumber(n) : Number(n || 0).toLocaleString('ko-KR'));
    const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _js = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up jig-page">
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-outline" onclick="Router.navigate('jig-layout')"
                        title="공장 JIG 배치 레이아웃을 시각적으로 편집합니다.">
                        <span class="material-symbols-outlined">map</span> 레이아웃
                    </button>
                    <button class="btn btn-outline" onclick="JigModule.syncFromPaintingWork()"
                        title="도장 작업 실적의 SPINDLE 수로 JIG 사용 횟수를 자동 계산합니다.">
                        <span class="material-symbols-outlined">sync</span> 도장 실적 동기화
                    </button>
                    <button class="btn btn-secondary" onclick="JigModule.openAddModal()">
                        <span class="material-symbols-outlined">add</span> 단건 등록
                    </button>
                    <button class="btn btn-primary" onclick="JigModule.openBatchRegisterModal()">
                        <span class="material-symbols-outlined">table_rows</span> 전품목 일괄 등록
                    </button>
                </div>
            </div>

            <div class="stat-cards" id="jigStats"></div>

            <div class="jig-line-tabs">
                <button id="jigTabAll" class="btn btn-primary btn-sm" onclick="JigModule.filterLine('')">전체</button>
                <button id="jigTabA" class="btn btn-outline btn-sm" onclick="JigModule.filterLine('A라인')">A라인</button>
                <button id="jigTabB" class="btn btn-outline btn-sm" onclick="JigModule.filterLine('B라인')">B라인</button>
            </div>

            <div id="jigBlocks"></div>

            <div class="card" style="margin-top:20px;">
                <div class="card-body">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;">사용 이력</h4>
                        <button class="btn btn-outline btn-sm" onclick="JigModule.openAddLogModal()">
                            <span class="material-symbols-outlined">add</span> 사용 등록
                        </button>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:12px;">
                        <input type="date" id="jigLogStart" class="form-input" style="width:130px;" value="${_monthAgo()}">
                        <span style="color:var(--text-muted);font-size:0.85rem;">~</span>
                        <input type="date" id="jigLogEnd" class="form-input" style="width:130px;" value="${_today()}">
                        <select id="jigLogCarFilter" class="form-select" style="width:120px;" onchange="JigModule.onLogCarChange()">
                            <option value="">전체 차종</option>
                        </select>
                        <select id="jigLogPartFilter" class="form-select" style="width:180px;">
                            <option value="">전체 품목</option>
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="JigModule.renderLog()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="JigModule.resetLogFilter()">초기화</button>
                    </div>
                    <div id="jigLogTable"></div>
                </div>
            </div>
        </div>`;

        _currentLine = '';
        loadAll();
    }

    function _lineFromProcessValue(value) {
        const s = String(value || '').replace(/\s+/g, '').toUpperCase();
        if (!s) return null;
        if ((s.includes('도장') || s.includes('PAINT')) && s.includes('B')) return 'B라인';
        if ((s.includes('도장') || s.includes('PAINT')) && s.includes('A')) return 'A라인';
        if (s === 'A라인' || s === 'ALINE' || s === 'A-LINE') return 'A라인';
        if (s === 'B라인' || s === 'BLINE' || s === 'B-LINE') return 'B라인';
        return null;
    }

    function _getProductPaintingLines(product) {
        const lines = [];
        ['process1', 'process2', 'process3', 'process4'].forEach(key => {
            const line = _lineFromProcessValue(product && product[key]);
            if (line && !lines.includes(line)) lines.push(line);
        });
        return lines;
    }

    function _jigPartNames(jig) {
        return [jig && jig.partName, ...((jig && jig.partAliases) || [])]
            .map(v => String(v || '').trim())
            .filter(Boolean);
    }

    function _jigMatchesPart(jig, partName) {
        const target = String(partName || '').trim();
        return !!target && _jigPartNames(jig).includes(target);
    }

    function _findJigForProduct(jigs, carModel, partName, line) {
        return (jigs || []).find(j =>
            j.carModel === carModel && j.line === line && _jigMatchesPart(j, partName)
        );
    }

    function _lifePct(j) {
        const max = Number(j.maxCount) || 0;
        return max ? ((Number(j.usedCount) || 0) / max) * 100 : 0;
    }

    function _enrichedJigs() {
        const jigs = Storage.getAll(STORE) || [];
        const logs = Storage.getAll(LOG_STORE) || [];
        const countMap = {};
        const lastResetMap = {};
        logs.forEach(log => {
            if (!countMap[log.jigId]) countMap[log.jigId] = 0;
            countMap[log.jigId] += Number(log.useCount) || 0;
            if (log.workType === '교체' && (!lastResetMap[log.jigId] || log.date > lastResetMap[log.jigId])) {
                lastResetMap[log.jigId] = log.date;
            }
        });
        return jigs.map(j => ({
            ...j,
            usedCount: countMap[j.id] || 0,
            lastResetDate: lastResetMap[j.id] || null
        }));
    }

    function loadAll() {
        const enriched = _enrichedJigs();
        renderStats(enriched);
        renderBlocks(_currentLine ? enriched.filter(j => j.line === _currentLine) : enriched);
        _populateLogFilter(Storage.getAll(STORE) || []);
        renderLog();
    }

    function filterLine(line) {
        _currentLine = line;
        ['All', 'A', 'B'].forEach(t => {
            const target = t === 'All' ? '' : `${t}라인`;
            const btn = document.getElementById('jigTab' + t);
            if (btn) btn.className = 'btn btn-sm ' + (line === target ? 'btn-primary' : 'btn-outline');
        });
        const enriched = _enrichedJigs();
        renderBlocks(line ? enriched.filter(j => j.line === line) : enriched);
    }

    function renderStats(jigs) {
        const el = document.getElementById('jigStats');
        if (!el) return;
        const total = jigs.length;
        const warning = jigs.filter(j => _lifePct(j) >= 80 && _lifePct(j) < 100).length;
        const exceeded = jigs.filter(j => _lifePct(j) >= 100).length;
        const normal = total - warning - exceeded;
        el.innerHTML = `
            <div class="stat-card blue"><div class="stat-card-value">${total}</div><div class="stat-card-label">전체 JIG</div></div>
            <div class="stat-card green"><div class="stat-card-value">${normal}</div><div class="stat-card-label">정상</div></div>
            <div class="stat-card orange"><div class="stat-card-value">${warning}</div><div class="stat-card-label">수명 임박 (80%)</div></div>
            <div class="stat-card red"><div class="stat-card-value">${exceeded}</div><div class="stat-card-label">수명 초과</div></div>`;
    }

    function renderBlocks(jigs) {
        const el = document.getElementById('jigBlocks');
        if (!el) return;
        if (!jigs.length) {
            el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">build</span>
                등록된 JIG가 없습니다. 전품목 일괄 등록으로 도장 JIG를 등록하세요.
            </div>`;
            return;
        }

        const groups = {};
        jigs.forEach(j => {
            const car = j.carModel || '차종 미지정';
            if (!groups[car]) groups[car] = [];
            groups[car].push(j);
        });

        const thStyle = 'padding:6px 10px;text-align:center;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:2px solid var(--border-color);white-space:nowrap;overflow:hidden;';
        const colgroup = `<colgroup>
            <col style="width:5%">
            <col style="width:19%">
            <col style="width:3%">
            <col style="width:3%">
            <col style="width:3%">
            <col style="width:43%">
            <col style="width:10%">
            <col style="width:6%">
            <col style="width:4%">
            <col style="width:4%">
        </colgroup>`;

        const sorted = jigs.slice().sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko') ||
            (a.line || '').localeCompare(b.line || '')
        );

        let prevCar = null;
        const rows = sorted.map(j => {
            const pct = Math.min(100, _lifePct(j));
            const barColor = pct >= 100 ? 'var(--accent-red)' : pct >= 80 ? 'var(--accent-orange)' : 'var(--accent-green)';
            const status = pct >= 100 ? ['수명초과', 'var(--accent-red)'] : pct >= 80 ? ['임박', 'var(--accent-orange)'] : ['정상', 'var(--accent-green)'];
            const aliases = (j.partAliases || []).filter(p => p !== j.partName);
            const car = j.carModel || '차종 미지정';
            const td  = 'padding:7px 10px;border-bottom:1px solid var(--border-color);font-size:0.82rem;overflow:hidden;';
            const tdn = td + 'white-space:nowrap;text-overflow:ellipsis;';
            const isNewCar = car !== prevCar;
            prevCar = car;
            const carCell = isNewCar
                ? `<td style="${tdn}text-align:center;font-weight:700;color:var(--accent-blue);border-top:${isNewCar && sorted.indexOf(j) > 0 ? '2px solid var(--border-color)' : 'none'};">${_esc(car)}</td>`
                : `<td style="${td}text-align:center;color:var(--text-muted);font-size:0.75rem;"></td>`;
            return `
            <tr${isNewCar && sorted.indexOf(j) > 0 ? ' style="border-top:2px solid var(--border-color);"' : ''}>
                ${carCell}
                <td style="${td}text-align:center;font-weight:600;word-break:break-word;">
                    ${_esc(j.partName || '-')}
                    ${aliases.length ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">병합: ${aliases.map(_esc).join(', ')}</div>` : ''}
                </td>
                <td style="${tdn}text-align:center;"><span style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:4px;font-size:0.68rem;">${_esc(j.line || '-')}</span></td>
                <td style="${tdn}text-align:center;">${j.maxCount ? _fmt(j.maxCount) : '-'}</td>
                <td style="${tdn}text-align:center;color:var(--accent-blue);font-weight:700;">${_fmt(j.usedCount || 0)}</td>
                <td style="${td}">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="flex:1;background:var(--bg-secondary);border-radius:4px;height:7px;overflow:hidden;min-width:0;">
                            <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px;"></div>
                        </div>
                        <span style="font-size:0.75rem;font-weight:700;color:${barColor};flex-shrink:0;">${pct.toFixed(0)}%</span>
                    </div>
                </td>
                <td style="${tdn}text-align:center;color:var(--text-muted);">${j.lastResetDate || j.registDate || '-'}</td>
                <td style="${tdn}text-align:center;"><span style="background:${status[1]};color:#fff;padding:1px 7px;border-radius:4px;font-size:0.68rem;">${status[0]}</span></td>
                <td style="${td}text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="JigModule.openEditModal('${_js(j.id)}')" style="padding:2px 8px;font-size:0.78rem;">조회/입력</button>
                </td>
                <td style="${td}text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="JigModule.resetCount('${_js(j.id)}')" style="padding:2px 8px;font-size:0.78rem;" title="교체 초기화">
                        조치
                    </button>
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        <div class="jig-block">
            <div class="jig-table-scroll">
            <table class="jig-life-table" style="width:100%;min-width:760px;border-collapse:collapse;background:var(--bg-primary);table-layout:fixed;">
                ${colgroup}
                <thead><tr style="background:var(--bg-secondary);">
                    <th style="${thStyle}">차종</th>
                    <th style="${thStyle}">제품명</th>
                    <th style="${thStyle}">라인</th>
                    <th style="${thStyle}">수명횟수</th>
                    <th style="${thStyle}">누적횟수</th>
                    <th style="${thStyle}">수명진행률</th>
                    <th style="${thStyle}">이전교체일</th>
                    <th style="${thStyle}">상태</th>
                    <th style="${thStyle}">정보</th>
                    <th style="${thStyle}">수명조치</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        </div>`;
    }

    function _populateLogFilter(jigs) {
        const carSel = document.getElementById('jigLogCarFilter');
        const partSel = document.getElementById('jigLogPartFilter');
        if (!carSel || !partSel) return;
        const curCar = carSel.value || '';
        const curPart = partSel.value || '';
        const cars = [...new Set(jigs.map(j => j.carModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        carSel.innerHTML = `<option value="">전체 차종</option>` + cars.map(c => `<option value="${_esc(c)}" ${c === curCar ? 'selected' : ''}>${_esc(c)}</option>`).join('');
        const parts = [...new Set(jigs.filter(j => !curCar || j.carModel === curCar).flatMap(_jigPartNames))].sort((a, b) => a.localeCompare(b, 'ko'));
        partSel.innerHTML = `<option value="">전체 품목</option>` + parts.map(p => `<option value="${_esc(p)}" ${p === curPart ? 'selected' : ''}>${_esc(p)}</option>`).join('');
    }

    function onLogCarChange() {
        _populateLogFilter(Storage.getAll(STORE) || []);
    }

    function resetLogFilter() {
        const s = document.getElementById('jigLogStart');
        const e = document.getElementById('jigLogEnd');
        const c = document.getElementById('jigLogCarFilter');
        const p = document.getElementById('jigLogPartFilter');
        if (s) s.value = _monthAgo();
        if (e) e.value = _today();
        if (c) c.value = '';
        if (p) p.value = '';
        _populateLogFilter(Storage.getAll(STORE) || []);
        renderLog();
    }

    function renderLog() {
        const el = document.getElementById('jigLogTable');
        if (!el) return;
        const start = document.getElementById('jigLogStart')?.value || '';
        const end = document.getElementById('jigLogEnd')?.value || '';
        const carFilter = document.getElementById('jigLogCarFilter')?.value || '';
        const partFilter = document.getElementById('jigLogPartFilter')?.value || '';
        const jigs = Storage.getAll(STORE) || [];
        const jigMap = {};
        jigs.forEach(j => { jigMap[j.id] = j; });
        let logs = Storage.getAll(LOG_STORE) || [];
        logs = logs.filter(l => {
            if (start && l.date < start) return false;
            if (end && l.date > end) return false;
            const jig = jigMap[l.jigId];
            if (carFilter && (jig?.carModel || '') !== carFilter) return false;
            if (partFilter && !_jigMatchesPart(jig, partFilter)) return false;
            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!logs.length) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:16px 0;text-align:center;">조회된 이력이 없습니다.</p>`;
            return;
        }

        const table = rows => `
        <div class="data-table-wrapper jig-log-table-wrap">
        <table class="data-table" style="width:100%;font-size:0.8rem;">
            <thead><tr>
                <th>일자</th><th>차종</th><th>품명</th><th>내용</th><th>횟수</th><th>비고</th><th>작업</th>
            </tr></thead>
            <tbody>${rows.map(l => {
                const jig = jigMap[l.jigId] || {};
                return `<tr>
                    <td>${_esc(l.date || '-')}</td>
                    <td>${_esc(jig.carModel || '-')}</td>
                    <td>${_esc(jig.partName || '-')}</td>
                    <td>${_esc(l.workType || '-')}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${_fmt(l.useCount || 0)}</td>
                    <td style="color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(l.note || '')}">${_esc(l.note || '')}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="JigModule.removeLog('${_js(l.id)}')" style="padding:2px 8px;">삭제</button></td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>`;

        const aLogs = logs.filter(l => (jigMap[l.jigId]?.line || '') === 'A라인');
        const bLogs = logs.filter(l => (jigMap[l.jigId]?.line || '') === 'B라인');
        const etcLogs = logs.filter(l => !['A라인', 'B라인'].includes(jigMap[l.jigId]?.line || ''));
        el.innerHTML = `
            <div class="jig-log-grid">
                <div>${aLogs.length ? `<h5 style="margin:0 0 6px;">A라인 (${aLogs.length}건)</h5>${table(aLogs)}` : ''}</div>
                <div>${bLogs.length ? `<h5 style="margin:0 0 6px;">B라인 (${bLogs.length}건)</h5>${table(bLogs)}` : ''}</div>
            </div>
            ${etcLogs.length ? `<div style="margin-top:12px;"><h5 style="margin:0 0 6px;">기타 (${etcLogs.length}건)</h5>${table(etcLogs)}</div>` : ''}`;
    }

    function openBatchRegisterModal() {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const jigs = Storage.getAll(STORE) || [];
        if (!products.length) {
            UIUtils.toast('등록된 제품이 없습니다. 관리/설정 > 제품 정보에서 먼저 등록하세요.', 'warning');
            return;
        }

        const jigMap = {};
        jigs.forEach(j => {
            _jigPartNames(j).forEach(part => {
                const key = `${j.carModel}||${part}`;
                if (!jigMap[key]) jigMap[key] = {};
                jigMap[key][j.line || ''] = j;
            });
        });

        const groups = {};
        let excluded = 0;
        products.forEach(p => {
            if (!p.partName) return;
            if (_getProductPaintingLines(p).length === 0) {
                excluded++;
                return;
            }
            const car = p.carModel || '미지정';
            if (!groups[car]) groups[car] = [];
            if (!groups[car].find(x => x.partName === p.partName)) groups[car].push(p);
        });

        const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'ko'));
        let rowIndex = 0;
        const carFilterOptions = groupEntries.map(([car, prods]) => `<option value="${_esc(car)}">${_esc(car)} (${prods.length})</option>`).join('');
        const hiddenRegistered = [];
        const groupHtmls = groupEntries.map(([car, prods]) => {
            const items = prods.sort((a, b) => (a.partName || '').localeCompare(b.partName || '', 'ko'));
            const cells = items.flatMap(p => {
                const key = `${car}||${p.partName}`;
                return _getProductPaintingLines(p).map(line => {
                    const existing = (jigMap[key] || {})[line];
                    if (existing && Number(existing.maxCount) > 0) {
                        hiddenRegistered.push({ id: existing.id, car, partName: p.partName, line, maxCount: existing.maxCount });
                        return '';
                    }
                    const ri = rowIndex++;
                    return `
                    <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;padding:10px 12px;display:grid;grid-template-columns:28px minmax(180px,1fr) 90px minmax(180px,260px);gap:12px;align-items:center;">
                        <input type="checkbox" data-merge-ri="${ri}" title="병합 선택">
                        <div>
                            <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${_esc(p.partName)}</div>
                            <div style="font-size:0.72rem;color:var(--text-muted);">${_esc(car)}</div>
                        </div>
                        <div style="text-align:center;"><span style="background:var(--accent-blue);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${line}</span></div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <input type="hidden" data-ri="${ri}" data-field="carModel" value="${_esc(car)}">
                            <input type="hidden" data-ri="${ri}" data-field="partName" value="${_esc(p.partName)}">
                            <input type="hidden" data-ri="${ri}" data-field="line" value="${line}">
                            <input type="hidden" data-ri="${ri}" data-field="id" value="${existing ? _esc(existing.id) : ''}">
                            <input type="number" class="form-input" data-ri="${ri}" data-field="maxCount" value="${existing ? (existing.maxCount || '') : ''}" placeholder="수명 횟수" min="0" style="flex:1;font-size:0.82rem;text-align:right;">
                            <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">회</span>
                        </div>
                    </div>`;
                });
            });
            if (!cells.join('').trim()) return '';
            return `
            <div class="jig-batch-car-group" data-car="${_esc(car)}" style="margin-bottom:14px;">
                <div style="font-size:0.82rem;font-weight:700;color:var(--accent-blue);padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:6px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.18);border-radius:8px;">
                    <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>${_esc(car)}
                    <span style="font-weight:400;color:var(--text-muted);">(${items.length}개 품목)</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr;gap:8px;">${cells.join('')}</div>
            </div>`;
        }).join('');

        const hiddenHtml = hiddenRegistered.length ? `
            <details style="margin-top:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);">
                <summary style="cursor:pointer;padding:10px 12px;font-size:0.82rem;font-weight:700;color:var(--text-secondary);">
                    등록 완료 항목 ${hiddenRegistered.length}건
                </summary>
                <div style="max-height:220px;overflow:auto;border-top:1px solid var(--border-color);">
                    <table class="data-table" style="width:100%;font-size:0.78rem;">
                        <thead><tr><th>차종</th><th>품명</th><th>라인</th><th style="text-align:right;">수명 횟수</th><th style="width:80px;text-align:center;">저장</th></tr></thead>
                        <tbody>
                            ${hiddenRegistered.map(r => `
                                <tr>
                                    <td>${_esc(r.car)}</td>
                                    <td>${_esc(r.partName)}</td>
                                    <td>${_esc(r.line)}</td>
                                    <td style="text-align:right;">
                                        <input type="number" class="form-input" id="batchDoneMax_${_esc(r.id)}" value="${r.maxCount}" min="1" style="width:120px;text-align:right;display:inline-block;">
                                    </td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm btn-outline" onclick="JigModule.updateRegisteredMaxCount('${_js(r.id)}')">저장</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </details>` : '';

        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;">table_rows</span> 전품목 JIG 일괄 등록',
            `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,0.06);border-radius:6px;border-left:3px solid var(--accent-blue);">
                제품 정보의 제조공정(도장-A/도장-B)을 기준으로 해당 라인만 표시됩니다. 수명 횟수를 입력한 항목만 저장됩니다.
                ${excluded ? `<br><span>도장 공정이 없는 사출품 ${excluded}건은 목록에서 제외했습니다.</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                <label style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);">차종 필터</label>
                <select class="form-select" id="batchJigCarFilter" style="width:220px;" onchange="JigModule.filterBatchCar(this.value)">
                    <option value="">전체 차종</option>${carFilterOptions}
                </select>
                <button type="button" class="btn btn-sm btn-outline" onclick="document.getElementById('batchJigCarFilter').value=''; JigModule.filterBatchCar('');">전체 보기</button>
                <button type="button" class="btn btn-sm btn-primary" onclick="JigModule.openBatchMergeModal()">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">merge_type</span> 선택 병합
                </button>
            </div>
            <div id="batchJigForm" style="max-height:60vh;overflow-y:auto;padding-right:4px;">${groupHtmls || '<p style="padding:20px;color:var(--text-muted);">새로 등록할 도장 JIG 항목이 없습니다.</p>'}</div>
            ${hiddenHtml}`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="JigModule.saveBatch()">
                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">save</span> 일괄 저장
             </button>`,
            'xl'
        );
    }

    function filterBatchCar(carModel) {
        document.querySelectorAll('#batchJigForm .jig-batch-car-group').forEach(group => {
            group.style.display = (!carModel || group.dataset.car === carModel) ? '' : 'none';
        });
    }

    function _refreshBatchRegisterModal(fromNestedModal) {
        UIUtils.closeModal();
        setTimeout(() => {
            if (fromNestedModal) UIUtils.closeModal();
            openBatchRegisterModal();
            loadAll();
        }, 0);
    }

    function _collectBatchRowsFromForm() {
        const rows = {};
        const form = document.getElementById('batchJigForm');
        if (!form) return rows;
        form.querySelectorAll('[data-ri]').forEach(el => {
            const ri = el.dataset.ri;
            if (!rows[ri]) rows[ri] = {};
            rows[ri][el.dataset.field] = el.value;
        });
        return rows;
    }

    async function updateRegisteredMaxCount(id) {
        const input = document.getElementById('batchDoneMax_' + id);
        const maxCount = parseInt(input && input.value || 0);
        if (!maxCount) {
            UIUtils.toast('수명 횟수를 입력하세요.', 'warning');
            return;
        }
        const jig = Storage.getById(STORE, id);
        if (!jig) {
            UIUtils.toast('JIG 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        await Storage.update(STORE, id, { ...jig, maxCount, updatedAt: new Date().toISOString() });
        UIUtils.toast('수명 횟수가 수정되었습니다.', 'success');
        _refreshBatchRegisterModal(false);
    }

    function openBatchMergeModal() {
        const rows = _collectBatchRowsFromForm();
        const selected = Array.from(document.querySelectorAll('#batchJigForm [data-merge-ri]:checked'))
            .map(chk => rows[chk.dataset.mergeRi])
            .filter(Boolean);
        if (selected.length < 2) {
            UIUtils.toast('병합할 품목을 2개 이상 선택하세요.', 'warning');
            return;
        }
        const carSet = [...new Set(selected.map(r => r.carModel))];
        const lineSet = [...new Set(selected.map(r => r.line))];
        if (carSet.length > 1 || lineSet.length > 1) {
            UIUtils.toast('병합은 같은 차종, 같은 라인끼리만 가능합니다.', 'warning');
            return;
        }
        _batchMergeRows = selected;
        const maxCount = selected.map(r => parseInt(r.maxCount || 0)).find(Boolean) || '';
        const defaultName = selected[0].partName || '';
        UIUtils.showModal(
            'JIG 품목 병합',
            `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                선택한 품목들은 하나의 JIG 수명으로 누적됩니다. 도장 실적 동기화 시 아래 모든 품명이 같은 JIG로 연결됩니다.
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">차종</label><input class="form-input" value="${_esc(carSet[0])}" disabled></div>
                <div class="form-group"><label class="form-label">라인</label><input class="form-input" value="${_esc(lineSet[0])}" disabled></div>
                <div class="form-group" style="grid-column:1 / -1;"><label class="form-label">대표 JIG 품명</label><input class="form-input" id="mergeJigPartName" value="${_esc(defaultName)}"></div>
                <div class="form-group"><label class="form-label">수명 횟수</label><input type="number" class="form-input" id="mergeJigMaxCount" value="${maxCount}" min="1"></div>
            </div>
            <div style="margin-top:10px;font-size:0.82rem;">
                <div style="font-weight:700;margin-bottom:6px;">병합 품목</div>
                <ul style="margin:0;padding-left:20px;line-height:1.7;">${selected.map(r => `<li>${_esc(r.partName)}</li>`).join('')}</ul>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="JigModule.saveBatchMerge()">병합 저장</button>`,
            'lg'
        );
    }

    async function saveBatchMerge() {
        if (!_batchMergeRows.length) return;
        const carModel = _batchMergeRows[0].carModel;
        const line = _batchMergeRows[0].line;
        const partAliases = [...new Set(_batchMergeRows.map(r => r.partName).filter(Boolean))];
        const partName = document.getElementById('mergeJigPartName')?.value.trim() || partAliases[0];
        const maxCount = parseInt(document.getElementById('mergeJigMaxCount')?.value || 0);
        if (!maxCount) {
            UIUtils.toast('수명 횟수를 입력하세요.', 'warning');
            return;
        }

        const allJigs = Storage.getAll(STORE) || [];
        const selectedIds = [...new Set(_batchMergeRows.map(r => r.id).filter(Boolean))];
        let target = selectedIds.length ? allJigs.find(j => j.id === selectedIds[0]) : null;
        if (!target) target = allJigs.find(j => j.carModel === carModel && j.line === line && partAliases.some(p => _jigMatchesPart(j, p)));

        const payload = {
            ...(target || {}),
            carModel,
            partName,
            partAliases,
            line,
            maxCount,
            registDate: (target && target.registDate) || _today(),
            merged: true,
            updatedAt: new Date().toISOString()
        };

        let targetId = target && target.id;
        if (targetId) {
            await Storage.update(STORE, targetId, payload);
        } else {
            const added = await Storage.add(STORE, payload);
            targetId = added && added.id;
        }

        if (targetId) {
            const logs = Storage.getAll(LOG_STORE) || [];
            for (const id of selectedIds) {
                if (id === targetId) continue;
                for (const log of logs.filter(l => l.jigId === id)) {
                    await Storage.update(LOG_STORE, log.id, { ...log, jigId: targetId, note: `${log.note || ''} / 병합 이전` });
                }
                await Storage.remove(STORE, id);
            }
        }

        UIUtils.toast(`JIG 병합 완료 (${partAliases.length}개 품목)`, 'success');
        _batchMergeRows = [];
        _refreshBatchRegisterModal(true);
    }

    async function saveBatch() {
        const rows = _collectBatchRowsFromForm();
        let saved = 0;
        let skipped = 0;
        for (const r of Object.values(rows)) {
            const maxCount = parseInt(r.maxCount || 0);
            if (!maxCount) {
                skipped++;
                continue;
            }
            const data = { carModel: r.carModel, partName: r.partName, line: r.line, maxCount, registDate: _today() };
            if (r.id) {
                const prev = Storage.getById(STORE, r.id) || {};
                await Storage.update(STORE, r.id, { ...prev, ...data });
            } else {
                const existing = _findJigForProduct(Storage.getAll(STORE) || [], r.carModel, r.partName, r.line);
                if (existing) await Storage.update(STORE, existing.id, { ...existing, maxCount });
                else await Storage.add(STORE, data);
            }
            saved++;
        }
        UIUtils.toast(`저장 완료: ${saved}건 저장, ${skipped}건 건너뜀`, 'success');
        UIUtils.closeModal();
        loadAll();
    }

    function _carModelOptions(selected = '') {
        const cars = [...new Set((Storage.getAll(DB.STORES.PRODUCTS) || []).map(p => p.carModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        return `<option value="">선택</option>` + cars.map(c => `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`).join('');
    }

    function _partNameOptions(carModel, selected = '') {
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const parts = [...new Set(products.filter(p => !carModel || p.carModel === carModel).map(p => p.partName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        return `<option value="">선택</option>` + parts.map(p => `<option value="${_esc(p)}" ${p === selected ? 'selected' : ''}>${_esc(p)}</option>`).join('');
    }

    function onCarModelChange() {
        const car = document.getElementById('jigCarModel')?.value || '';
        const sel = document.getElementById('jigPartName');
        if (sel) sel.innerHTML = _partNameOptions(car);
    }

    function _formHtml(d = {}) {
        return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
                <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigCarModel" onchange="JigModule.onCarModelChange()">${_carModelOptions(d.carModel || '')}</select>
            </div>
            <div class="form-group">
                <label class="form-label">제품명 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigPartName">${_partNameOptions(d.carModel || '', d.partName || '')}</select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div class="form-group">
                <label class="form-label">도장라인 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigLine">
                    <option value="A라인" ${d.line === 'A라인' ? 'selected' : ''}>A라인</option>
                    <option value="B라인" ${d.line === 'B라인' ? 'selected' : ''}>B라인</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">JIG 번호</label>
                <input type="text" class="form-input" id="jigNo" value="${_esc(d.jigNo || '')}" placeholder="예: JIG-001">
            </div>
            <div class="form-group">
                <label class="form-label">수명 횟수 <span style="color:var(--accent-red)">*</span></label>
                <input type="number" class="form-input" id="jigMaxCount" value="${d.maxCount || ''}" placeholder="예: 10000" min="1">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
            <div class="form-group"><label class="form-label">제작처</label><input type="text" class="form-input" id="jigMaker" value="${_esc(d.maker || '')}"></div>
            <div class="form-group"><label class="form-label">재질</label><input type="text" class="form-input" id="jigMaterial" value="${_esc(d.material || '')}" placeholder="예: SUS, AL"></div>
            <div class="form-group"><label class="form-label">단가</label><input type="number" class="form-input" id="jigUnitPrice" value="${d.unitPrice || ''}" min="0"></div>
            <div class="form-group"><label class="form-label">등록일</label><input type="date" class="form-input" id="jigRegistDate" value="${d.registDate || _today()}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="jigNote" rows="2">${_esc(d.note || '')}</textarea></div>`;
    }

    function _collectForm() {
        const carModel = document.getElementById('jigCarModel')?.value.trim();
        const partName = document.getElementById('jigPartName')?.value.trim();
        const maxCount = parseInt(document.getElementById('jigMaxCount')?.value || 0);
        if (!carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return null; }
        if (!partName) { UIUtils.toast('제품명을 선택하세요.', 'warning'); return null; }
        if (!maxCount) { UIUtils.toast('수명 횟수를 입력하세요.', 'warning'); return null; }
        return {
            carModel,
            partName,
            line: document.getElementById('jigLine')?.value || 'A라인',
            jigNo: document.getElementById('jigNo')?.value.trim() || '',
            maxCount,
            maker: document.getElementById('jigMaker')?.value.trim() || '',
            material: document.getElementById('jigMaterial')?.value.trim() || '',
            unitPrice: parseInt(document.getElementById('jigUnitPrice')?.value || 0) || 0,
            registDate: document.getElementById('jigRegistDate')?.value || _today(),
            note: document.getElementById('jigNote')?.value.trim() || ''
        };
    }

    function openAddModal() {
        UIUtils.showModal('JIG 단건 등록', _formHtml(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = _collectForm();
        if (!data) return;
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('JIG가 등록되었습니다.', 'success');
        loadAll();
    }

    function openEditModal(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) return;
        UIUtils.showModal('JIG 수정', _formHtml(jig), `<button class="btn btn-danger" onclick="JigModule.remove('${_js(id)}')">삭제</button><button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveEdit('${_js(id)}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
        const data = _collectForm();
        if (!data) return;
        const prev = Storage.getById(STORE, id) || {};
        await Storage.update(STORE, id, { ...prev, ...data });
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadAll();
    }

    function remove(id) {
        const jig = Storage.getById(STORE, id);
        UIUtils.confirm(`[${jig?.carModel || '-'}] ${jig?.partName || '-'} JIG를 삭제하시겠습니까?\n관련 이력도 함께 삭제됩니다.`, async () => {
            const logs = (Storage.getAll(LOG_STORE) || []).filter(l => l.jigId === id);
            for (const log of logs) await Storage.remove(LOG_STORE, log.id);
            await Storage.remove(STORE, id);
            UIUtils.closeModal();
            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function resetCount(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) return;
        UIUtils.confirm(`[${jig.carModel}] ${jig.partName} (${jig.line}) JIG를 교체 초기화하시겠습니까?\n기존 사용 이력은 삭제되고 교체 기록이 남습니다.`, async () => {
            const logs = (Storage.getAll(LOG_STORE) || []).filter(l => l.jigId === id && l.workType !== '교체');
            for (const log of logs) await Storage.remove(LOG_STORE, log.id);
            await Storage.add(LOG_STORE, { jigId: id, date: _today(), workType: '교체', useCount: 0, note: '교체 초기화' });
            UIUtils.toast('사용 횟수가 초기화되었습니다.', 'success');
            loadAll();
        });
    }

    function openAddLogModal() {
        const jigs = (Storage.getAll(STORE) || []).sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.partName || '').localeCompare(b.partName || '', 'ko'));
        UIUtils.showModal('JIG 사용 등록', `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">JIG 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="logJigId">
                        <option value="">선택</option>
                        ${jigs.map(j => `<option value="${_esc(j.id)}">[${_esc(j.carModel || '-')}] ${_esc(j.partName || '-')}${j.line ? ' (' + _esc(j.line) + ')' : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label class="form-label">사용일</label><input type="date" class="form-input" id="logDate" value="${_today()}"></div>
                <div class="form-group"><label class="form-label">작업 내용</label><select class="form-select" id="logWorkType"><option>도장 작업</option><option>교체</option><option>점검</option><option>기타</option></select></div>
                <div class="form-group"><label class="form-label">사용 횟수</label><input type="number" class="form-input" id="logUseCount" value="1" min="0"></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="logNote" rows="2"></textarea></div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveLog()">저장</button>`,
            'lg'
        );
    }

    async function saveLog() {
        const jigId = document.getElementById('logJigId')?.value;
        if (!jigId) { UIUtils.toast('JIG를 선택하세요.', 'warning'); return; }
        await Storage.add(LOG_STORE, {
            jigId,
            date: document.getElementById('logDate')?.value || _today(),
            workType: document.getElementById('logWorkType')?.value || '도장 작업',
            useCount: parseInt(document.getElementById('logUseCount')?.value || 0) || 0,
            note: document.getElementById('logNote')?.value.trim() || ''
        });
        UIUtils.closeModal();
        UIUtils.toast('사용 이력이 등록되었습니다.', 'success');
        loadAll();
    }

    function removeLog(id) {
        UIUtils.confirm('사용 이력을 삭제하시겠습니까?', async () => {
            await Storage.remove(LOG_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function _normalizeLine(lineVal) {
        const s = String(lineVal || '').toUpperCase().replace(/\s/g, '');
        if (s.includes('B')) return 'B라인';
        if (s.includes('A')) return 'A라인';
        return null;
    }

    function _calcUseCount(spindle, line) {
        const cycle = line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE;
        if (spindle <= cycle) return 1;
        return Math.round(spindle / cycle);
    }

    function _getProductCvt(carModel, partName) {
        const prod = (Storage.getAll(DB.STORES.PRODUCTS) || []).find(p => p.carModel === carModel && p.partName === partName);
        if (!prod) return 0;
        for (let i = 1; i <= 4; i++) {
            const proc = String(prod['process' + i] || '').toLowerCase();
            if (proc.includes('도장') || proc.includes('paint')) return Number(prod['cvt' + i]) || 0;
        }
        return Number(prod.cvt1) || 0;
    }

    async function addUsageFromWork(work) {
        if (!work) return;
        const line = _normalizeLine(work.line);
        if (!line) return;
        const cvt = _getProductCvt(work.carModel, work.partName);
        const inputQty = Number(work.inputQty) || 0;
        if (!cvt || !inputQty) return;
        const spindle = Math.ceil(inputQty / cvt);
        const useCount = _calcUseCount(spindle, line);
        const jig = _findJigForProduct(Storage.getAll(STORE) || [], work.carModel, work.partName, line);
        if (!jig) return;
        const logs = Storage.getAll(LOG_STORE) || [];
        if (logs.some(l => l.paintingWorkId === work.id && l.source === 'auto_painting')) return;
        await Storage.add(LOG_STORE, {
            jigId: jig.id,
            date: work.date,
            workType: '도장 작업',
            useCount,
            note: `자동: SPINDLE ${_fmt(spindle)}개 (투입 ${_fmt(inputQty)} ÷ CVT ${cvt}) 1CYCLE=${line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE}`,
            source: 'auto_painting',
            paintingWorkId: work.id
        });
    }

    async function syncFromPaintingWork() {
        UIUtils.confirm('도장 작업 실적 전체를 기준으로 JIG 자동 사용 이력을 재계산합니다.\n기존 자동 생성 이력은 삭제 후 재등록됩니다.\n계속하시겠습니까?', async () => {
            const oldLogs = (Storage.getAll(LOG_STORE) || []).filter(l => l.source === 'auto_painting');
            for (const log of oldLogs) await Storage.remove(LOG_STORE, log.id);
            const works = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
            const jigs = Storage.getAll(STORE) || [];
            let added = 0;
            let skipped = 0;
            for (const work of works) {
                const line = _normalizeLine(work.line);
                const cvt = _getProductCvt(work.carModel, work.partName);
                const inputQty = Number(work.inputQty) || 0;
                if (!line || !cvt || !inputQty) { skipped++; continue; }
                const spindle = Math.ceil(inputQty / cvt);
                const jig = _findJigForProduct(jigs, work.carModel, work.partName, line);
                if (!jig) { skipped++; continue; }
                await Storage.add(LOG_STORE, {
                    jigId: jig.id,
                    date: work.date,
                    workType: '도장 작업',
                    useCount: _calcUseCount(spindle, line),
                    note: `자동: SPINDLE ${_fmt(spindle)}개 (투입 ${_fmt(inputQty)} ÷ CVT ${cvt}) 1CYCLE=${line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE}`,
                    source: 'auto_painting',
                    paintingWorkId: work.id
                });
                added++;
            }
            UIUtils.toast(`동기화 완료: ${added}건 등록 / ${skipped}건 스킵`, 'success');
            loadAll();
        });
    }

    return {
        init: render,
        render,
        loadAll,
        filterLine,
        renderLog,
        onCarModelChange,
        onLogCarChange,
        resetLogFilter,
        openAddModal,
        openEditModal,
        openBatchRegisterModal,
        filterBatchCar,
        updateRegisteredMaxCount,
        openBatchMergeModal,
        saveBatchMerge,
        saveBatch,
        openAddLogModal,
        saveNew,
        saveEdit,
        saveLog,
        remove,
        removeLog,
        resetCount,
        addUsageFromWork,
        syncFromPaintingWork
    };
})();

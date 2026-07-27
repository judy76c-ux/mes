/**
 * 도장 투입 자재 (도장-A / 도장-B 현장 투입 재고)
 *
 * 사출 창고 생산출고 → 이 스토어로 입고 → 도장 작업 실적에서 LOT 선택·차감
 */
var PaintingInputModule = (function () {
    const STORE = DB.STORES.PAINTING_INPUT_INVENTORY;

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _normLine(line) {
        const s = String(line || '').trim();
        if (/도장[-\s]?B|\(B\)|B\s*라인|^B$/i.test(s)) return '도장-B';
        return '도장-A';
    }

    function _fmt(n) {
        if (typeof UIUtils !== 'undefined' && UIUtils.formatNumber) return UIUtils.formatNumber(n || 0);
        return Number(n || 0).toLocaleString('ko-KR');
    }

    function _recordsForLine(line) {
        const want = _normLine(line);
        return (Storage.getAll(STORE) || []).filter(function (r) {
            return _normLine(r.line || r.paintLine) === want;
        });
    }

    function _groupStock(line) {
        const records = _recordsForLine(line);
        const groups = {};
        records.forEach(function (r) {
            const key = [r.carModel || '', r.partName || '', r.color || ''].join('||');
            if (!groups[key]) {
                groups[key] = {
                    carModel: r.carModel || '',
                    partName: r.partName || '',
                    color: r.color || '',
                    records: []
                };
            }
            groups[key].records.push(r);
        });
        return Object.keys(groups).map(function (k) {
            const g = groups[k];
            const bal = (typeof InvCalc !== 'undefined' && InvCalc.lotBalances)
                ? InvCalc.lotBalances(g.records)
                : { total: 0, lots: [], unmatched: 0 };
            const lots = (bal.lots || []).filter(function (l) {
                return l.lotNo !== (InvCalc && InvCalc.UNMATCHED) && (Number(l.qty) || 0) > 0;
            });
            return {
                carModel: g.carModel,
                partName: g.partName,
                color: g.color,
                stock: Math.max(0, Number(bal.total) || 0),
                lots: lots,
                lotCount: lots.length
            };
        }).filter(function (g) { return g.stock > 0 || g.lotCount > 0; })
          .sort(function (a, b) {
              return String(a.carModel).localeCompare(String(b.carModel)) ||
                  String(a.partName).localeCompare(String(b.partName));
          });
    }

    /** 도장 작업 실적용 — 라인별 현장 투입 LOT */
    function getLotsByInjPart(line, injPartName, planColor) {
        const want = _normLine(line);
        const all = _recordsForLine(want);
        const byProduct = {};
        all.forEach(function (r) {
            if (injPartName && String(r.partName || '') !== String(injPartName)) return;
            const key = [r.carModel || '', r.partName || '', r.color || ''].join('||');
            if (!byProduct[key]) byProduct[key] = [];
            byProduct[key].push(r);
        });
        const lotMap = {};
        Object.keys(byProduct).forEach(function (k) {
            const bal = InvCalc.lotBalances(byProduct[k]);
            (bal.lots || []).forEach(function (l) {
                if (l.lotNo === InvCalc.UNMATCHED) return;
                const qty = Number(l.qty) || 0;
                if (qty <= 0) return;
                const parts = k.split('||');
                const color = parts[2] || '';
                if (!lotMap[l.lotNo]) {
                    lotMap[l.lotNo] = {
                        lotNo: l.lotNo,
                        partName: parts[1] || '',
                        carModel: parts[0] || '',
                        color: color,
                        balance: 0
                    };
                }
                lotMap[l.lotNo].balance += qty;
                if (!lotMap[l.lotNo].color && color) lotMap[l.lotNo].color = color;
            });
        });
        var lots = Object.values(lotMap).filter(function (l) { return l.balance > 0; })
            .sort(function (a, b) { return String(a.lotNo).localeCompare(String(b.lotNo)); });
        if (planColor) {
            var filtered = lots.filter(function (l) {
                if (!l.color) return true;
                return String(l.color).toLowerCase().indexOf(String(planColor).toLowerCase()) >= 0
                    || String(planColor).toLowerCase().indexOf(String(l.color).toLowerCase()) >= 0;
            });
            if (filtered.length) return filtered;
        }
        return lots;
    }

    function getLotsByCarPart(line, carModel, partName) {
        const want = _normLine(line);
        const records = _recordsForLine(want).filter(function (r) {
            if (carModel && String(r.carModel || '') !== String(carModel)) return false;
            if (partName && String(r.partName || '') !== String(partName)) return false;
            return true;
        });
        const groups = {};
        records.forEach(function (r) {
            const key = [r.carModel || '', r.partName || '', r.color || ''].join('||');
            (groups[key] = groups[key] || []).push(r);
        });
        const lotMap = {};
        Object.keys(groups).forEach(function (k) {
            const bal = InvCalc.lotBalances(groups[k]);
            const parts = k.split('||');
            (bal.lots || []).forEach(function (l) {
                if (l.lotNo === InvCalc.UNMATCHED || !(Number(l.qty) > 0)) return;
                if (!lotMap[l.lotNo]) {
                    lotMap[l.lotNo] = {
                        lotNo: l.lotNo,
                        partName: parts[1] || '',
                        carModel: parts[0] || '',
                        color: parts[2] || '',
                        balance: 0
                    };
                }
                lotMap[l.lotNo].balance += Number(l.qty) || 0;
            });
        });
        return Object.values(lotMap).filter(function (l) { return l.balance > 0; })
            .sort(function (a, b) { return String(a.lotNo).localeCompare(String(b.lotNo)); });
    }

    /** 사출 창고 생산출고 완료 시 도장 라인으로 입고 */
    async function receiveFromWarehouseOut(outRec) {
        if (!outRec) return null;
        const line = _normLine(outRec.paintLine || outRec.line);
        const qty = Number(outRec.quantity) || 0;
        if (qty <= 0) return null;
        const lots = Array.isArray(outRec.lots) && outRec.lots.length
            ? outRec.lots.map(function (l) {
                return { lotNo: String(l.lotNo || outRec.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 };
            }).filter(function (l) { return l.qty > 0; })
            : [{ lotNo: String(outRec.lotNo || '').trim() || '무표기', qty: qty }];
        return Storage.add(STORE, {
            date: outRec.date || (UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ')),
            type: '입고',
            line: line,
            paintLine: line,
            carModel: outRec.carModel || '',
            partName: outRec.partName || '',
            color: outRec.color || '',
            lots: lots,
            lotNo: lots[0] ? lots[0].lotNo : (outRec.lotNo || ''),
            quantity: qty,
            unit: 'EA',
            source: '사출 창고 생산출고',
            refOutId: outRec.id || '',
            receivedBy: outRec.outgoingBy || '',
            note: outRec.note || outRec.memo || ''
        });
    }

    /** 도장 작업 실적 등록 시 현장 투입 LOT 차감 */
    async function deductForWork(work) {
        if (!work) return;
        const line = _normLine(work.line);
        const lots = Array.isArray(work.lots) ? work.lots : [];
        for (var i = 0; i < lots.length; i++) {
            var l = lots[i];
            var qty = Number(l.qty) || 0;
            var lotNo = String(l.lotNo || '').trim();
            if (!lotNo || qty <= 0) continue;
            await Storage.add(STORE, {
                date: work.date || (UIUtils.today ? UIUtils.today() : new Date().toISOString().slice(0, 10)),
                type: '출고',
                line: line,
                paintLine: line,
                carModel: work.carModel || '',
                partName: l.partName || work.injPartName || work.partName || '',
                color: l.color || work.injColor || work.color || '',
                lots: [{ lotNo: lotNo, qty: qty }],
                lotNo: lotNo,
                quantity: qty,
                unit: 'EA',
                source: '도장 작업 투입',
                refWorkId: work.id || '',
                note: (work.line || '') + ' 작업 투입'
            });
        }
    }

    function _lineAccent(line) {
        return _normLine(line) === '도장-B' ? '#ea580c' : '#2563eb';
    }

    function _navHtml(activeLine) {
        const aActive = activeLine === '도장-A';
        const bActive = activeLine === '도장-B';
        return `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
                <button type="button" class="btn btn-sm ${aActive ? 'btn-primary' : 'btn-outline'}"
                    style="${aActive ? 'background:#2563eb;border-color:#2563eb;' : ''}"
                    onclick="Router.navigate('painting-input-a')">도장-A 자재</button>
                <button type="button" class="btn btn-sm ${bActive ? 'btn-primary' : 'btn-outline'}"
                    style="${bActive ? 'background:#ea580c;border-color:#ea580c;' : ''}"
                    onclick="Router.navigate('painting-input-b')">도장-B 자재</button>
                <span style="font-size:0.78rem;color:var(--text-muted);margin-left:4px;">
                    사출 창고 생산출고 → 해당 라인 투입 자재로 이동 · 도장 실적에서 차감
                </span>
            </div>`;
    }

    function renderHub(container) {
        const stockA = _groupStock('도장-A');
        const stockB = _groupStock('도장-B');
        const qtyA = stockA.reduce(function (s, g) { return s + g.stock; }, 0);
        const qtyB = stockB.reduce(function (s, g) { return s + g.stock; }, 0);
        const paintingNav = (typeof PaintingNavUI !== 'undefined' && PaintingNavUI.render)
            ? PaintingNavUI.render('painting-input', '')
            : '';
        container.innerHTML = `
            <div class="fade-in-up">
                ${paintingNav}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                    <div class="card" style="cursor:pointer;" onclick="Router.navigate('painting-input-a')">
                        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                            <h4 style="margin:0;color:#2563eb;">도장-A 자재</h4>
                            <span class="material-symbols-outlined" style="color:#2563eb;">chevron_right</span>
                        </div>
                        <div class="card-body">
                            <div style="font-size:1.6rem;font-weight:800;color:#2563eb;">${_fmt(qtyA)} EA</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${stockA.length}종 · 현장 투입 대기</div>
                        </div>
                    </div>
                    <div class="card" style="cursor:pointer;" onclick="Router.navigate('painting-input-b')">
                        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                            <h4 style="margin:0;color:#ea580c;">도장-B 자재</h4>
                            <span class="material-symbols-outlined" style="color:#ea580c;">chevron_right</span>
                        </div>
                        <div class="card-body">
                            <div style="font-size:1.6rem;font-weight:800;color:#ea580c;">${_fmt(qtyB)} EA</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${stockB.length}종 · 현장 투입 대기</div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function renderForLine(container, line) {
        const want = _normLine(line);
        const accent = _lineAccent(want);
        const items = _groupStock(want);
        const total = items.reduce(function (s, g) { return s + g.stock; }, 0);
        const paintingNav = (typeof PaintingNavUI !== 'undefined' && PaintingNavUI.render)
            ? PaintingNavUI.render('painting-input', '')
            : '';

        const rows = items.length
            ? items.map(function (g) {
                const lotTxt = (g.lots || []).slice(0, 4).map(function (l) {
                    return `<span style="font-family:monospace;font-size:0.78rem;background:var(--bg-secondary);padding:1px 6px;border-radius:4px;margin-right:4px;">${_esc(l.lotNo)} ${_fmt(l.qty)}</span>`;
                }).join('') + (g.lots.length > 4 ? `<span style="font-size:0.72rem;color:var(--text-muted);">+${g.lots.length - 4}</span>` : '');
                return `<tr>
                    <td><strong>${_esc(g.carModel)}</strong></td>
                    <td>${_esc(g.partName)}</td>
                    <td>${_esc(g.color || '-')}</td>
                    <td style="text-align:right;font-weight:800;color:${accent};">${_fmt(g.stock)}</td>
                    <td>${lotTxt || '-'}</td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-muted);">
                투입 대기 자재가 없습니다. 사출 창고에서 <strong>생산출고</strong> 시 도착 라인을 선택하세요.
               </td></tr>`;

        container.innerHTML = `
            <div class="fade-in-up">
                ${paintingNav}
                ${_navHtml(want)}
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;">
                    <div class="stat-card">
                        <div class="stat-card-value" style="color:${accent};">${items.length}</div>
                        <div class="stat-card-label">품목 수</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value" style="color:${accent};">${_fmt(total)}</div>
                        <div class="stat-card-label">투입 대기 수량 (EA)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value" style="color:${accent};">${want}</div>
                        <div class="stat-card-label">라인</div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h4 style="margin:0;">${want} 현장 투입 자재</h4></div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>차종</th><th>품명</th><th>컬러</th>
                                        <th style="text-align:right;">재고(EA)</th><th>LOT</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function render(container) {
        renderHub(container);
    }

    /** 도장 작업현황 임베드용 — 라인별 재고 행 HTML */
    function renderEmbedTableBody(line) {
        const want = _normLine(line);
        const accent = _lineAccent(want);
        const items = _groupStock(want);
        const total = items.reduce(function (s, g) { return s + g.stock; }, 0);
        if (!items.length) {
            return {
                itemCount: 0,
                total: 0,
                html: `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">
                    투입 대기 자재가 없습니다. 사출 창고에서 생산출고 시 도착 라인을 <strong>${_esc(want)}</strong>로 선택하세요.
                </td></tr>`
            };
        }
        const html = items.map(function (g) {
            const lotTxt = (g.lots || []).map(function (l) {
                return `<span style="font-family:monospace;font-size:0.78rem;background:var(--bg-secondary);padding:1px 6px;border-radius:4px;margin-right:4px;white-space:nowrap;">${_esc(l.lotNo)} ${_fmt(l.qty)}</span>`;
            }).join('') || '-';
            return `<tr>
                <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(g.carModel)}</strong></td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(g.partName)}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(g.color || '-')}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;color:${accent};">${_fmt(g.stock)}</td>
                <td style="padding:8px 10px;">${lotTxt}</td>
            </tr>`;
        }).join('');
        return { itemCount: items.length, total: total, html: html };
    }

    return {
        render: render,
        init: render,
        renderHub: renderHub,
        renderForLine: renderForLine,
        renderEmbedTableBody: renderEmbedTableBody,
        groupStock: _groupStock,
        getLotsByInjPart: getLotsByInjPart,
        getLotsByCarPart: getLotsByCarPart,
        receiveFromWarehouseOut: receiveFromWarehouseOut,
        deductForWork: deductForWork,
        normLine: _normLine
    };
})();

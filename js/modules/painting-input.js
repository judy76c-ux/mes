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

    function _dateKey(d) {
        return String(d || '').trim().slice(0, 10);
    }

    function _splitDateTime(dt) {
        const s = String(dt || '').trim();
        if (!s) return { day: '-', time: '-' };
        return { day: s.slice(0, 10), time: s.length > 11 ? s.slice(11, 16) : '-' };
    }

    function _primaryLot(r) {
        if (Array.isArray(r.lots) && r.lots.length) {
            return String(r.lots[0].lotNo || '').trim();
        }
        return String(r.lotNo || '').trim();
    }

    function _buildInspDateMap() {
        const map = {};
        (Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || []).forEach(function (insp) {
            const lots = (insp.lots && insp.lots.length)
                ? insp.lots
                : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
            lots.forEach(function (lot) {
                const lotNo = String(lot.lotNo || '').trim();
                const part = String(insp.partName || '').trim();
                if (!lotNo || !part) return;
                const k = part + '||' + lotNo;
                if (!map[k]) map[k] = _dateKey(insp.date);
            });
        });
        (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).forEach(function (r) {
            if (String(r.type || '') === '출고' || !r.partName || !r.lotNo) return;
            const k = String(r.partName) + '||' + String(r.lotNo);
            if (!map[k] && r.inspDate) map[k] = _dateKey(r.inspDate);
        });
        return map;
    }

    function _resolveInspDate(partName, lotNo, direct, inspMap) {
        if (direct) return _dateKey(direct);
        const k = String(partName || '') + '||' + String(lotNo || '');
        return inspMap[k] || '-';
    }

    function _receiptColsHtml(opts) {
        return '' +
            '<th style="white-space:nowrap;padding:8px 10px;">입고일</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">시간</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">차종</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">사출명</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">컬러</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">사출LOT</th>' +
            '<th style="white-space:nowrap;padding:8px 10px;">수입검사일</th>' +
            '<th style="text-align:right;white-space:nowrap;padding:8px 10px;">수량</th>' +
            (opts && opts.withAction
                ? '<th style="white-space:nowrap;padding:8px 10px;">상태</th><th style="white-space:nowrap;padding:8px 10px;">작업</th>'
                : '');
    }

    /** 금일 현장 입고 완료 건 (painting_input_inventory) */
    function renderTodayReceiptRows(list) {
        const inspMap = _buildInspDateMap();
        if (!list.length) {
            return {
                itemCount: 0,
                total: 0,
                html: '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">금일 현장 입고 자재가 없습니다.</td></tr>'
            };
        }
        const total = list.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
        const html = list.map(function (r) {
            const recvDt = r.receivedAt || r.date || '';
            const dt = _splitDateTime(recvDt);
            const lotNo = _primaryLot(r);
            const inspDate = _resolveInspDate(r.partName, lotNo, r.inspDate, inspMap);
            return '<tr>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(dt.day) + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(dt.time) + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;"><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.partName || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.color || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">' + _esc(lotNo || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(inspDate) + '</td>' +
                '<td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">' + _fmt(r.quantity) + '</td>' +
                '</tr>';
        }).join('');
        return { itemCount: list.length, total: total, html: html };
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

    /** 사출 창고 생산출고 → 현장 입고 처리 시 도장 투입 재고 반영 */
    async function receiveFromWarehouseOut(outRec) {
        if (!outRec) return null;
        const line = _normLine(outRec.paintLine || outRec.line);
        const qty = Number(outRec.quantity) || 0;
        if (qty <= 0) return null;
        if (outRec.id && _findReceiveByOutId(outRec.id)) {
            return _findReceiveByOutId(outRec.id);
        }
        const lots = Array.isArray(outRec.lots) && outRec.lots.length
            ? outRec.lots.map(function (l) {
                return { lotNo: String(l.lotNo || outRec.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 };
            }).filter(function (l) { return l.qty > 0; })
            : [{ lotNo: String(outRec.lotNo || '').trim() || '무표기', qty: qty }];
        const actor = _currentActorLabel();
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
            siteReceived: true,
            receivedBy: outRec.receivedBy || actor || outRec.outgoingBy || '',
            receivedAt: UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '),
            note: outRec.note || outRec.memo || ''
        });
    }

    function _currentActorLabel() {
        if (typeof AuthModule === 'undefined' || !AuthModule.getCurrentUser) return '';
        const u = AuthModule.getCurrentUser();
        if (!u) return '';
        return String(u.displayName || u.name || u.username || u.id || '');
    }

    function _canConfirmInbound(line) {
        if (typeof AuthModule === 'undefined' || !AuthModule.canWritePage) return true;
        const page = _normLine(line) === '도장-B' ? 'painting-work-b' : 'painting-work-a';
        return AuthModule.canWritePage(page)
            || AuthModule.canWritePage('painting-work')
            || AuthModule.canWritePage('painting-process');
    }

    function _findReceiveByOutId(outId) {
        if (!outId) return null;
        return (Storage.getAll(STORE) || []).find(function (r) {
            return String(r.refOutId || '') === String(outId) && String(r.type || '') === '입고';
        }) || null;
    }

    /** 금일 자재창고→해당 라인 생산출고 목록 (+ 현장 입고 여부) */
    function listTodayWarehouseShipments(line, date) {
        const want = _normLine(line);
        const today = date || (UIUtils.today ? UIUtils.today() : '');
        const injStore = DB.STORES.INJECTION_INVENTORY;
        return (Storage.getAll(injStore) || []).filter(function (r) {
            if (String(r.type || '') !== '출고') return false;
            const oType = String(r.outgoingType || '');
            const src = String(r.source || '');
            if (oType !== '생산출고' && src !== '사출 창고 생산출고') return false;
            if (_normLine(r.paintLine || r.line) !== want) return false;
            return String(r.date || '').slice(0, 10) === today;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        }).map(function (r) {
            const recv = _findReceiveByOutId(r.id);
            return Object.assign({}, r, {
                received: !!recv,
                receiveRec: recv || null
            });
        });
    }

    async function confirmSiteInbound(outId, line) {
        if (!_canConfirmInbound(line)) {
            UIUtils.toast('도장작업 입력 권한이 있는 사용자만 입고 처리할 수 있습니다.', 'warning');
            return null;
        }
        const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
        if (!out) {
            UIUtils.toast('출고 기록을 찾을 수 없습니다.', 'error');
            return null;
        }
        if (_findReceiveByOutId(outId)) {
            UIUtils.toast('이미 입고 처리된 건입니다.', 'info');
            return _findReceiveByOutId(outId);
        }
        const want = _normLine(line || out.paintLine || out.line);
        try {
            const rec = await receiveFromWarehouseOut(Object.assign({}, out, {
                paintLine: want,
                line: want,
                receivedBy: _currentActorLabel()
            }));
            UIUtils.toast('현장 입고 처리가 완료되었습니다.', 'success');
            return rec;
        } catch (e) {
            console.warn('[PaintingInput] confirmSiteInbound failed:', e);
            UIUtils.toast('입고 처리에 실패했습니다.', 'error');
            return null;
        }
    }

    /** 도장 작업현황 — 금일 창고 출고 목록 + 입고 처리
     *  opts.compact: 메인용 간단 표 (입고시간|차종|품명|수량)
     */
    function renderTodayShipmentTable(line, opts) {
        opts = opts || {};
        const want = _normLine(line);
        const canWrite = _canConfirmInbound(want);
        const list = listTodayWarehouseShipments(want);
        const pending = list.filter(function (r) { return !r.received; });
        const done = list.filter(function (r) { return r.received; });
        const totalQty = list.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0);
        const inspMap = _buildInspDateMap();
        const confirmFn = opts.confirmFn || 'PaintingWorkModule.confirmInputInbound';
        const compact = !!opts.compact;
        const colSpan = compact ? 4 : 10;

        if (!list.length) {
            return {
                itemCount: 0,
                pendingCount: 0,
                doneCount: 0,
                total: 0,
                html: `<tr><td colspan="${colSpan}" style="text-align:center;padding:20px;color:var(--text-muted);">
                    금일 자재 창고에서 ${_esc(want)}로 출고된 자재가 없습니다.
                </td></tr>`
            };
        }

        if (compact) {
            const html = list.map(function (r) {
                const outDt = _splitDateTime(r.date || '');
                const timeTxt = (outDt.day !== '-' ? outDt.day + ' ' : '') + (outDt.time !== '-' ? outDt.time : '');
                const muted = r.received ? 'opacity:0.55;' : '';
                return `<tr style="${muted}">
                    <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(timeTxt || '-')}</td>
                    <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(r.carModel || '-')}</strong></td>
                    <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.partName || '-')}</td>
                    <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">${_fmt(r.quantity)}</td>
                </tr>`;
            }).join('');
            return {
                itemCount: list.length,
                pendingCount: pending.length,
                doneCount: done.length,
                total: totalQty,
                html: html
            };
        }

        const html = list.map(function (r) {
            const recv = r.receiveRec || null;
            const recvDt = recv ? (recv.receivedAt || recv.date || '') : '';
            const dt = recv ? _splitDateTime(recvDt) : { day: '-', time: '-' };
            const lotNo = _primaryLot(r);
            const inspDate = _resolveInspDate(r.partName, lotNo, r.inspDate, inspMap);
            const statusHtml = r.received
                ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.12);color:#16a34a;">입고완료</span>'
                : '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.12);color:#ea580c;">미입고</span>';
            const actionHtml = r.received
                ? `<span style="font-size:0.75rem;color:var(--text-muted);">${_esc((recv && recv.receivedBy) || '-')}</span>`
                : (canWrite
                    ? `<button type="button" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:0.78rem;white-space:nowrap;"
                        onclick="${confirmFn}('${_esc(r.id)}','${_esc(want)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 입고 처리
                       </button>`
                    : '<span style="font-size:0.75rem;color:var(--text-muted);">입력 권한 필요</span>');
            return `<tr>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(dt.day)}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(dt.time)}</td>
                <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(r.carModel || '-')}</strong></td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.partName || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.color || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">${_esc(lotNo || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(inspDate)}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">${_fmt(r.quantity)}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${statusHtml}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${actionHtml}</td>
            </tr>`;
        }).join('');

        return {
            itemCount: list.length,
            pendingCount: pending.length,
            doneCount: done.length,
            total: totalQty,
            html: html
        };
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

    /** 도장 작업현황 임베드용 — 금일 출고 목록 */
    function renderEmbedTableBody(line) {
        return renderTodayShipmentTable(line);
    }

    return {
        render: render,
        init: render,
        renderHub: renderHub,
        renderForLine: renderForLine,
        renderEmbedTableBody: renderEmbedTableBody,
        renderTodayShipmentTable: renderTodayShipmentTable,
        renderTodayReceiptRows: renderTodayReceiptRows,
        receiptTableHeaders: _receiptColsHtml,
        listTodayWarehouseShipments: listTodayWarehouseShipments,
        confirmSiteInbound: confirmSiteInbound,
        canConfirmInbound: _canConfirmInbound,
        groupStock: _groupStock,
        getLotsByInjPart: getLotsByInjPart,
        getLotsByCarPart: getLotsByCarPart,
        receiveFromWarehouseOut: receiveFromWarehouseOut,
        deductForWork: deductForWork,
        normLine: _normLine
    };
})();

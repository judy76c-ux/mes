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

    /** 사출 창고 생산출고 → 현장 입고 처리 시 도장 투입 재고 반영
     *  opts: { actualQty, useDate, receivedBy }
     */
    async function receiveFromWarehouseOut(outRec, opts) {
        opts = opts || {};
        if (!outRec) return null;
        const line = _normLine(outRec.paintLine || outRec.line);
        const shipQty = Number(outRec.quantity) || 0;
        const qty = opts.actualQty != null ? Math.max(0, Number(opts.actualQty) || 0) : shipQty;
        if (qty <= 0) return null;
        if (outRec.id && _findReceiveByOutId(outRec.id)) {
            return _findReceiveByOutId(outRec.id);
        }
        const useDate = String(opts.useDate || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const nowTime = (UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ')).slice(11, 16);
        const stampDate = useDate
            ? (useDate + (nowTime ? ' ' + nowTime : ''))
            : (outRec.date || (UIUtils.now ? UIUtils.now() : ''));
        // 실제 창고 출고(= 실질적인 현장 도착) 일시 — 확인 처리를 늦게(자동 캐치업 등) 하더라도
        // "언제 실제로 입고됐는지"는 이 값을 우선 써야 한다. date/useDate는 확인 처리 시각·예정
        // 사용일이라 배치로 늦게 확인하면 전부 "오늘"로 뭉쳐 보이는 문제가 있었다.
        const shipStamp = _outDisplayStamp(outRec);

        let lots = Array.isArray(outRec.lots) && outRec.lots.length
            ? outRec.lots.map(function (l) {
                return { lotNo: String(l.lotNo || outRec.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 };
            }).filter(function (l) { return l.qty > 0; })
            : [{ lotNo: String(outRec.lotNo || '').trim() || '무표기', qty: shipQty }];
        lots = _scaleLotsToQty(lots, qty);

        const actor = opts.receivedBy || _currentActorLabel();
        return Storage.add(STORE, {
            date: stampDate,
            useDate: useDate || undefined,
            shipDate: shipStamp || undefined,
            type: '입고',
            line: line,
            paintLine: line,
            carModel: outRec.carModel || '',
            partName: outRec.partName || '',
            color: outRec.color || '',
            lots: lots,
            lotNo: lots[0] ? lots[0].lotNo : (outRec.lotNo || ''),
            quantity: qty,
            shipQty: shipQty,
            unit: 'EA',
            source: '사출 창고 생산출고',
            refOutId: outRec.id || '',
            siteReceived: true,
            receivedBy: actor || outRec.outgoingBy || '',
            receivedAt: UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '),
            note: outRec.note || outRec.memo || ''
        });
    }

    function _scaleLotsToQty(lots, newTotal) {
        const list = (lots || []).filter(function (l) { return (Number(l.qty) || 0) > 0; });
        const target = Math.max(0, Number(newTotal) || 0);
        if (!list.length) return [{ lotNo: '무표기', qty: target }];
        if (list.length === 1) return [{ lotNo: list[0].lotNo, qty: target }];
        const oldTotal = list.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
        if (oldTotal <= 0) {
            return [{ lotNo: list[0].lotNo, qty: target }];
        }
        let allocated = 0;
        const scaled = list.map(function (l, idx) {
            if (idx === list.length - 1) {
                return { lotNo: l.lotNo, qty: Math.max(0, target - allocated) };
            }
            const q = Math.floor((Number(l.qty) || 0) * target / oldTotal);
            allocated += q;
            return { lotNo: l.lotNo, qty: q };
        }).filter(function (l) { return l.qty > 0; });
        return scaled.length ? scaled : [{ lotNo: list[0].lotNo, qty: target }];
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

    /** A↔B 라인 이동 권한 — 도장 메인/작업/창고 입력 권한 */
    function _canMoveShipmentLine() {
        if (typeof AuthModule === 'undefined' || !AuthModule.canWritePage) return true;
        if (typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser()) return true;
        if (typeof AuthModule.isAdmin === 'function' && AuthModule.isAdmin()) return true;
        return _canConfirmInbound('도장-A')
            || _canConfirmInbound('도장-B')
            || AuthModule.canWritePage('painting-process')
            || AuthModule.canWritePage('injection-warehouse')
            || AuthModule.canWritePage('warehouse')
            || AuthModule.canWritePage('warehouse-hub');
    }

    function _findReceiveByOutId(outId) {
        if (!outId) return null;
        return (Storage.getAll(STORE) || []).find(function (r) {
            return String(r.refOutId || '') === String(outId) && String(r.type || '') === '입고';
        }) || null;
    }

    /** 출고 표시용 일시 (시각 없으면 createdAt 복원) */
    function _outDisplayStamp(r) {
        if (typeof InvCalc !== 'undefined' && typeof InvCalc.recordStamp === 'function') {
            const s = InvCalc.recordStamp(r);
            if (s) return String(s).slice(0, 16);
        }
        const raw = String((r && r.date) || '').trim();
        if (raw) return raw.slice(0, 16);
        const iso = (r && (r.createdAt || r.updatedAt)) || '';
        if (iso) {
            const d = new Date(iso);
            if (!Number.isNaN(d.getTime())) {
                const p = function(n) { return String(n).padStart(2, '0'); };
                return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
                    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
            }
        }
        return '';
    }

    /**
     * 금일 창고 출고 건의 도착 라인을 도장-A ↔ 도장-B로 변경
     * (현장 입고 완료 건은 불가)
     */
    async function moveShipmentLine(outId, toLine) {
        const want = _normLine(toLine);
        if (!_canMoveShipmentLine()) {
            UIUtils.toast('라인 이동 권한이 없습니다.', 'warning');
            return null;
        }
        const injStore = DB.STORES.INJECTION_INVENTORY;
        const out = Storage.getById(injStore, outId);
        if (!out) {
            UIUtils.toast('출고 기록을 찾을 수 없습니다.', 'error');
            return null;
        }
        if (_findReceiveByOutId(outId)) {
            UIUtils.toast('이미 현장 입고된 건은 라인을 변경할 수 없습니다.', 'warning');
            return null;
        }
        const from = _normLine(out.paintLine || out.line);
        if (from === want) {
            UIUtils.toast('이미 ' + want + ' 라인입니다.', 'info');
            return out;
        }
        try {
            await Storage.update(injStore, outId, {
                paintLine: want,
                line: want
            });
            UIUtils.toast(from + ' → ' + want + ' 이동 완료', 'success');
            return Storage.getById(injStore, outId);
        } catch (e) {
            console.warn('[PaintingInput] moveShipmentLine failed:', e);
            UIUtils.toast('라인 이동 실패: ' + (e.message || e), 'error');
            return null;
        }
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

    /** 최근 N일 생산출고 중 현장 미입고 건 (실적 LOT 부족 진단용) */
    function listPendingWarehouseShipments(line, opts) {
        opts = opts || {};
        const want = _normLine(line);
        const days = Math.max(1, Number(opts.days) || 14);
        const end = String(opts.date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        let start = end;
        try {
            const d = new Date(end + 'T00:00:00');
            d.setDate(d.getDate() - (days - 1));
            start = d.toISOString().slice(0, 10);
        } catch (e) { /* keep end */ }

        const injStore = DB.STORES.INJECTION_INVENTORY;
        return (Storage.getAll(injStore) || []).filter(function (r) {
            if (String(r.type || '') !== '출고') return false;
            const oType = String(r.outgoingType || '');
            const src = String(r.source || '');
            if (oType !== '생산출고' && src !== '사출 창고 생산출고') return false;
            if (_normLine(r.paintLine || r.line) !== want) return false;
            const day = String(r.date || '').slice(0, 10);
            if (!day || day < start || day > end) return false;
            if (opts.carModel && String(r.carModel || '') !== String(opts.carModel)) return false;
            if (opts.partName && String(r.partName || '') !== String(opts.partName)) return false;
            if (_findReceiveByOutId(r.id)) return false;
            return true;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        }).map(function (r) {
            return Object.assign({}, r, { received: false, receiveRec: null });
        });
    }

    /** 현장 입고(도장 투입) 이력 존재 여부 — 잔량 0이어도 입고 이력 판별용 */
    function hasSiteInboundHistory(line, opts) {
        opts = opts || {};
        const want = _normLine(line);
        return (_recordsForLine(want) || []).some(function (r) {
            if (String(r.type || '') !== '입고') return false;
            if (opts.carModel && String(r.carModel || '') !== String(opts.carModel)) return false;
            if (opts.partName && String(r.partName || '') !== String(opts.partName)) return false;
            return true;
        });
    }

    /** 입고 처리 진입 — 사용일·실수량 확인 모달 후 저장 */
    function confirmSiteInbound(outId, line) {
        return openConfirmSiteInboundModal(outId, line);
    }

    function openConfirmSiteInboundModal(outId, line) {
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
        const shipQty = Number(out.quantity) || 0;
        const today = UIUtils.today ? UIUtils.today() : '';
        const lotNo = _primaryLot(out);
        const stamp = _outDisplayStamp(out);
        const outDt = _splitDateTime(stamp);

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-blue);">move_to_inbox</span> 현장 입고 확인`,
            `
            <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.55;">
                <div><strong>${_esc(want)}</strong> · ${_esc(out.carModel || '-')} · ${_esc(out.partName || '-')}${out.color ? ' · ' + _esc(out.color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">
                    창고 출고: ${_esc(outDt.day)}${outDt.time !== '-' ? ' ' + _esc(outDt.time) : ''}
                    · LOT <span style="font-family:monospace;font-weight:700;">${_esc(lotNo || '-')}</span>
                    · 출고수량 <strong>${_fmt(shipQty)} EA</strong>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사용 예정일 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(언제 사용할 자재인지 · 기본 당일)</span></label>
                    <input type="date" class="form-input" id="piInboundUseDate" value="${_esc(today)}"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();PaintingInputModule.submitConfirmSiteInbound();}">
                </div>
                <div class="form-group">
                    <label class="form-label">실수량 (EA) <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(확인 후 수정 가능)</span></label>
                    <input type="number" class="form-input" id="piInboundActualQty" min="1" max="${shipQty}" step="1"
                        value="${shipQty}"
                        oninput="this.value=Math.min(Math.max(parseInt(this.value,10)||0,1),${shipQty})"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();PaintingInputModule.submitConfirmSiteInbound();}">
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">출고수량 ${_fmt(shipQty)} EA 이하로 입력하세요.</div>
                </div>
            </div>
            <div style="margin-top:8px;padding:10px 12px;border-radius:8px;border:1px solid rgba(37,99,235,0.25);background:rgba(37,99,235,0.06);font-size:0.84rem;color:var(--text-secondary);line-height:1.5;">
                위 내용을 확인한 뒤 <strong>입고 처리</strong>하시겠습니까?
            </div>
            <input type="hidden" id="piInboundOutId" value="${_esc(outId)}">
            <input type="hidden" id="piInboundLine" value="${_esc(want)}">
            <input type="hidden" id="piInboundShipQty" value="${shipQty}">
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="PaintingInputModule.submitConfirmSiteInbound()">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">check</span> 입고 처리
             </button>`,
            'md'
        );
        setTimeout(function () {
            const qtyEl = document.getElementById('piInboundActualQty');
            if (qtyEl) qtyEl.focus();
        }, 80);
        return null;
    }

    async function submitConfirmSiteInbound() {
        const outId = ((document.getElementById('piInboundOutId') || {}).value || '').trim();
        const line = ((document.getElementById('piInboundLine') || {}).value || '').trim();
        const useDate = ((document.getElementById('piInboundUseDate') || {}).value || '').trim().slice(0, 10);
        const shipQty = Number((document.getElementById('piInboundShipQty') || {}).value) || 0;
        let actualQty = Number((document.getElementById('piInboundActualQty') || {}).value) || 0;

        if (!outId) { UIUtils.toast('출고 정보를 확인할 수 없습니다.', 'error'); return; }
        if (!useDate) {
            UIUtils.toast('사용 예정일을 선택하세요.', 'warning');
            document.getElementById('piInboundUseDate')?.focus();
            return;
        }
        if (actualQty <= 0) {
            UIUtils.toast('실수량을 1 이상 입력하세요.', 'warning');
            document.getElementById('piInboundActualQty')?.focus();
            return;
        }
        if (shipQty > 0 && actualQty > shipQty) {
            UIUtils.toast(`실수량은 출고수량(${_fmt(shipQty)} EA)을 초과할 수 없습니다.`, 'warning');
            document.getElementById('piInboundActualQty')?.focus();
            return;
        }

        if (!_canConfirmInbound(line)) {
            UIUtils.toast('도장작업 입력 권한이 있는 사용자만 입고 처리할 수 있습니다.', 'warning');
            return;
        }
        const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
        if (!out) {
            UIUtils.toast('출고 기록을 찾을 수 없습니다.', 'error');
            return;
        }
        if (_findReceiveByOutId(outId)) {
            UIUtils.toast('이미 입고 처리된 건입니다.', 'info');
            UIUtils.closeModal();
            _refreshInboundViews();
            return;
        }

        const want = _normLine(line || out.paintLine || out.line);
        try {
            const rec = await receiveFromWarehouseOut(Object.assign({}, out, {
                paintLine: want,
                line: want
            }), {
                actualQty: actualQty,
                useDate: useDate,
                receivedBy: _currentActorLabel()
            });
            UIUtils.closeModal();
            if (rec) {
                const qtyNote = actualQty !== shipQty
                    ? ` (출고 ${_fmt(shipQty)} → 실수량 ${_fmt(actualQty)} EA)`
                    : '';
                UIUtils.toast(`현장 입고 처리 완료 · 사용일 ${useDate}${qtyNote}`, 'success');
            } else {
                UIUtils.toast('입고 처리에 실패했습니다.', 'error');
            }
            _refreshInboundViews();
            return rec;
        } catch (e) {
            console.warn('[PaintingInput] submitConfirmSiteInbound failed:', e);
            UIUtils.toast('입고 처리에 실패했습니다.', 'error');
            return null;
        }
    }

    function _refreshInboundViews() {
        try {
            if (typeof PaintingProcessModule !== 'undefined' && typeof PaintingProcessModule.refreshShipments === 'function') {
                PaintingProcessModule.refreshShipments();
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.renderInputStockSection === 'function') {
                PaintingWorkModule.renderInputStockSection();
            }
        } catch (e) { /* ignore */ }
    }

    function _nowHm() {
        const d = new Date();
        const p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function _resolveProductNamesFromInjPart(carModel, injPartName) {
        const names = {};
        const inj = String(injPartName || '').trim();
        if (inj) names[inj] = true;
        try {
            (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []).forEach(function (m) {
                if (!m || !m.injPartName) return;
                if (carModel && m.carModel && m.carModel !== carModel) return;
                if (String(m.injPartName).trim() !== inj) return;
                const mfg1 = String(m.mfgProductName || '').trim();
                const mfg2 = String(m.mfgProductName2 || '').trim();
                if (mfg1) names[mfg1] = true;
                if (mfg2) names[mfg2] = true;
            });
        } catch (e) { /* ignore */ }
        return names;
    }

    /** 복합 컬러 호환 판정 — BLACK ↔ BK+CLEAR, BK ↔ BLACK 등 */
    function _colorTokens(raw) {
        const s = String(raw || '').trim();
        if (!s) return [];
        const parts = s.split(/[,，\/+\-|]/).map(function (t) { return t.trim(); }).filter(Boolean);
        const tokens = parts.length ? parts : [s];
        return tokens.map(function (t) {
            if (typeof UIUtils !== 'undefined' && UIUtils.normalizeColorAlias) {
                return UIUtils.normalizeColorAlias(t);
            }
            return t.toLowerCase().replace(/\s+/g, '');
        }).filter(Boolean);
    }

    function _colorsCompatible(a, b) {
        if (!a || !b) return true;
        const na = String(a).trim().toLowerCase().replace(/\s+/g, '');
        const nb = String(b).trim().toLowerCase().replace(/\s+/g, '');
        if (na === nb) return true;
        const ta = _colorTokens(a);
        const tb = _colorTokens(b);
        if (!ta.length || !tb.length) return true;
        return ta.some(function (x) { return tb.indexOf(x) >= 0; });
    }

    /** 금일 생산계획 중 출고 건과 매칭되는 계획 목록 */
    function findPlansForShipment(record, line, date) {
        if (!record) return [];
        const today = String(date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const want = _normLine(line || record.paintLine || record.line);
        const plans = (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || []).filter(function (p) {
            if (!p || String(p.date || '').slice(0, 10) !== today) return false;
            return _normLine(p.line) === want;
        });
        if (record.planId) {
            const byId = plans.find(function (p) { return p.id === record.planId; });
            if (byId) return [byId];
        }
        const car = String(record.carModel || '').trim();
        const injPart = String(record.partName || '').trim();
        const color = String(record.color || '').trim();
        const productNames = _resolveProductNamesFromInjPart(car, injPart);

        return plans.filter(function (p) {
            if (car && p.carModel && p.carModel !== car) return false;
            const pPart = String(p.partName || '').trim();
            if (pPart && !productNames[pPart] && pPart !== injPart) return false;
            // BLACK ↔ BK+CLEAR 등 복합/별칭 컬러 허용
            if (!_colorsCompatible(color, p.color || '')) return false;
            return true;
        });
    }

    function getPlanQtyForShipment(record, line, date) {
        return findPlansForShipment(record, line, date).reduce(function (s, p) {
            return s + (Number(p.planQty) || 0);
        }, 0);
    }

    function getPlanEndTimeForShipment(record, line, date) {
        let end = '';
        findPlansForShipment(record, line, date).forEach(function (p) {
            const t = String(p.endTime || '').trim();
            if (t && (!end || t > end)) end = t;
        });
        return end;
    }

    function getTodayLinePlanTotal(line, date) {
        const today = String(date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const want = _normLine(line);
        return (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || []).reduce(function (s, p) {
            if (!p || String(p.date || '').slice(0, 10) !== today) return s;
            if (_normLine(p.line) !== want) return s;
            return s + (Number(p.planQty) || 0);
        }, 0);
    }

    function _fmtVarianceHtml(actual, planQty) {
        const plan = Number(planQty) || 0;
        const act = Number(actual) || 0;
        if (!plan) {
            return '<span style="font-size:0.78rem;color:var(--text-muted);">—</span>';
        }
        const diff = act - plan;
        if (diff === 0) {
            return '<span style="font-weight:700;color:#16a34a;">0</span>';
        }
        const color = diff > 0 ? '#ea580c' : '#2563eb';
        const sign = diff > 0 ? '+' : '';
        return '<span style="font-weight:700;color:' + color + ';" title="출고 ' + _fmt(act) + ' − 계획 ' + _fmt(plan) + '">'
            + sign + _fmt(diff) + '</span>';
    }

    /** 모달 없이 현장 입고 (작업 완료 시각 자동 처리용) */
    async function autoReceiveFromWarehouseOut(outId, line) {
        if (!_canConfirmInbound(line)) return null;
        const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
        if (!out) return null;
        if (_findReceiveByOutId(outId)) return _findReceiveByOutId(outId);
        const want = _normLine(line || out.paintLine || out.line);
        const shipQty = Number(out.quantity) || 0;
        if (shipQty <= 0) return null;
        const today = UIUtils.today ? UIUtils.today() : '';
        try {
            return await receiveFromWarehouseOut(Object.assign({}, out, {
                paintLine: want,
                line: want
            }), {
                actualQty: shipQty,
                useDate: today,
                receivedBy: _currentActorLabel() || '자동입고'
            });
        } catch (e) {
            console.warn('[PaintingInput] autoReceiveFromWarehouseOut failed:', e);
            return null;
        }
    }

    let _autoInboundBusy = false;

    /** 생산계획 작업 완료 시각(endTime) 경과 시 미입고 건 자동 입고 */
    async function runAutoSiteInbound(line) {
        const want = _normLine(line);
        if (!_canConfirmInbound(want) || _autoInboundBusy) return { processed: 0 };
        const today = UIUtils.today ? UIUtils.today() : '';
        const nowHm = _nowHm();
        const pending = listTodayWarehouseShipments(want, today).filter(function (r) { return !r.received; });
        if (!pending.length) return { processed: 0 };

        _autoInboundBusy = true;
        let processed = 0;
        try {
            for (let i = 0; i < pending.length; i++) {
                const r = pending[i];
                const endTime = getPlanEndTimeForShipment(r, want, today);
                if (!endTime || nowHm < endTime) continue;
                const rec = await autoReceiveFromWarehouseOut(r.id, want);
                if (rec) processed++;
            }
            if (processed > 0) {
                UIUtils.toast('작업 완료 시각 도달 — 자동 입고 ' + processed + '건 처리', 'success');
                _refreshInboundViews();
            }
        } finally {
            _autoInboundBusy = false;
        }
        return { processed: processed };
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
        const colSpan = compact ? 5 : 13;
        const today = UIUtils.today ? UIUtils.today() : '';
        const planTotal = getTodayLinePlanTotal(want, today);
        const varianceTotal = totalQty - planTotal;

        if (!list.length) {
            return {
                itemCount: 0,
                pendingCount: 0,
                doneCount: 0,
                total: 0,
                planTotal: planTotal,
                varianceTotal: varianceTotal,
                html: `<tr><td colspan="${colSpan}" style="text-align:center;padding:20px;color:var(--text-muted);">
                    금일 자재 창고에서 ${_esc(want)}로 출고된 자재가 없습니다.
                </td></tr>`
            };
        }

        if (compact) {
            const canMove = _canMoveShipmentLine();
            const otherLine = want === '도장-B' ? '도장-A' : '도장-B';
            const html = list.map(function (r) {
                const stamp = _outDisplayStamp(r);
                const outDt = _splitDateTime(stamp);
                const timeTxt = (outDt.day !== '-' ? outDt.day : '')
                    + (outDt.time !== '-' ? ' ' + outDt.time : '');
                const muted = r.received ? 'opacity:0.55;' : '';
                const canDrag = canMove && !r.received && !!r.id;
                const title = r.received
                    ? '입고 완료 — 이동 불가'
                    : (canDrag ? '⋮⋮ 핸들을 드래그하여 ' + otherLine + '로 이동' : '라인 이동 권한 없음');
                const handleHtml = canDrag
                    ? `<span class="pp-ship-drag-handle" draggable="true"
                            data-ship-out-id="${_esc(r.id || '')}"
                            data-ship-from="${_esc(want)}"
                            title="드래그하여 ${ _esc(otherLine) }로 이동"
                            style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
                                   cursor:grab;border-radius:6px;color:var(--text-muted);user-select:none;
                                   -webkit-user-drag:element;touch-action:none;">
                            <span class="material-symbols-outlined" style="font-size:18px;pointer-events:none;">drag_indicator</span>
                       </span>`
                    : `<span style="display:inline-block;width:28px;color:var(--text-muted);opacity:0.35;">·</span>`;
                return `<tr data-ship-out-id="${_esc(r.id || '')}"
                    data-ship-from="${_esc(want)}"
                    data-ship-draggable="${canDrag ? '1' : '0'}"
                    title="${_esc(title)}"
                    style="${muted}">
                    <td style="white-space:nowrap;padding:6px 4px 6px 8px;width:34px;">${handleHtml}</td>
                    <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(timeTxt.trim() || '-')}</td>
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
                planTotal: planTotal,
                varianceTotal: varianceTotal,
                html: html
            };
        }

        const html = list.map(function (r) {
            const recv = r.receiveRec || null;
            const planQty = getPlanQtyForShipment(r, want, today);
            const shipQty = Number(r.quantity) || 0;
            const endTime = getPlanEndTimeForShipment(r, want, today);
            // 미입고: 창고 출고일시(라인 대기 시작) · 입고완료: 현장 입고일시
            // A↔B 이동 후에도 출고일시는 유지되므로 빈칸("-")이 되지 않음
            const stamp = r.received
                ? ((recv && (recv.receivedAt || recv.date)) || _outDisplayStamp(r))
                : _outDisplayStamp(r);
            const dt = _splitDateTime(stamp);
            const lotNo = _primaryLot(r);
            const inspDate = _resolveInspDate(r.partName, lotNo, r.inspDate, inspMap);
            const statusHtml = r.received
                ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.12);color:#16a34a;">입고완료</span>'
                : '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.12);color:#ea580c;">미입고</span>';
            const actionHtml = r.received
                ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;white-space:nowrap;"
                        title="도장일·생산계획 매칭 확인"
                        onclick="PaintingInputModule.openInboundMatchView('${_esc((recv && recv.id) || r.id)}','${_esc(want)}')">보기</button>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${_esc((recv && recv.receivedBy) || '-')}</span>
                   </div>`
                : (canWrite
                    ? `<button type="button" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:0.78rem;white-space:nowrap;"
                        onclick="${confirmFn}('${_esc(r.id)}','${_esc(want)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 입고 처리
                       </button>`
                    : '<span style="font-size:0.75rem;color:var(--text-muted);">입력 권한 필요</span>');
            const endHint = endTime && !r.received
                ? ' title="작업 완료 ' + _esc(endTime) + ' 이후 자동 입고"'
                : '';
            return `<tr${endHint}>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(dt.day)}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(dt.time)}</td>
                <td style="white-space:nowrap;padding:8px 10px;"><strong>${_esc(r.carModel || '-')}</strong></td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.partName || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${_esc(r.color || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">${_esc(lotNo || '-')}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(inspDate)}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">${_fmt(shipQty)}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;">${planQty ? _fmt(planQty) : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;">${_fmtVarianceHtml(shipQty, planQty)}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${_esc(endTime || '—')}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${statusHtml}</td>
                <td style="white-space:nowrap;padding:8px 10px;">${actionHtml}</td>
            </tr>`;
        }).join('');

        return {
            itemCount: list.length,
            pendingCount: pending.length,
            doneCount: done.length,
            total: totalQty,
            planTotal: planTotal,
            varianceTotal: varianceTotal,
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

    /** 도장일 기준 현장 입고(분출) 수량 — 작업 실적 매칭용
     *  opts: { carModel, partName, color, date, lots[], injPartName }
     */
    function getIssuedQtyForWork(line, opts) {
        opts = opts || {};
        const want = _normLine(line);
        const day = String(opts.date || '').slice(0, 10);
        if (!day) return 0;

        const lotSet = {};
        (opts.lots || []).forEach(function (l) {
            const n = String((l && l.lotNo) || '').trim();
            if (n) lotSet[n] = true;
        });
        if (opts.lotNo) lotSet[String(opts.lotNo).trim()] = true;
        const hasLots = Object.keys(lotSet).length > 0;

        const injNames = {};
        if (opts.injPartName) injNames[String(opts.injPartName).trim()] = true;
        if (opts.partName) injNames[String(opts.partName).trim()] = true;
        // 제품명 → 사출자재 매핑
        try {
            const mats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
            mats.forEach(function (m) {
                if (!m || !m.injPartName) return;
                if (opts.carModel && m.carModel && m.carModel !== opts.carModel) return;
                const mfg1 = String(m.mfgProductName || '').trim();
                const mfg2 = String(m.mfgProductName2 || '').trim();
                if (opts.partName && (mfg1 === opts.partName || mfg2 === opts.partName)) {
                    injNames[String(m.injPartName).trim()] = true;
                }
            });
        } catch (e) { /* ignore */ }

        let total = 0;
        (_recordsForLine(want) || []).forEach(function (r) {
            if (String(r.type || '') !== '입고') return;
            const rDay = String(r.useDate || r.date || '').slice(0, 10);
            if (rDay !== day) return;
            if (opts.carModel && r.carModel && r.carModel !== opts.carModel) return;

            const rLots = Array.isArray(r.lots) && r.lots.length
                ? r.lots
                : [{ lotNo: r.lotNo, qty: Number(r.quantity) || 0 }];

            if (hasLots) {
                rLots.forEach(function (l) {
                    const n = String(l.lotNo || '').trim();
                    if (n && lotSet[n]) total += Number(l.qty) || 0;
                });
                return;
            }

            const rPart = String(r.partName || '').trim();
            if (rPart && injNames[rPart]) {
                total += Number(r.quantity) || 0;
            }
        });
        return total;
    }

    function _findInboundRecord(refId) {
        if (!refId) return null;
        const byId = Storage.getById(STORE, refId);
        if (byId && String(byId.type || '') === '입고') return byId;
        return _findReceiveByOutId(refId);
    }

    /** 입고완료 보기 — 도장일·생산계획 선택으로 매칭 확인 */
    function openInboundMatchView(refId, line) {
        const recv = _findInboundRecord(refId);
        if (!recv) {
            UIUtils.toast('입고 기록을 찾을 수 없습니다.', 'error');
            return;
        }
        const want = _normLine(line || recv.line || recv.paintLine);
        const defaultDate = String(recv.useDate || recv.date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const lotNo = _primaryLot(recv);
        const qty = Number(recv.quantity) || 0;

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-blue);">fact_check</span> 자재 분출 · 매칭 확인`,
            `
            <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.55;">
                <div><strong>${_esc(want)}</strong> · ${_esc(recv.carModel || '-')} · ${_esc(recv.partName || '-')}${recv.color ? ' · ' + _esc(recv.color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">
                    LOT <span style="font-family:monospace;font-weight:700;">${_esc(lotNo || '-')}</span>
                    · 분출수량 <strong style="color:var(--accent-blue);">${_fmt(qty)} EA</strong>
                    · 입고자 ${_esc(recv.receivedBy || '-')}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">도장일 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(지난 날짜도 선택 가능)</span></label>
                    <input type="date" class="form-input" id="piMatchPaintDate" value="${_esc(defaultDate)}"
                        onchange="PaintingInputModule.refreshInboundMatchPanel()">
                </div>
                <div class="form-group">
                    <label class="form-label">생산 계획
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(해당일 라인 계획)</span></label>
                    <select class="form-select" id="piMatchPlanId" onchange="PaintingInputModule.refreshInboundMatchPanel()">
                        <option value="">— 계획 선택 —</option>
                    </select>
                </div>
            </div>
            <div id="piMatchPanel" style="margin-top:8px;"></div>
            <input type="hidden" id="piMatchRecvId" value="${_esc(recv.id || '')}">
            <input type="hidden" id="piMatchLine" value="${_esc(want)}">
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            'lg'
        );
        setTimeout(function () { refreshInboundMatchPanel(); }, 60);
    }

    function refreshInboundMatchPanel() {
        const panel = document.getElementById('piMatchPanel');
        const dateEl = document.getElementById('piMatchPaintDate');
        const planSel = document.getElementById('piMatchPlanId');
        const recvId = ((document.getElementById('piMatchRecvId') || {}).value || '').trim();
        const line = ((document.getElementById('piMatchLine') || {}).value || '').trim();
        if (!panel || !dateEl || !planSel) return;

        const paintDate = String(dateEl.value || '').slice(0, 10);
        const want = _normLine(line);
        const recv = _findInboundRecord(recvId);
        const issuedQty = Number(recv && recv.quantity) || 0;

        const plans = (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [])
            .filter(function (p) {
                if (!p || String(p.date || '').slice(0, 10) !== paintDate) return false;
                return _normLine(p.line) === want;
            })
            .sort(function (a, b) {
                return String(a.startTime || '').localeCompare(String(b.startTime || ''))
                    || String(a.partName || '').localeCompare(String(b.partName || ''));
            });

        const curPlanId = planSel.value || '';
        planSel.innerHTML = '<option value="">— 계획 선택 (' + plans.length + '건) —</option>' +
            plans.map(function (p) {
                const label = (p.startTime || '') + '~' + (p.endTime || '')
                    + ' · ' + (p.carModel || '') + ' / ' + (p.partName || '')
                    + (p.color ? ' / ' + p.color : '')
                    + ' · 계획 ' + _fmt(p.planQty) + ' EA';
                const sel = p.id === curPlanId ? ' selected' : '';
                return '<option value="' + _esc(p.id) + '"' + sel + '>' + _esc(label) + '</option>';
            }).join('');

        const plan = curPlanId ? plans.find(function (p) { return p.id === curPlanId; }) : null;
        const works = (Storage.getAll(DB.STORES.PAINTING_WORK) || []).filter(function (w) {
            if (!w || String(w.date || '').slice(0, 10) !== paintDate) return false;
            if (_normLine(w.line) !== want) return false;
            if (plan) {
                if (w.planId && w.planId === plan.id) return true;
                if (w.carModel === plan.carModel && w.partName === plan.partName) return true;
                return false;
            }
            // 계획 미선택: 이 분출 자재와 LOT/품명 매칭되는 실적
            if (!recv) return false;
            const issued = getIssuedQtyForWork(want, {
                carModel: w.carModel,
                partName: w.partName,
                color: w.color,
                date: paintDate,
                lots: w.lots,
                lotNo: w.lotNo,
                injPartName: w.injPartName
            });
            return issued > 0 || (recv.carModel && w.carModel === recv.carModel);
        });

        const dayIssuedAll = getIssuedQtyForWork(want, {
            carModel: recv ? recv.carModel : '',
            partName: recv ? recv.partName : '',
            color: recv ? recv.color : '',
            date: paintDate,
            lots: recv ? recv.lots : [],
            lotNo: recv ? recv.lotNo : '',
            injPartName: recv ? recv.partName : ''
        });

        let workInputSum = 0;
        let workProdSum = 0;
        works.forEach(function (w) {
            workInputSum += Number(w.inputQty) || 0;
            workProdSum += Number(w.productionQty) || Number(w.inputQty) || 0;
        });

        const planQty = plan ? (Number(plan.planQty) || 0) : 0;
        const compareIssued = dayIssuedAll || issuedQty;
        const vsInput = compareIssued - workInputSum;
        const vsPlan = plan ? (compareIssued - planQty) : null;
        const loss = workInputSum - workProdSum;

        function diffBadge(diff, posLabel, negLabel) {
            if (diff == null || !Number.isFinite(diff)) return '<span style="color:var(--text-muted);">-</span>';
            if (Math.abs(diff) < 0.001) return '<span style="color:#16a34a;font-weight:700;">일치</span>';
            if (diff > 0) return '<span style="color:#d97706;font-weight:700;">' + posLabel + ' +' + _fmt(diff) + '</span>';
            return '<span style="color:#dc2626;font-weight:700;">' + negLabel + ' ' + _fmt(Math.abs(diff)) + '</span>';
        }

        const workRows = works.length
            ? works.map(function (w) {
                const inQ = Number(w.inputQty) || 0;
                const prQ = Number(w.productionQty) || 0;
                const issued = getIssuedQtyForWork(want, {
                    carModel: w.carModel, partName: w.partName, color: w.color,
                    date: paintDate, lots: w.lots, lotNo: w.lotNo, injPartName: w.injPartName
                });
                const xl = issued - inQ;
                const miss = inQ - prQ;
                return '<tr>' +
                    '<td style="white-space:nowrap;">' + _esc((w.startTime || '') + (w.endTime ? '~' + w.endTime : '')) + '</td>' +
                    '<td style="white-space:nowrap;">' + _esc(w.carModel || '-') + '</td>' +
                    '<td style="white-space:nowrap;">' + _esc(w.partName || '-') + '</td>' +
                    '<td style="text-align:right;font-weight:700;">' + _fmt(issued) + '</td>' +
                    '<td style="text-align:right;">' + _fmt(inQ) + '</td>' +
                    '<td style="text-align:right;">' + diffBadge(xl, '과잉', '유실') + '</td>' +
                    '<td style="text-align:right;font-weight:600;">' + _fmt(prQ) + '</td>' +
                    '<td style="text-align:right;">' + (miss > 0 ? '<span style="color:#dc2626;font-weight:700;">' + _fmt(miss) + '</span>' : (miss < 0 ? '<span style="color:#d97706;">' + _fmt(miss) + '</span>' : '0')) + '</td>' +
                    '</tr>';
            }).join('')
            : '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted);">해당일 매칭 실적이 없습니다. 도장일·생산계획을 확인하세요.</td></tr>';

        panel.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px;">
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);">이 건 분출</div>
                    <div style="font-size:1.15rem;font-weight:800;color:var(--accent-blue);">${_fmt(issuedQty)}</div>
                </div>
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);">당일 동품 분출 합</div>
                    <div style="font-size:1.15rem;font-weight:800;">${_fmt(dayIssuedAll)}</div>
                </div>
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);">선택 계획 수량</div>
                    <div style="font-size:1.15rem;font-weight:800;">${plan ? _fmt(planQty) : '-'}</div>
                </div>
                <div style="padding:10px 12px;background:var(--bg-secondary);border-radius:8px;text-align:center;">
                    <div style="font-size:0.72rem;color:var(--text-muted);">실적 투입 합</div>
                    <div style="font-size:1.15rem;font-weight:800;">${_fmt(workInputSum)}</div>
                </div>
            </div>
            <div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);font-size:0.82rem;display:flex;flex-wrap:wrap;gap:12px 18px;">
                <span>분출 vs 투입: ${diffBadge(vsInput, '과잉', '유실')}</span>
                ${plan ? '<span>분출 vs 계획: ' + diffBadge(vsPlan, '과잉', '부족') + '</span>' : ''}
                <span>투입 vs 완료(분실): ${loss > 0 ? '<strong style="color:#dc2626;">' + _fmt(loss) + ' EA</strong>' : (loss < 0 ? '<strong style="color:#d97706;">' + _fmt(loss) + '</strong>' : '<strong style="color:#16a34a;">0</strong>')}</span>
            </div>
            <div style="font-size:0.8rem;font-weight:700;margin-bottom:6px;">당일 작업 실적 매칭</div>
            <div class="data-table-wrapper" style="overflow:auto;max-height:280px;">
                <table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;">
                    <thead>
                        <tr>
                            <th style="white-space:nowrap;">시간</th>
                            <th style="white-space:nowrap;">차종</th>
                            <th style="white-space:nowrap;">품명</th>
                            <th style="text-align:right;white-space:nowrap;">자재 분출 수량</th>
                            <th style="text-align:right;white-space:nowrap;">투입수량</th>
                            <th style="text-align:right;white-space:nowrap;">과잉/유실</th>
                            <th style="text-align:right;white-space:nowrap;">완료수량</th>
                            <th style="text-align:right;white-space:nowrap;">분실</th>
                        </tr>
                    </thead>
                    <tbody>${workRows}</tbody>
                </table>
            </div>`;
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
        listPendingWarehouseShipments: listPendingWarehouseShipments,
        hasSiteInboundHistory: hasSiteInboundHistory,
        confirmSiteInbound: confirmSiteInbound,
        openConfirmSiteInboundModal: openConfirmSiteInboundModal,
        submitConfirmSiteInbound: submitConfirmSiteInbound,
        openInboundMatchView: openInboundMatchView,
        refreshInboundMatchPanel: refreshInboundMatchPanel,
        getIssuedQtyForWork: getIssuedQtyForWork,
        canConfirmInbound: _canConfirmInbound,
        groupStock: _groupStock,
        getLotsByInjPart: getLotsByInjPart,
        getLotsByCarPart: getLotsByCarPart,
        receiveFromWarehouseOut: receiveFromWarehouseOut,
        autoReceiveFromWarehouseOut: autoReceiveFromWarehouseOut,
        runAutoSiteInbound: runAutoSiteInbound,
        findPlansForShipment: findPlansForShipment,
        getPlanQtyForShipment: getPlanQtyForShipment,
        getPlanEndTimeForShipment: getPlanEndTimeForShipment,
        getTodayLinePlanTotal: getTodayLinePlanTotal,
        moveShipmentLine: moveShipmentLine,
        canMoveShipmentLine: _canMoveShipmentLine,
        normLine: _normLine
    };
})();

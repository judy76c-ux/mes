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
        // 도장 단계 없이 사출 → 레이져로 바로 가는 제품(paintLine==='레이져')을 무조건
        // '도장-A'로 뭉개면, 그 출고 건이 레이저 대기 입고 확인 목록과 도장-A 현장 사출
        // 입고 목록 양쪽에 동시에 뜨는 사고가 난다 — 레이져는 별도 값으로 유지해야
        // 아래 want 비교(=== '도장-A'/'도장-B')에서 자연히 걸러진다.
        if (/레이저|레이져|laser/i.test(s)) return '레이져';
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

    /** LOT 열 표시용 — _primaryLot()은 lots[]가 여러 건이어도 첫 LOT 하나만 반환하므로
     *  화면에는 그 LOT만 보이고 나머지는 숨겨진다(4-LOT 입고인데 1개만 보이는 사고).
     *  여러 LOT이면 LOT마다 수량을 같이 붙여서 전부 보여준다. */
    function _lotCellHtml(r) {
        if (Array.isArray(r.lots) && r.lots.length > 1) {
            return r.lots.map(function (l) {
                return _esc(l.lotNo || '-') + '(' + _fmt(l.qty) + ')';
            }).join(', ');
        }
        return _esc(_primaryLot(r) || '-');
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
        // 창고 입고 기록의 inspDate 폴백 — 검사 기록이 삭제/정리된 뒤에도 후공정에서
        // 수입검사일을 잃지 않게 한다. 최상위 lotNo만 보면 다중 LOT 입고의 나머지 LOT이
        // 통째로 누락되므로(1건에 3개 LOT이면 2개는 '-') lots[] 까지 훑는다.
        (Storage.getAll(DB.STORES.INJECTION_INVENTORY) || []).forEach(function (r) {
            if (String(r.type || '') === '출고' || !r.partName) return;
            const part = String(r.partName);
            const rows = (r.lots && r.lots.length)
                ? r.lots
                : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            rows.forEach(function (l) {
                const lotNo = String(l.lotNo || '').trim();
                if (!lotNo) return;
                const inspDate = l.inspDate || r.inspDate;
                if (!inspDate) return;
                const k = part + '||' + lotNo;
                if (!map[k]) map[k] = _dateKey(inspDate);
            });
        });
        return map;
    }

    // 우선순위: 레코드에 확정 저장된 계보(trace) → 레코드의 inspDate 평면 필드 → 조회 폴백.
    // trace 가 있으면 상위 기록이 지워져도, LOT이 재사용돼도 그 시점 값이 그대로 나온다.
    function _resolveInspDate(partName, lotNo, direct, inspMap, record) {
        if (typeof Trace !== 'undefined' && record) {
            const fromTrace = Trace.injInspDate(record);
            if (fromTrace) return _dateKey(fromTrace);
        }
        if (direct) return _dateKey(direct);
        const k = String(partName || '') + '||' + String(lotNo || '');
        return inspMap[k] || '-';
    }

    /** 사출자재 마스터 기준 "사내생산"(공급처=사내) 품목인가 — 이런 품목은 애초에
     *  외부 수입검사 대상이 아니므로 수입검사일이 없는 게 정상이다. */
    function _isInHouseInjMaterial(carModel, partName, color) {
        if (typeof DB === 'undefined' || !DB.STORES || !DB.STORES.INJECTION_MATERIALS) return false;
        const car = String(carModel || '').trim();
        const part = String(partName || '').trim();
        if (!car || !part) return false;
        const col = String(color || '').trim();
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        let candidates = materials.filter(function (m) {
            return String(m.carModel || '').trim() === car
                && String(m.injPartName || m.partName || '').trim() === part;
        });
        if (col) {
            const byColor = candidates.filter(function (m) {
                const mc = String(m.injColor || m.color || '').trim();
                return !mc || mc === col;
            });
            if (byColor.length) candidates = byColor;
        }
        if (!candidates.length) return false;
        return candidates.every(function (m) { return String(m.supplier || '').trim() === '사내'; });
    }

    /** 수입검사일 셀 — 사내생산품은 "-"(누락처럼 보임) 대신 "사내생산" 배지로 명시한다.
     *  실제 외부 입고품인데 매칭이 안 된 경우만 순수 "-"로 남아 진짜 이상 신호로 보이게 한다. */
    function _inspDateCellHtml(record, lotNo, inspMap) {
        const inspDate = _resolveInspDate(record.partName, lotNo, record.inspDate, inspMap, record);
        if (inspDate !== '-') return _esc(inspDate);
        if (_isInHouseInjMaterial(record.carModel, record.partName, record.color)) {
            return '<span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;' +
                'background:rgba(100,116,139,.12);color:var(--text-secondary);white-space:nowrap;" ' +
                'title="사내 생산품 — 외부 수입검사 대상이 아닙니다">사내생산</span>';
        }
        return '-';
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
            const inspDateHtml = _inspDateCellHtml(r, lotNo, inspMap);
            const autoTag = r.isAutoReceived
                ? ' <span style="font-size:0.62rem;font-weight:700;padding:1px 5px;border-radius:999px;background:rgba(37,99,235,0.12);color:#2563eb;" title="계획 종료시각 경과로 시스템이 자동 확정">자동</span>'
                : '';
            return '<tr>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(dt.day) + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + _esc(dt.time) + autoTag + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;"><strong>' + _esc(r.carModel || '-') + '</strong></td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.partName || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;">' + _esc(r.color || '-') + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">' + _lotCellHtml(r) + '</td>' +
                '<td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">' + inspDateHtml + '</td>' +
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
    function getLotsByInjPart(line, injPartName, planColor, carModel) {
        const want = _normLine(line);
        const all = _recordsForLine(want);
        const byProduct = {};
        all.forEach(function (r) {
            if (injPartName && String(r.partName || '') !== String(injPartName)) return;
            // carModel 없이 injPartName만 걸러내면, 같은 사출명을 쓰는 다른 차종의 LOT까지
            // 이 차종 작업의 "현장 두입 LOT 선택"에 섞여 들어온다 — 실제로 이 사고가 있었다
            // (① 창고→도장현장 입고 표는 LOT 1개인데 ②LOT 드롭다운엔 무관한 LOT이 더 보임).
            if (carModel && String(r.carModel || '') !== String(carModel)) return;
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

    /** 컬러 비교 — 사출 소재 컬러는 "BK+CLEAR"처럼 도장 후공정 표기가 붙어 오고, 계획·창고
     *  쪽은 "BLACK"으로 들어온다. 문자열 그대로 비교하면 같은 색인데도 전부 불일치가 된다.
     *  UIUtils.normalizeColorAlias가 BK/BK+CLEAR/블랙 → black 으로 정규화해 준다. */
    function _colorLooseMatch(a, b) {
        var x = String(a || '').trim();
        var y = String(b || '').trim();
        if (!x || !y) return true;
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.normalizeColorAlias === 'function') {
            return UIUtils.normalizeColorAlias(x) === UIUtils.normalizeColorAlias(y);
        }
        return x.toLowerCase() === y.toLowerCase();
    }

    /** 리워크 재공품 → 도장현장으로 출고된 LOT 번호 집합.
     *  현장 입고 기록의 isReworkInbound 플래그는 이 기능이 생긴 뒤 확인된 건에만 붙어 있어,
     *  그전에 입고 처리된 건이나 자동 입고 경로로 들어온 건은 리워크인데도 플래그가 없다.
     *  실제 출고 원장(REWORK_WIP)의 LOT과 대조해 그런 건까지 리워크로 인식한다. */
    function _reworkDispatchedLotSet(carModel, partName, color) {
        var set = {};
        if (!DB.STORES || !DB.STORES.REWORK_WIP) return set;
        (Storage.getAll(DB.STORES.REWORK_WIP) || []).forEach(function (r) {
            if (!r || String(r.type || '') !== '출고') return;
            if (String(r.source || '') !== 'dispatch_to_line') return;
            if (carModel && String(r.carModel || '').trim() !== String(carModel).trim()) return;
            if (partName && String(r.partName || '').trim() !== String(partName).trim()) return;
            if (color && !_colorLooseMatch(r.color, color)) return;
            var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : [];
            var names = lots.map(function (l) { return String((l && l.lotNo) || '').trim(); });
            names.push(String(r.lotNo || '').trim());
            try {
                if (typeof Trace !== 'undefined') names.push(String((Trace.of(r).inj || {}).lot || '').trim());
            } catch (e) { /* ignore */ }
            names.forEach(function (n) { if (n) set[n] = true; });
        });
        return set;
    }

    function _isReworkInboundRecord(r, lotSet) {
        if (r.isReworkInbound || r.refReworkOutId) return true;
        if (/리워크/.test(String(r.source || ''))) return true;
        var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
        return lots.some(function (l) { return lotSet[String((l && l.lotNo) || '').trim()]; });
    }

    /** 이 입고 기록이 리워크 재공품에서 온 것인지 — 화면 배지 표시용(painting.js). */
    function isReworkSiteInbound(record) {
        if (!record) return false;
        if (record.isReworkInbound || record.refReworkOutId) return true;
        if (/리워크/.test(String(record.source || ''))) return true;
        var lotSet = _reworkDispatchedLotSet(record.carModel, record.partName, record.color);
        return _isReworkInboundRecord(record, lotSet);
    }

    /** 리워크 재공품 → 도장현장 경로로 실제 입고 확인(현장 입고 처리)된 뒤 아직 생산에
     *  소진되지 않은 잔량(도장-A + 도장-B 합산). IL 등 리워크 투입품은 재공품 재고에서는
     *  출고돼 사라졌지만 도장현장에는 이미 도착·확인돼 있는 구간이 있는데, 사출 창고 「현장
     *  입고 부족」 판정이 재공품 재고(ReworkWipModule.getStockQty)만 보면 이 구간을 놓쳐
     *  이미 현장에 있는 자재를 중복으로 "부족"이라 잡는다. 이 함수로 그 구간을 메운다. */
    function getReworkSiteBalance(carModel, partName, color) {
        var lotSet = _reworkDispatchedLotSet(carModel, partName, color);
        if (!Object.keys(lotSet).length) return 0;
        var lines = ['도장-A', '도장-B'];
        var total = 0;
        lines.forEach(function (line) {
            var records = _recordsForLine(line).filter(function (r) {
                if (carModel && String(r.carModel || '').trim() !== String(carModel).trim()) return false;
                if (partName && String(r.partName || '').trim() !== String(partName).trim()) return false;
                if (color && !_colorLooseMatch(r.color, color)) return false;
                // 입고는 리워크 경로 건만, 출고(생산 투입·반납)는 전부 차감 대상으로 본다.
                if (String(r.type || '') === '입고' && !_isReworkInboundRecord(r, lotSet)) return false;
                return true;
            });
            var bal = (typeof InvCalc !== 'undefined' && InvCalc.lotBalances) ? InvCalc.lotBalances(records) : { total: 0 };
            total += Math.max(0, Number(bal.total) || 0);
        });
        return total;
    }

    /** getLotsByCarPart와 달리 InvCalc 스필오버 잔량(balance>0)으로 거르지 않고, 이 차종·
     *  사출명으로 "입고" 기록이 한 번이라도 있었던 LOT을 전부 반환한다 — 다른 LOT 출고가
     *  스필오버로 이 LOT 잔량을 갉아먹어 0으로 보이는 경우에도(반납 화면처럼 LOT별 정확
     *  원장(getExactLotLedger)으로 실제 잔량을 다시 계산해야 하는 화면에서) 후보에서 아예
     *  누락되지 않도록 하기 위함이다. */
    function getReceivedLotNosByCarPart(line, carModel, partName) {
        const want = _normLine(line);
        const records = _recordsForLine(want).filter(function (r) {
            if (String(r.type || '') !== '입고') return false;
            if (carModel && String(r.carModel || '') !== String(carModel)) return false;
            if (partName && String(r.partName || '') !== String(partName)) return false;
            return true;
        });
        const lotMap = {};
        records.forEach(function (r) {
            const es = (Array.isArray(r.lots) && r.lots.length)
                ? r.lots
                : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            es.forEach(function (e) {
                const lotNo = String((e && e.lotNo) || '').trim();
                if (!lotNo) return;
                if (!lotMap[lotNo]) {
                    lotMap[lotNo] = { lotNo: lotNo, partName: r.partName || '', carModel: r.carModel || '', color: r.color || '' };
                }
            });
        });
        return Object.values(lotMap).sort(function (a, b) { return String(a.lotNo).localeCompare(String(b.lotNo)); });
    }

    /** LOT별 "정확히 그 LOT 번호로 기록된" 입고/출고만 집계 — InvCalc.lotBalances가 하는
     *  교차 LOT FIFO 스필오버(한 LOT 출고량이 그 LOT 잔량을 넘으면 다른 오래된 LOT에서
     *  끌어다 채우는 동작)를 거치지 않는다. 전체 재고 총량 계산에는 스필오버가 맞지만,
     *  "이 LOT으로 실제 얼마나 입고됐고 얼마나 빠졌는지"(반납 대상 LOT을 정확히 짚어야 하는
     *  화면)에는 스필오버가 엉뚱한 LOT에 잔량을 몰아줘서 오히려 틀린 그림을 보여준다. */
    function getExactLotLedger(line, carModel, partName, lotNo) {
        const want = _normLine(line);
        const targetLot = String(lotNo || '').trim();
        let received = 0;
        let consumed = 0;
        _recordsForLine(want).forEach(function (r) {
            if (carModel && String(r.carModel || '') !== String(carModel)) return;
            if (partName && String(r.partName || '') !== String(partName)) return;
            const es = (Array.isArray(r.lots) && r.lots.length)
                ? r.lots
                : (r.lotNo ? [{ lotNo: r.lotNo, qty: r.quantity }] : []);
            es.forEach(function (e) {
                if (String((e && e.lotNo) || '').trim() !== targetLot) return;
                const qty = Number(e && e.qty) || 0;
                if (qty <= 0) return;
                if (String(r.type || '') === '출고') consumed += qty;
                else received += qty;
            });
        });
        return { received: received, consumed: consumed, balance: received - consumed };
    }

    /** 사출 창고 생산출고 → 현장 입고 처리 시 도장 투입 재고 반영
     *  opts: { actualQty, useDate, receivedBy, lots }
     *  opts.lots를 주면(LOT별 실수량 직접 확인) 그 값을 그대로 쓴다 — 안 주면 기존처럼
     *  actualQty 총량을 원래 LOT 비율대로 나눠 배분한다(_scaleLotsToQty).
     */
    async function receiveFromWarehouseOut(outRec, opts) {
        opts = opts || {};
        if (!outRec) return null;
        const isRework = !!(outRec.isReworkDispatch || String(outRec.source || '') === 'dispatch_to_line');
        const line = _normLine(outRec.paintLine || outRec.line);
        const shipQty = Number(outRec.quantity) || Number(outRec.qty) || 0;
        let lots;
        let qty;
        if (Array.isArray(opts.lots) && opts.lots.length) {
            lots = opts.lots.map(function (l) {
                return { lotNo: String((l && l.lotNo) || outRec.lotNo || '').trim() || '무표기', qty: Math.max(0, Number(l && l.qty) || 0) };
            }).filter(function (l) { return l.qty > 0; });
            qty = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        } else {
            qty = opts.actualQty != null ? Math.max(0, Number(opts.actualQty) || 0) : shipQty;
            lots = Array.isArray(outRec.lots) && outRec.lots.length
                ? outRec.lots.map(function (l) {
                    return { lotNo: String(l.lotNo || outRec.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 };
                }).filter(function (l) { return l.qty > 0; })
                : [{ lotNo: String(outRec.lotNo || '').trim() || '무표기', qty: shipQty }];
            lots = _scaleLotsToQty(lots, qty);
        }
        if (qty <= 0) return null;
        if (outRec.id) {
            if (isRework) {
                const existRw = _findReceiveByReworkOutId(outRec.id);
                if (existRw) return existRw;
            } else {
                const existInj = _findReceiveByOutId(outRec.id);
                if (existInj) return existInj;
            }
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
            source: isRework ? '리워크 재공품 출고' : '사출 창고 생산출고',
            refOutId: isRework ? '' : (outRec.id || ''),
            refReworkOutId: isRework ? (outRec.id || '') : undefined,
            siteReceived: true,
            isAutoReceived: !!opts.isAutoReceived,
            isReworkInbound: !!isRework,
            receivedBy: actor || outRec.outgoingBy || '',
            receivedAt: UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '),
            note: outRec.note || outRec.memo || '',
            trace: outRec.trace || undefined
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

    /** 리워크 재공 출고(refReworkOutId)에 대한 현장 입고 확인 건 */
    function _findReceiveByReworkOutId(outId) {
        if (!outId) return null;
        return (Storage.getAll(STORE) || []).find(function (r) {
            return String(r.refReworkOutId || '') === String(outId) && String(r.type || '') === '입고';
        }) || null;
    }

    function _parseLineFromReworkNote(note) {
        const m = String(note || '').match(/\(도장-[AB]\)\s*$/);
        return m ? String(m[0]).replace(/[()]/g, '').trim() : '';
    }

    /** 리워크 WIP 출고 레코드를 현장 입고 표와 같은 shape으로 맞춤 */
    function _shapeReworkShipment(r) {
        if (!r) return null;
        const line = _normLine(r.paintLine || r.line || _parseLineFromReworkNote(r.note));
        const qty = Math.max(0, Number(r.qty) || Number(r.quantity) || 0);
        let lotNo = String(r.lotNo || '').trim();
        try {
            if (!lotNo && typeof Trace !== 'undefined') {
                lotNo = String((Trace.of(r).inj || {}).lot || '').trim();
            } else if (!lotNo && r.trace && r.trace.inj) {
                lotNo = String(r.trace.inj.lot || '').trim();
            }
        } catch (e) { /* ignore */ }
        const lots = (Array.isArray(r.lots) && r.lots.length)
            ? r.lots
            : [{ lotNo: lotNo || '무표기', qty: qty }];
        if (!lotNo && lots[0]) lotNo = String(lots[0].lotNo || '').trim();
        return Object.assign({}, r, {
            quantity: qty,
            lots: lots,
            lotNo: lotNo || (lots[0] && lots[0].lotNo) || '',
            paintLine: line,
            line: line,
            isReworkDispatch: true,
            outgoingType: '리워크출고',
            source: '리워크 재공품 출고'
        });
    }

    function listTodayReworkShipments(line, date) {
        const want = _normLine(line);
        const today = date || (UIUtils.today ? UIUtils.today() : '');
        if (!DB.STORES || !DB.STORES.REWORK_WIP) return [];
        return (Storage.getAll(DB.STORES.REWORK_WIP) || []).filter(function (r) {
            if (!r || String(r.type || '') !== '출고') return false;
            if (String(r.source || '') !== 'dispatch_to_line') return false;
            const rLine = _normLine(r.paintLine || r.line || _parseLineFromReworkNote(r.note));
            if (rLine !== want) return false;
            return String(r.date || '').slice(0, 10) === today;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        }).map(function (r) {
            const shaped = _shapeReworkShipment(r);
            const recv = _findReceiveByReworkOutId(r.id);
            return Object.assign({}, shaped, {
                received: !!recv,
                receiveRec: recv || null
            });
        });
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

    /** 금일 자재창고→해당 라인 생산출고 + 리워크 재공 현장출고 목록 (+ 현장 입고 여부) */
    function listTodayWarehouseShipments(line, date) {
        const want = _normLine(line);
        const today = date || (UIUtils.today ? UIUtils.today() : '');
        const injStore = DB.STORES.INJECTION_INVENTORY;
        const inj = (Storage.getAll(injStore) || []).filter(function (r) {
            if (String(r.type || '') !== '출고') return false;
            const oType = String(r.outgoingType || '');
            const src = String(r.source || '');
            if (oType !== '생산출고' && src !== '사출 창고 생산출고') return false;
            if (_normLine(r.paintLine || r.line) !== want) return false;
            return String(r.date || '').slice(0, 10) === today;
        }).map(function (r) {
            const recv = _findReceiveByOutId(r.id);
            return Object.assign({}, r, {
                received: !!recv,
                receiveRec: recv || null
            });
        });
        const rework = listTodayReworkShipments(want, today);
        return inj.concat(rework).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
    }

    /** 최근 N일 생산출고·리워크 출고 중 현장 미입고 건 (실적 LOT 부족 진단용) */
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
        const inj = (Storage.getAll(injStore) || []).filter(function (r) {
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
        }).map(function (r) {
            return Object.assign({}, r, { received: false, receiveRec: null });
        });

        let rework = [];
        if (DB.STORES && DB.STORES.REWORK_WIP) {
            rework = (Storage.getAll(DB.STORES.REWORK_WIP) || []).filter(function (r) {
                if (!r || String(r.type || '') !== '출고') return false;
                if (String(r.source || '') !== 'dispatch_to_line') return false;
                const rLine = _normLine(r.paintLine || r.line || _parseLineFromReworkNote(r.note));
                if (rLine !== want) return false;
                const day = String(r.date || '').slice(0, 10);
                if (!day || day < start || day > end) return false;
                if (opts.carModel && String(r.carModel || '') !== String(opts.carModel)) return false;
                if (opts.partName && String(r.partName || '') !== String(opts.partName)) return false;
                if (_findReceiveByReworkOutId(r.id)) return false;
                return true;
            }).map(function (r) {
                return Object.assign({}, _shapeReworkShipment(r), { received: false, receiveRec: null });
            });
        }

        return inj.concat(rework).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
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

    /** 입고 확인용 출고 레코드 — 사출창고 생산출고 또는 리워크 재공 현장출고 */
    function _resolveOutboundForInbound(outId) {
        if (!outId) return null;
        let out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
        if (out) {
            return {
                out: out,
                isRework: false,
                already: _findReceiveByOutId(outId)
            };
        }
        if (DB.STORES && DB.STORES.REWORK_WIP) {
            out = Storage.getById(DB.STORES.REWORK_WIP, outId);
            if (out && String(out.source || '') === 'dispatch_to_line') {
                return {
                    out: _shapeReworkShipment(out),
                    isRework: true,
                    already: _findReceiveByReworkOutId(outId)
                };
            }
        }
        return null;
    }

    function _canAdminCorrectInbound() {
        if (typeof AuthModule === 'undefined') return true;
        if (typeof AuthModule.isAdminUser === 'function' && AuthModule.isAdminUser()) return true;
        return false;
    }

    /** 입고 처리 진입 — 사용일·실수량 확인 모달 후 저장
     *  opts.useDate: 사용 예정일 기본값 (지난 실적 보정 시 계획일) */
    function confirmSiteInbound(outId, line, opts) {
        return openConfirmSiteInboundModal(outId, line, opts);
    }

    function openConfirmSiteInboundModal(outId, line, opts) {
        opts = opts || {};
        if (!_canConfirmInbound(line)) {
            UIUtils.toast('도장작업 입력 권한이 있는 사용자만 입고 처리할 수 있습니다.', 'warning');
            return null;
        }
        const resolved = _resolveOutboundForInbound(outId);
        if (!resolved || !resolved.out) {
            UIUtils.toast('출고 기록을 찾을 수 없습니다.', 'error');
            return null;
        }
        if (resolved.already) {
            UIUtils.toast('이미 입고 처리된 건입니다.', 'info');
            return resolved.already;
        }
        const out = resolved.out;
        const want = _normLine(line || out.paintLine || out.line);
        const shipQty = Number(out.quantity) || Number(out.qty) || 0;
        const today = UIUtils.today ? UIUtils.today() : '';
        const shipDay = String(out.date || '').slice(0, 10);
        const defaultUseDate = String(opts.useDate || '').slice(0, 10)
            || (shipDay && today && shipDay < today ? shipDay : today)
            || today;
        const stamp = _outDisplayStamp(out);
        const outDt = _splitDateTime(stamp);
        const outLots = (Array.isArray(out.lots) && out.lots.length)
            ? out.lots.map(function (l) { return { lotNo: String(l.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 }; }).filter(function (l) { return l.qty > 0; })
            : [{ lotNo: String(out.lotNo || '').trim() || '무표기', qty: shipQty }];
        const hasMultiLot = outLots.length > 1;
        const srcHint = resolved.isRework
            ? '<div style="margin-top:6px;font-size:0.78rem;color:#7c3aed;font-weight:700;">리워크 재공품 출고 — 현장 입고 확인 후 투입 가능</div>'
            : '';

        // LOT이 여러 건이면 실수량도 LOT별로 따로 확인해야 한다 — 총량 한 칸만 고치면
        // 어느 LOT이 실제로 모자란지 모른 채 비례 배분(_scaleLotsToQty)으로 뭉개져 버린다.
        const qtyFieldHtml = hasMultiLot
            ? `<div class="form-group">
                <label class="form-label">LOT별 실수량 (EA) <span style="color:var(--accent-red)">*</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(확인 후 LOT별로 수정 가능)</span></label>
                <div id="piInboundLotRows" style="background:var(--bg-secondary);border-radius:8px;padding:8px 10px;">
                    ${outLots.map(function (l) {
                        return `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;align-items:center;margin-bottom:5px;">
                            <span style="font-family:monospace;font-size:0.86rem;">${_esc(l.lotNo)}</span>
                            <input type="number" class="form-input pi-inbound-lot-qty" data-lot="${_esc(l.lotNo)}"
                                value="${l.qty}" min="0" max="${l.qty}" step="1"
                                oninput="this.value=Math.min(Math.max(parseInt(this.value,10)||0,0),${l.qty});PaintingInputModule._updateInboundLotTotal();"
                                style="text-align:right;font-weight:700;">
                        </div>`;
                    }).join('')}
                </div>
                <div style="margin-top:6px;font-size:0.82rem;color:var(--text-secondary);text-align:right;">
                    합계 <strong id="piInboundLotTotal" style="color:var(--text-primary);">${_fmt(shipQty)}</strong> / 출고수량 ${_fmt(shipQty)} EA
                </div>
               </div>`
            : `<div class="form-group">
                <label class="form-label">실수량 (EA) <span style="color:var(--accent-red)">*</span>
                    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(확인 후 수정 가능)</span></label>
                <input type="number" class="form-input" id="piInboundActualQty" min="1" max="${shipQty}" step="1"
                    value="${shipQty}"
                    oninput="this.value=Math.min(Math.max(parseInt(this.value,10)||0,1),${shipQty})"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();PaintingInputModule.submitConfirmSiteInbound();}">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">출고수량 ${_fmt(shipQty)} EA 이하로 입력하세요.</div>
               </div>`;

        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;color:var(--accent-blue);">move_to_inbox</span> 현장 입고 확인` +
            (resolved.isRework ? ' <span style="font-size:0.78rem;color:#7c3aed;">(리워크)</span>' : ''),
            `
            <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;line-height:1.55;">
                <div><strong>${_esc(want)}</strong> · ${_esc(out.carModel || '-')} · ${_esc(out.partName || '-')}${out.color ? ' · ' + _esc(out.color) : ''}</div>
                <div style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">
                    ${resolved.isRework ? '리워크 출고' : '창고 출고'}: ${_esc(outDt.day)}${outDt.time !== '-' ? ' ' + _esc(outDt.time) : ''}
                    · LOT <span style="font-family:monospace;font-weight:700;">${_lotCellHtml(out)}</span>
                    · 출고수량 <strong>${_fmt(shipQty)} EA</strong>
                </div>
                ${srcHint}
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사용 예정일 <span style="color:var(--accent-red)">*</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(언제 사용할 자재인지 · 기본 당일)</span></label>
                    <input type="date" class="form-input" id="piInboundUseDate" value="${_esc(defaultUseDate)}"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();PaintingInputModule.submitConfirmSiteInbound();}">
                </div>
                ${qtyFieldHtml}
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
            const qtyEl = document.getElementById('piInboundActualQty') || document.querySelector('.pi-inbound-lot-qty');
            if (qtyEl) qtyEl.focus();
        }, 80);
        return null;
    }

    /** LOT별 실수량 입력을 고칠 때마다 합계를 즉시 다시 계산해 보여준다 */
    function _updateInboundLotTotal() {
        const total = Array.prototype.reduce.call(
            document.querySelectorAll('#piInboundLotRows .pi-inbound-lot-qty'),
            function (s, el) { return s + (Number(el.value) || 0); },
            0
        );
        const label = document.getElementById('piInboundLotTotal');
        if (label) label.textContent = _fmt(total);
    }

    async function submitConfirmSiteInbound() {
        const outId = ((document.getElementById('piInboundOutId') || {}).value || '').trim();
        const line = ((document.getElementById('piInboundLine') || {}).value || '').trim();
        const useDate = ((document.getElementById('piInboundUseDate') || {}).value || '').trim().slice(0, 10);
        const shipQty = Number((document.getElementById('piInboundShipQty') || {}).value) || 0;
        const lotInputs = document.querySelectorAll('#piInboundLotRows .pi-inbound-lot-qty');
        let actualQty;
        let lotOverride = null;

        if (!outId) { UIUtils.toast('출고 정보를 확인할 수 없습니다.', 'error'); return; }
        if (!useDate) {
            UIUtils.toast('사용 예정일을 선택하세요.', 'warning');
            document.getElementById('piInboundUseDate')?.focus();
            return;
        }

        if (lotInputs.length) {
            lotOverride = [];
            lotInputs.forEach(function (el) {
                const q = Number(el.value) || 0;
                if (q > 0) lotOverride.push({ lotNo: el.getAttribute('data-lot') || '', qty: q });
            });
            actualQty = lotOverride.reduce(function (s, l) { return s + l.qty; }, 0);
            if (actualQty <= 0) {
                UIUtils.toast('LOT별 실수량을 1개 이상 입력하세요.', 'warning');
                return;
            }
        } else {
            actualQty = Number((document.getElementById('piInboundActualQty') || {}).value) || 0;
            if (actualQty <= 0) {
                UIUtils.toast('실수량을 1 이상 입력하세요.', 'warning');
                document.getElementById('piInboundActualQty')?.focus();
                return;
            }
        }
        if (shipQty > 0 && actualQty > shipQty) {
            UIUtils.toast(`실수량은 출고수량(${_fmt(shipQty)} EA)을 초과할 수 없습니다.`, 'warning');
            return;
        }

        if (!_canConfirmInbound(line)) {
            UIUtils.toast('도장작업 입력 권한이 있는 사용자만 입고 처리할 수 있습니다.', 'warning');
            return;
        }
        const resolved = _resolveOutboundForInbound(outId);
        if (!resolved || !resolved.out) {
            UIUtils.toast('출고 기록을 찾을 수 없습니다.', 'error');
            return;
        }
        if (resolved.already) {
            UIUtils.toast('이미 입고 처리된 건입니다.', 'info');
            UIUtils.closeModal();
            _refreshInboundViews();
            return;
        }

        const out = resolved.out;
        const want = _normLine(line || out.paintLine || out.line);
        try {
            const rec = await receiveFromWarehouseOut(Object.assign({}, out, {
                paintLine: want,
                line: want,
                isReworkDispatch: !!resolved.isRework
            }), {
                actualQty: actualQty,
                lots: lotOverride || undefined,
                useDate: useDate,
                receivedBy: _currentActorLabel()
            });
            UIUtils.closeModal();
            if (rec) {
                const qtyNote = actualQty !== shipQty
                    ? ` (출고 ${_fmt(shipQty)} → 실수량 ${_fmt(actualQty)} EA)`
                    : '';
                UIUtils.toast((resolved.isRework ? '리워크 ' : '') + `현장 입고 처리 완료 · 사용일 ${useDate}${qtyNote}`, 'success');
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
        try {
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.renderPlanSummary === 'function') {
                PaintingWorkModule.renderPlanSummary();
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof PaintingWorkModule !== 'undefined' && typeof PaintingWorkModule.renderUnenteredPlans === 'function') {
                PaintingWorkModule.renderUnenteredPlans();
            }
        } catch (e) { /* ignore */ }
    }

    function _nowHm() {
        const d = new Date();
        const p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // 사출명(injPartName) → 제품명(PRODUCTION_PLANS.partName) 역매핑.
    // 차종까지 엄격히 맞춰 먼저 시도하고, 그걸로 하나도 못 찾으면 차종 조건을 풀어서 재시도한다.
    // painting.js의 정방향 매핑(getInjPartNamesForProduct, "계획→사출명" LOT 드롭다운에 씀)은
    // 이미 이렇게 4단계로 차종을 점점 느슨하게 풀며 폴백하는데, 이 역방향 매핑엔 그 폴백이
    // 없어서 사출자재 마스터의 차종 값이 계획과 정확히 안 맞으면(오탈자·차종 공유 등) LOT
    // 드롭다운은 정상인데 계획수량 매칭만 "—"로 실패하는 비대칭이 있었다.
    function _resolveProductNamesFromInjPart(carModel, injPartName) {
        const inj = String(injPartName || '').trim();
        const collect = function (matchCarModel) {
            const names = {};
            if (inj) names[inj] = true;
            (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []).forEach(function (m) {
                if (!m || !m.injPartName) return;
                if (matchCarModel && carModel && m.carModel && m.carModel !== carModel) return;
                if (String(m.injPartName).trim() !== inj) return;
                const mfg1 = String(m.mfgProductName || '').trim();
                const mfg2 = String(m.mfgProductName2 || '').trim();
                if (mfg1) names[mfg1] = true;
                if (mfg2) names[mfg2] = true;
            });
            return names;
        };
        try {
            const strict = collect(true);
            // inj 자기 자신만 있어도 아래 정방향 매칭에서 다시 잡을 수 있다.
            // 제품명이 하나라도 더 붙었으면 그걸 우선 반환.
            if (Object.keys(strict).length > 1) return strict;
            const loose = collect(false);
            return Object.keys(loose).length > 1 ? loose : strict;
        } catch (e) {
            const names = {};
            if (inj) names[inj] = true;
            return names;
        }
    }

    /** 계획 품명 → 사출명 정방향 집합 (역매핑 실패 시 보완) */
    function _resolveInjPartNamesFromProduct(carModel, planPartName) {
        const part = String(planPartName || '').trim();
        const names = {};
        if (!part) return names;
        const collect = function (matchCarModel) {
            (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []).forEach(function (m) {
                if (!m || !m.injPartName) return;
                if (matchCarModel && carModel && m.carModel && m.carModel !== carModel) return;
                const mfg1 = String(m.mfgProductName || '').trim();
                const mfg2 = String(m.mfgProductName2 || '').trim();
                if (mfg1 !== part && mfg2 !== part) return;
                names[String(m.injPartName).trim()] = true;
            });
        };
        try {
            collect(true);
            if (!Object.keys(names).length) collect(false);
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

    /**
     * 같은 시작시각 계획이 여러 건이면 최신 1건만 남긴다.
     * 생산계획을 수정하면 구 문서가 그대로 남는 구조라, 걸러내지 않으면 옛 계획까지
     * 합산되어 계획수량·오차가 부풀려진다. (생산계획 현황 카드와 동일한 규칙)
     */
    function _dedupePlansBySlot(plans) {
        const bySlot = {};
        const noSlot = [];
        (plans || []).forEach(function (p) {
            const key = String((p && (p.startTime || p.slot)) || '').trim();
            if (!key) { noSlot.push(p); return; }
            const prev = bySlot[key];
            if (!prev) { bySlot[key] = p; return; }
            const newer = String(p.updatedAt || p.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')
                || (!(prev.updatedAt || prev.createdAt) && String(p.id || '') > String(prev.id || ''));
            if (newer) bySlot[key] = p;
        });
        return Object.values(bySlot).concat(noSlot);
    }

    /** 금일 생산계획 중 출고 건과 매칭되는 계획 목록 (수정으로 대체된 구 계획은 제외) */
    function findPlansForShipment(record, line, date) {
        if (!record) return [];
        const today = String(date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const want = _normLine(line || record.paintLine || record.line);
        const rawPlans = (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || []).filter(function (p) {
            if (!p || String(p.date || '').slice(0, 10) !== today) return false;
            return _normLine(p.line) === want;
        });
        const plans = _dedupePlansBySlot(rawPlans);

        if (record.planId) {
            const byId = rawPlans.find(function (p) { return p.id === record.planId; });
            if (byId) {
                // 출고 시점의 계획이 이후 수정돼 대체됐다면 현재 유효한 계획으로 따라간다.
                // (계획 16,590 → 9,000 으로 줄였는데 출고가 옛 문서를 가리켜 오차가 허수로 뜨는 문제)
                const slot = String(byId.startTime || byId.slot || '').trim();
                const current = slot
                    ? plans.find(function (p) { return String(p.startTime || p.slot || '').trim() === slot; })
                    : null;
                return [current || byId];
            }
        }
        const car = String(record.carModel || '').trim();
        const injPart = String(record.partName || '').trim();
        const productNames = _resolveProductNamesFromInjPart(car, injPart);

        // record.color는 사출 소재 컬러(예: WHITE)고 p.color는 도장 컬러(예: AZ3)라 서로
        // 다른 개념이다 — 흰 원료가 AZ3로 도장되는 게 정상이므로 여기서 직접 비교하면 항상
        // 불일치해 매칭이 통째로 실패한다(계획수량 "—" 표시 원인). carModel+제품명 매핑으로
        // 이미 충분히 좁혀지므로 컬러는 비교하지 않는다.
        const matched = plans.filter(function (p) {
            if (car && p.carModel && p.carModel !== car) return false;
            const pPart = String(p.partName || '').trim();
            if (!pPart) return true;
            // ① 역매핑: 사출명 → 계획 품명
            if (productNames[pPart] || pPart === injPart) return true;
            // ② 정방향: 계획 품명 → 사출명에 이 출고 사출명이 있으면 매칭
            //    (마스터에 제품명만 등록되고 역매핑 키가 안 잡히는 경우 보완)
            if (injPart) {
                const injNames = _resolveInjPartNamesFromProduct(p.carModel || car, pPart);
                if (injNames[injPart]) return true;
            }
            return false;
        });
        if (matched.length) return matched;

        // ③ 같은 차종·라인에 유효 계획이 1건뿐이면 그 계획으로 폴백
        //    (사출자재 마스터 미등록이어도 헤더 계획합계와 행 계획수량이 어긋나지 않게)
        const sameCar = plans.filter(function (p) {
            return !car || !p.carModel || String(p.carModel).trim() === car;
        });
        if (sameCar.length === 1) return sameCar;
        return [];
    }

    /** 계획수량 근거 — 어떤 계획을 몇 건 더했는지 툴팁으로 보여준다 (허수 오차 추적용) */
    function _planBreakdownText(record, line, date) {
        const plans = findPlansForShipment(record, line, date);
        if (!plans.length) return '매칭된 계획 없음';
        const lines = plans.map(function (p) {
            const slot = String(p.startTime || p.slot || '').trim();
            const end = String(p.endTime || '').trim();
            return (slot ? slot + (end ? '~' + end : '') + ' · ' : '')
                + (p.partName || '-') + ' · ' + (Number(p.planQty) || 0).toLocaleString('ko-KR') + ' EA';
        });
        const total = plans.reduce(function (s, p) { return s + (Number(p.planQty) || 0); }, 0);
        return '계획 ' + plans.length + '건 합산 (수정으로 대체된 구 계획 제외)\n'
            + lines.join('\n')
            + '\n합계 ' + total.toLocaleString('ko-KR') + ' EA';
    }

    function getPlanQtyForShipment(record, line, date) {
        return findPlansForShipment(record, line, date).reduce(function (s, p) {
            return s + (Number(p.planQty) || 0);
        }, 0);
    }

    // 계획수량이 "-"로 뜰 때 왜 매칭이 안 됐는지 바로 알 수 있게(마우스 오버) 진단 문구를 만든다.
    function _debugPlanMatchInfo(record, line, date) {
        try {
            const today = String(date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
            const want = _normLine(line || record.paintLine || record.line);
            const allTodayPlans = (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || []).filter(function (p) {
                return p && String(p.date || '').slice(0, 10) === today;
            });
            const sameLine = allTodayPlans.filter(function (p) { return _normLine(p.line) === want; });
            const sameLineCar = sameLine.filter(function (p) { return String(p.carModel || '').trim() === String(record.carModel || '').trim(); });
            const productNames = _resolveProductNamesFromInjPart(record.carModel, record.partName);
            const planPartsToday = sameLineCar.map(function (p) { return p.partName || '-'; }).join(', ') || '(없음)';
            return '오늘(' + today + ')·' + want + ' 계획 ' + allTodayPlans.length + '건 중 같은 라인 ' + sameLine.length + '건, 같은 차종(' + (record.carModel || '-') + ') ' + sameLineCar.length + '건. ' +
                '그 계획들의 품명: ' + planPartsToday + ' | 이 사출자재(' + (record.partName || '-') + ')로 매칭 시도한 제품명 후보: ' + (Object.keys(productNames).join(', ') || '(없음 — 사출자재 마스터에 매핑 없음)');
        } catch (e) {
            return '진단 오류: ' + (e && e.message ? e.message : e);
        }
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
        const plans = (Storage.getAll(DB.STORES.PRODUCTION_PLANS) || []).filter(function (p) {
            if (!p || String(p.date || '').slice(0, 10) !== today) return false;
            return _normLine(p.line) === want;
        });
        // 수정으로 대체된 구 계획을 빼야 계획 카드 합계와 일치한다
        return _dedupePlansBySlot(plans).reduce(function (s, p) {
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
        const resolved = _resolveOutboundForInbound(outId);
        if (!resolved || !resolved.out) return null;
        if (resolved.already) return resolved.already;
        const out = resolved.out;
        const want = _normLine(line || out.paintLine || out.line);
        const shipQty = Number(out.quantity) || Number(out.qty) || 0;
        if (shipQty <= 0) return null;
        const today = UIUtils.today ? UIUtils.today() : '';
        try {
            return await receiveFromWarehouseOut(Object.assign({}, out, {
                paintLine: want,
                line: want,
                isReworkDispatch: !!resolved.isRework
            }), {
                actualQty: shipQty,
                useDate: today,
                receivedBy: _currentActorLabel() || '자동입고',
                isAutoReceived: true
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
            const inspDateHtml = _inspDateCellHtml(r, lotNo, inspMap);
            const isAutoReceived = !!(recv && recv.isAutoReceived);
            const reworkTag = r.isReworkDispatch
                ? '<span style="margin-left:4px;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(124,58,237,0.12);color:#7c3aed;">리워크</span>'
                : '';
            const statusHtml = r.received
                ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.12);color:#16a34a;">입고완료</span>'
                    + (isAutoReceived
                        ? '<span style="margin-left:4px;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(37,99,235,0.12);color:#2563eb;" title="계획 종료시각 경과로 시스템이 자동 확정 — 실물 LOT별 수량 확인이 안 됐을 수 있습니다">자동입고</span>'
                        : '')
                    + reworkTag
                : '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.12);color:#ea580c;">미입고</span>' + reworkTag;
            const autoScheduleLabel = (!r.received && endTime)
                ? (function () {
                    const m = String(endTime).match(/^(\d{1,2}):(\d{2})/);
                    if (!m) return String(endTime) + '에 자동입고 처리예정';
                    return Number(m[1]) + '시' + m[2] + '분에 자동입고 처리예정';
                })()
                : '';
            const actionHtml = r.received
                ? `<div style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
                    <button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;white-space:nowrap;"
                        title="도장일·생산계획 매칭 확인"
                        onclick="PaintingInputModule.openInboundMatchView('${_esc((recv && recv.id) || r.id)}','${_esc(want)}')">보기</button>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${_esc((recv && recv.receivedBy) || '-')}${isAutoReceived ? ' (자동)' : ''}</span>
                   </div>`
                : (canWrite
                    ? `<div style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
                        <button type="button" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:0.78rem;white-space:nowrap;"
                            onclick="${confirmFn}('${_esc(r.id)}','${_esc(want)}')">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 입고 처리
                        </button>` +
                        (autoScheduleLabel
                            ? `<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;" title="계획 완료시각 경과 시 자동 입고 처리">${_esc(autoScheduleLabel)}</span>`
                            : '') +
                       `</div>`
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
                <td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-size:0.8rem;">${_lotCellHtml(r)}</td>
                <td style="white-space:nowrap;padding:8px 10px;font-size:0.82rem;">${inspDateHtml}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;font-weight:800;">${_fmt(shipQty)}</td>
                <td style="text-align:right;white-space:nowrap;padding:8px 10px;">${planQty
                    ? '<span style="cursor:help;border-bottom:1px dotted var(--text-muted);" title="' + _esc(_planBreakdownText(r, want, today)) + '">' + _fmt(planQty) + '</span>'
                    : '<span style="color:var(--text-muted);cursor:help;border-bottom:1px dotted var(--text-muted);" title="' + _esc(_debugPlanMatchInfo(r, want, today)) + '">—</span>'}</td>
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

    /** 도장 생산일이 지난 사출 LOT 현장 잔량을 0 처리한다.
     *  keepByLot: 이번 도장작업일 입고분 중 이월로 남길 수량. 그 외 잔량은 출고(0 처리)로 떨어낸다. */
    async function writeOffExpiredSiteLots(opts) {
        opts = opts || {};
        const line = _normLine(opts.line);
        const carModel = String(opts.carModel || '').trim();
        const partName = String(opts.partName || '').trim();
        const color = String(opts.color || '').trim();
        const keepByLot = opts.keepByLot || {};
        if (!line || !carModel || !partName) return null;

        const currentLots = getLotsByCarPart(line, carModel, partName) || [];
        const writeLots = [];
        currentLots.forEach(function (l) {
            const lotNo = String((l && l.lotNo) || '').trim();
            if (!lotNo) return;
            const keep = Math.max(0, Number(keepByLot[lotNo]) || 0);
            const bal = Math.max(0, Number(l.balance) || 0);
            const off = Math.floor(bal - keep + 1e-9);
            if (off > 0) writeLots.push({ lotNo: lotNo, qty: off });
        });
        if (!writeLots.length) return null;

        const totalQty = writeLots.reduce(function (s, l) { return s + l.qty; }, 0);
        const now = UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ');
        const actor = _currentActorLabel();
        return Storage.add(STORE, {
            date: now,
            type: '출고',
            line: line,
            paintLine: line,
            carModel: carModel,
            partName: partName,
            color: color,
            lots: writeLots,
            lotNo: writeLots[0].lotNo,
            quantity: totalQty,
            unit: 'EA',
            source: '도장일 경과 0 처리',
            isExpiredWriteOff: true,
            refWorkId: opts.workId || '',
            note: '도장 생산일이 지난 사출 LOT 잔량 0 처리'
                + (opts.workDate ? ' (' + String(opts.workDate).slice(0, 10) + ' 이전)' : ''),
            receivedBy: actor
        });
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

    /**
     * 이 LOT이 이미 도장 작업에 투입된 적이 있는가 — 있으면 "생산이 끝난 뒤 남은 잔량"이다.
     * 이 경우 잔량은 (a) 실물이 진짜 남았거나 (b) 실적 투입수량을 적게 등록해 장부에만 남은 것
     * 둘 중 하나인데 시스템은 구분할 수 없다. (b)를 반납하면 사출창고에 없는 재고가 생기므로
     * 화면에 표시해 실물 확인을 강제한다.
     */
    function _lotUsedInProduction(line, carModel, partName, lotNo) {
        const want = _normLine(line);
        const lot = String(lotNo || '').trim();
        if (!lot) return false;
        return (_recordsForLine(want) || []).some(function (r) {
            if (!r || String(r.type || '') === '입고') return false;
            if (!/작업 투입/.test(String(r.source || ''))) return false;
            if (carModel && r.carModel && String(r.carModel) !== String(carModel)) return false;
            if (partName && r.partName && String(r.partName) !== String(partName)) return false;
            const rows = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            return rows.some(function (l) { return String(l.lotNo || '').trim() === lot; });
        });
    }

    /** 기준일로부터 경과 일수 (날짜 불명이면 null) — 오래 방치된 잔량을 눈에 띄게 하기 위함 */
    function _daysSinceDate(dateLike) {
        const day = String(dateLike || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
        const from = new Date(day + 'T00:00:00');
        const to = new Date(String(UIUtils.today ? UIUtils.today() : '').slice(0, 10) + 'T00:00:00');
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
        return Math.max(0, Math.round((to - from) / 86400000));
    }

    function renderForLine(container, line) {
        const want = _normLine(line);
        const accent = _lineAccent(want);
        const items = _groupStock(want);
        const total = items.reduce(function (s, g) { return s + g.stock; }, 0);
        const paintingNav = (typeof PaintingNavUI !== 'undefined' && PaintingNavUI.render)
            ? PaintingNavUI.render('painting-input', '')
            : '';

        // LOT 단위로 펼쳐 각 행에서 바로 반납할 수 있게 한다.
        // 반납 입구가 "도장 실적의 계획 미달 블록" 하나뿐이라, 실적 저장 후에 남은 자재를
        // 발견하면 되돌릴 방법이 없었다(그 수량이 계속 '유실'로 잡힘).
        const lotRows = [];
        items.forEach(function (g) {
            (g.lots || []).forEach(function (l) {
                if (!(Number(l.qty) > 0)) return;
                lotRows.push({
                    carModel: g.carModel, partName: g.partName, color: g.color || '',
                    lotNo: l.lotNo, qty: Number(l.qty) || 0, date: l.date || ''
                });
            });
        });

        const rows = lotRows.length
            ? lotRows.map(function (r) {
                const days = _daysSinceDate(r.date);
                const dayColor = days >= 7 ? 'var(--accent-red)' : (days >= 3 ? '#b45309' : 'var(--text-muted)');
                const used = _lotUsedInProduction(want, r.carModel, r.partName, r.lotNo);
                return `<tr${used ? ' style="background:rgba(180,83,9,.05);"' : ''}>
                    <td><strong>${_esc(r.carModel)}</strong></td>
                    <td>${_esc(r.partName)}</td>
                    <td>${_esc(r.color || '-')}</td>
                    <td style="font-family:monospace;font-weight:700;">${_esc(r.lotNo)}
                        ${used ? `<div style="font-size:0.68rem;font-weight:700;color:#b45309;"
                            title="이 LOT은 이미 도장 작업에 투입된 적이 있습니다. 남은 수량이 실물인지, 실적 투입수량을 적게 등록한 것인지 확인이 필요합니다.">
                            생산 완료분 · 실물 확인 필요</div>` : ''}</td>
                    <td style="text-align:right;font-weight:800;color:${accent};">${_fmt(r.qty)}</td>
                    <td style="white-space:nowrap;font-size:0.8rem;">
                        ${r.date ? _esc(String(r.date).slice(0, 10)) : '-'}
                        ${days != null ? `<div style="font-size:0.7rem;font-weight:${days >= 3 ? '700' : '400'};color:${dayColor};">${days}일 경과</div>` : ''}
                    </td>
                    <td style="text-align:center;white-space:nowrap;font-size:0.76rem;color:var(--text-muted);"
                        title="반납은 이 자재를 실제로 사용한 도장 실적의 「보기」에서 그 실적 몫으로만 처리합니다.">
                        ${used ? '생산 투입됨' : '미투입'}
                    </td>
                </tr>`;
            }).join('')
            : `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted);">
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
                    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;">${want} 현장 잔량 (투입 대기 자재)</h4>
                        <span style="font-size:0.76rem;color:var(--text-muted);">
                            현장 입고 − 작업 투입 − 반납 = 잔량.
                            <strong>미투입 LOT</strong>은 여기서 바로 반납하고,
                            <strong>생산에 투입된 LOT</strong>은 해당 실적 「보기」에서 그 실적 몫으로 반납합니다.
                        </span>
                    </div>
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>차종</th><th>사출명</th><th>컬러</th><th>사출 LOT</th>
                                        <th style="text-align:right;">잔량(EA)</th><th>입고일</th>
                                        <th style="text-align:center;">작업</th>
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

    // shipDate가 없는(확인 처리를 늦게 한) 과거 기록은 useDate/date가 실제 입고일이 아니라
    // 확인 처리한 날짜라 도장일과 매칭이 안 될 수 있다 — refOutId로 원본 출고 기록을 찾아
    // 실제 일시로 대체한다. openMaterialHistory 등 다른 곳과 같은 방식.
    function _resolveActualInboundStamp(r) {
        if (r.shipDate) return String(r.shipDate);
        const outId = r.refOutId || '';
        if (outId) {
            try {
                const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, outId);
                if (out && out.date) return String(out.date);
            } catch (e) { /* 무시 */ }
        }
        return String(r.useDate || r.date || '');
    }

    /** 도장일 기준 현장 입고(분출) 수량 — 작업 실적 매칭용
     *  opts: { carModel, partName, color, date, lots[], injPartName }
     */
    // "사출현장입고수"가 "-"로 뜰 때 왜 매칭이 안 됐는지 화면 툴팁으로 바로 보여주기 위한 진단.
    // getIssuedQtyForWork와 정확히 같은 매칭 규칙을 그대로 따라가며 이유를 문장으로 남긴다.
    function _debugIssuedQtyInfo(line, opts) {
        try {
            opts = opts || {};
            const want = _normLine(line);
            const day = String(opts.date || '').slice(0, 10);
            if (!day) return '도장작업일이 없어 조회할 수 없습니다.';

            const workLots = [];
            (opts.lots || []).forEach(function (l) {
                const n = String((l && l.lotNo) || '').trim();
                if (n) workLots.push(n);
            });
            if (opts.lotNo) workLots.push(String(opts.lotNo).trim());
            const hasLots = workLots.length > 0;

            const sameDayCarLine = (_recordsForLine(want) || []).filter(function (r) {
                if (String(r.type || '') !== '입고') return false;
                if (_resolveActualInboundStamp(r).slice(0, 10) !== day) return false;
                if (opts.carModel && r.carModel && r.carModel !== opts.carModel) return false;
                return true;
            });
            const availLots = [];
            sameDayCarLine.forEach(function (r) {
                const rLots = Array.isArray(r.lots) && r.lots.length ? r.lots : [{ lotNo: r.lotNo, qty: r.quantity }];
                rLots.forEach(function (l) { if (l && l.lotNo) availLots.push(String(l.lotNo).trim()); });
            });

            if (opts.planId) {
                const withPlanId = sameDayCarLine.filter(function (r) {
                    if (!r.refOutId) return false;
                    const outRec = Storage.getById(DB.STORES.INJECTION_INVENTORY, r.refOutId);
                    return !!(outRec && String(outRec.planId || '') === String(opts.planId));
                });
                if (withPlanId.length) {
                    return 'planId(' + opts.planId + ') 매칭 성공 — 이 계획으로 출고된 입고 건 ' + withPlanId.length + '건을 합산했습니다.';
                }
                return 'planId(' + opts.planId + ')로 매칭되는 입고 건이 없어(원본 사출 출고에 이 계획ID가 안 걸려있음) LOT/품명 매칭으로 넘어갑니다. ' +
                    '이 실적의 LOT: ' + (workLots.join(', ') || '(없음)') + ' | 같은 날짜·차종·라인 입고 LOT: ' + (availLots.length ? availLots.join(', ') : '(없음)');
            }
            if (hasLots) {
                return '이 실적의 LOT: ' + (workLots.join(', ') || '(없음)') +
                    ' | 같은 날짜·차종·라인 입고 LOT: ' + (availLots.length ? availLots.join(', ') : '(없음)') +
                    ' — LOT번호가 정확히 일치해야 합산됩니다. LOT이 안 맞고, 같은 날짜·차종·사출명 실적이 이 건 말고 더 있으면(누구 몫인지 알 수 없어) "-"로 남깁니다.';
            }
            return '이 실적에 LOT이 입력되어 있지 않아 품명(사출명)으로 매칭합니다. ' +
                '같은 날짜·차종·라인 입고 건: ' + sameDayCarLine.length + '건. ' +
                '단, 같은 날짜·차종·사출명 실적이 이 건 말고 더 있으면 몫을 나눌 수 없어 "-"로 남깁니다.';
        } catch (e) {
            return '진단 오류: ' + (e && e.message ? e.message : e);
        }
    }

    /**
     * 이 작업 조건(일자·라인·차종·사출자재/LOT)으로 **사출창고에 반납된 수량**.
     * 자재과잉/유실은 `분출 − 투입`으로만 계산돼 왔는데, 남은 자재를 반납하면 그 수량이
     * 그대로 "유실"로 잡힌다(반납했는데 잃어버린 것으로 표시됨). 반납분은 빼야 한다.
     */
    // 반납은 작업일 당일이 아니라 다음날 등 나중에 처리되는 게 정상이다(현장 정리 후 반납,
    // 창고 확인 대기 등). 반납 레코드를 작업일과 같은 날짜로 제한하면, 하루만 지나도 이미
    // 반납된 수량을 "아직 반납 안 됨"으로 다시 세어 중복 반납을 유도하는 사고가 난다.
    // 그래서 날짜 대신 LOT 번호로만 범위를 좁힌다 — LOT은 그 자체로 유일한 실물 단위다.
    function getReturnedQtyForWork(line, opts) {
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
        const injPart = String(opts.injPartName || opts.partName || '').trim();

        let total = 0;
        (_recordsForLine(want) || []).forEach(function (r) {
            if (!r || String(r.type || '') === '입고') return;
            if (!/반납/.test(String(r.source || ''))) return;

            // ① 이 실적이 직접 만든 반납(「이 실적 몫 반납」)은 refWorkId로 확정 매칭한다.
            // LOT 기준 매칭만 쓰면, 이 실적이 투입한 LOT이 아니라 "같은 입고 배치의 다른
            // LOT"을 반납한 경우(예: LH 실적은 260623만 썼는데 같은 배치의 260625·260629를
            // 반납) 그 반납이 이 실적 소관인데도 LOT이 안 겹쳐 0으로 보이는 문제가 있었다.
            if (opts.workId && r.refWorkId && String(r.refWorkId) === String(opts.workId)) {
                total += Number(r.quantity) || 0;
                return;
            }
            if (r.refWorkId) return;   // 다른 실적이 만든 반납은 LOT매칭 폴백에서도 제외

            // LOT 정보가 있으면 LOT 번호로만 매칭(날짜 무관). LOT 정보가 없는 구 데이터일 때만
            // 날짜를 폴백 기준으로 쓴다.
            if (!hasLots && String(r.date || '').slice(0, 10) !== day) return;
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
            // LOT 정보가 없으면 사출자재명으로 매칭 (구 데이터 안전망)
            if (injPart && String(r.partName || '').trim() && String(r.partName || '').trim() !== injPart) return;
            total += Number(r.quantity) || 0;
        });
        return total;
    }

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

        const dayRecords = (_recordsForLine(want) || []).filter(function (r) {
            if (String(r.type || '') !== '입고') return false;
            if (_resolveActualInboundStamp(r).slice(0, 10) !== day) return false;
            if (opts.carModel && r.carModel && r.carModel !== opts.carModel) return false;
            return true;
        });

        // 0순위: planId 매칭 — 이 작업실적이 속한 생산계획(opts.planId)과 정확히 같은
        // planId로 사출창고에서 출고된 입고 건만 골라낸다. refOutId로 원본 사출 출고
        // 이력까지 거슬러 올라가 그 출고 건의 planId를 확인한다. LOT 번호 문자열이 어긋나도
        // (선입선출 자동배분·비례배분·수기수정 등으로 흔함) 이 매칭은 영향받지 않고, 같은 날
        // 같은 차종·품명 실적이 여러 건이어도 정확히 이 실적 몫만 구분되는 가장 신뢰도 높은
        // 매칭 방법이다.
        if (opts.planId && typeof DB !== 'undefined' && DB.STORES && DB.STORES.INJECTION_INVENTORY) {
            let planTotal = 0;
            let planMatched = false;
            dayRecords.forEach(function (r) {
                if (!r.refOutId) return;
                const outRec = Storage.getById(DB.STORES.INJECTION_INVENTORY, r.refOutId);
                if (outRec && outRec.planId && String(outRec.planId) === String(opts.planId)) {
                    planMatched = true;
                    planTotal += Number(r.quantity) || 0;
                }
            });
            if (planMatched) return planTotal;
        }

        let total = 0;
        if (hasLots) {
            dayRecords.forEach(function (r) {
                const rLots = Array.isArray(r.lots) && r.lots.length
                    ? r.lots
                    : [{ lotNo: r.lotNo, qty: Number(r.quantity) || 0 }];
                rLots.forEach(function (l) {
                    const n = String(l.lotNo || '').trim();
                    if (n && lotSet[n]) total += Number(l.qty) || 0;
                });
            });
        }
        // LOT번호로 못 찾았으면(또는 이 실적에 LOT이 아예 없으면) 사출명(품명) 기준으로도
        // 다시 시도한다 — 실적에 적힌 LOT번호 표기가 실제 입고 LOT과 달라도(과거 데이터,
        // 수기입력 오차 등) 실제로 입고된 자재를 "-"로 놓치지 않기 위한 안전망이다.
        if (total <= 0) {
            let fallbackTotal = 0;
            dayRecords.forEach(function (r) {
                const rPart = String(r.partName || '').trim();
                if (rPart && injNames[rPart]) fallbackTotal += Number(r.quantity) || 0;
            });
            // 같은 날짜·차종·사출명으로 등록된 작업실적이 이 건 말고 더 있으면, LOT 매칭
            // 실패한 이 fallback 총량은 "그날 입고된 전체"일 뿐 이 실적 몫이 얼마인지 알 수
            // 없다 — 그 전체 값을 모든 실적에 똑같이 찍으면(예: 16,920을 두 실적 다 표시)
            // 자재과잉/유실이 서로 뒤바뀐 것처럼 잘못 계산된다. 이 경우 안전하게 "-"로 남긴다.
            if (fallbackTotal > 0 && typeof DB !== 'undefined' && DB.STORES && DB.STORES.PAINTING_WORK) {
                const siblingCount = (Storage.getAll(DB.STORES.PAINTING_WORK) || []).filter(function (w) {
                    if (!w || w.id === opts.workId) return false;
                    if (String(w.date || '').slice(0, 10) !== day) return false;
                    if (_normLine(w.line || '') !== want) return false;
                    if (opts.carModel && w.carModel && w.carModel !== opts.carModel) return false;
                    const wPart = String(w.injPartName || w.partName || '').trim();
                    return wPart && injNames[wPart];
                }).length;
                if (siblingCount > 0) return 0;
            }
            total = fallbackTotal;
        }
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
                    LOT <span style="font-family:monospace;font-weight:700;">${_lotCellHtml(recv)}</span>
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

    // ──────────────────────────────────────────────
    // 도장현장 → 사출창고 자재 반납 ("재입고"가 아니라 "반납" — 도장현장에서 처리하는 즉시
    // 이 스토어(현장 재고)에서는 바로 빠지지만, 사출창고 재고로 정식 편입되는 건 사출창고
    // 물류담당자가 실물을 확인하고 「입고 처리」할 때뿐이다. 그 전까지는 "반납 대기" 상태.)
    // ──────────────────────────────────────────────

    /** 계획 미달 등으로 남은 도장현장 자재를 사출창고로 반납 처리 (반납 대기 상태로 기록) */
    async function createSiteReturn(opts) {
        opts = opts || {};
        const line = _normLine(opts.line);
        const carModel = String(opts.carModel || '').trim();
        const partName = String(opts.partName || '').trim();
        const color = String(opts.color || '').trim();
        const lots = (opts.lots || []).map(function (l) {
            return { lotNo: String((l && l.lotNo) || '').trim(), qty: Math.max(0, Number(l && l.qty) || 0) };
        }).filter(function (l) { return l.lotNo && l.qty > 0; });
        if (!carModel || !partName) throw new Error('차종/사출명이 없습니다.');
        if (!lots.length) throw new Error('반납할 LOT·수량이 없습니다.');
        const totalQty = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        const now = UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ');

        return Storage.add(STORE, {
            date: now,
            type: '출고',
            line: line,
            paintLine: line,
            carModel: carModel,
            partName: partName,
            color: color,
            lots: lots,
            lotNo: lots[0].lotNo,
            quantity: totalQty,
            unit: 'EA',
            source: '현장 반납',
            isSiteReturn: true,
            returnReason: opts.reason || '',
            returnStatus: 'pending',
            refWorkId: opts.workId || undefined,
            returnedBy: opts.returnedBy || '',
            // 실물 확인 여부 — 창고에서 「입고 처리」할 때 판단 근거가 된다
            physicalVerified: !!opts.physicalVerified,
            verifiedAt: opts.verifiedAt || ''
        });
    }

    /** 사출창고 물류담당자가 아직 확인(입고 처리)하지 않은 반납 목록 */
    function listPendingReturns(opts) {
        opts = opts || {};
        return (Storage.getAll(STORE) || []).filter(function (r) {
            if (!r || !r.isSiteReturn || r.returnStatus !== 'pending') return false;
            if (opts.line && _normLine(r.line || r.paintLine) !== _normLine(opts.line)) return false;
            return true;
        }).sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    }

    /** 사출창고 물류담당자의 「입고 처리」— 이 반납 건을 확정 상태로만 바꾼다.
     *  실제 사출창고 재고 증가(INJECTION_INVENTORY 입고 기록 생성)는 호출한 쪽(사출 창고 모듈)의 책임이다. */
    async function confirmSiteReturn(id, opts) {
        opts = opts || {};
        const rec = Storage.getById(STORE, id);
        if (!rec) throw new Error('반납 기록을 찾을 수 없습니다.');
        if (rec.returnStatus !== 'pending') return rec;
        const now = UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ');
        await Storage.update(STORE, id, {
            returnStatus: 'confirmed',
            returnConfirmedAt: now,
            returnConfirmedBy: opts.confirmedBy || ''
        });
        return rec;
    }

    /** 관리자 — 아직 「입고 처리」되지 않은(반납 대기) 반납 건을 통째로 취소한다.
     *  창고 재고에는 아직 아무것도 반영되지 않은 상태(pending)라 이 기록만 지우면 그만이다.
     *  잘못된 사유·수량으로 반납이 등록됐거나, 관련 없는 LOT까지 한꺼번에 묶여 나간 경우
     *  되돌리는 용도. */
    async function cancelSiteReturn(id) {
        if (!id) return false;
        const rec = Storage.getById(STORE, id);
        if (!rec || !rec.isSiteReturn) return false;
        if (rec.returnStatus !== 'pending') {
            throw new Error('이미 입고 처리된 반납은 취소할 수 없습니다. 되돌리기(revertSiteReturn)를 먼저 사용하세요.');
        }
        await Storage.remove(STORE, id);
        return true;
    }

    /** confirmSiteReturn을 되돌린다 — 컬러 없이 잘못 확정된 반납 건을 다시 "반납 대기"로
     *  되돌려, 사출창고 쪽의 (컬러 누락) 입고 레코드를 지운 뒤 이 반납을 재처리할 수 있게 한다. */
    async function revertSiteReturn(id) {
        if (!id) return null;
        const rec = Storage.getById(STORE, id);
        if (!rec) return null;
        if (rec.returnStatus !== 'confirmed') return rec;
        await Storage.update(STORE, id, {
            returnStatus: 'pending',
            returnConfirmedAt: '',
            returnConfirmedBy: ''
        });
        return rec;
    }

    /** 관리자 — 창고 출고 없이 현장 입고를 수기 등록 (지난 실적 소재입고 보정) */
    async function registerManualSiteInbound(payload) {
        payload = payload || {};
        if (!_canAdminCorrectInbound()) {
            UIUtils.toast('관리자만 과거 소재입고를 수기 등록할 수 있습니다.', 'warning');
            return null;
        }
        const line = _normLine(payload.line);
        const carModel = String(payload.carModel || '').trim();
        const partName = String(payload.partName || '').trim();
        const color = String(payload.color || '').trim();
        const useDate = String(payload.useDate || '').slice(0, 10);
        const qty = Math.max(0, Math.floor(Number(payload.quantity) || 0));
        const lotNo = String(payload.lotNo || '').trim() || '무표기';
        if (!line || !carModel || !partName || !useDate || qty < 1) {
            UIUtils.toast('라인, 차종, 사출명, 사용일, 수량은 필수입니다.', 'warning');
            return null;
        }
        const nowTime = (UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' ')).slice(11, 16);
        const stamp = useDate + (nowTime ? ' ' + nowTime : '');
        const actor = _currentActorLabel();
        const rec = await Storage.add(STORE, {
            date: stamp,
            useDate: useDate,
            shipDate: stamp,
            type: '입고',
            line: line,
            paintLine: line,
            carModel: carModel,
            partName: partName,
            color: color,
            lots: [{ lotNo: lotNo, qty: qty }],
            lotNo: lotNo,
            quantity: qty,
            shipQty: qty,
            unit: 'EA',
            source: '관리자 수기입고(과거실적)',
            siteReceived: true,
            isManualInbound: true,
            receivedBy: actor,
            receivedAt: UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '),
            note: String(payload.note || '').trim() || '지난 실적 소재입고 관리자 보정',
            planId: payload.planId || '',
            trace: payload.trace || undefined
        });
        _refreshInboundViews();
        return rec;
    }

    /** 관리자 — 기존 현장 입고의 사용일·수량·LOT 수정 */
    async function updateSiteInbound(id, patch) {
        patch = patch || {};
        if (!_canAdminCorrectInbound()) {
            UIUtils.toast('관리자만 입고 이력을 수정할 수 있습니다.', 'warning');
            return null;
        }
        const rec = Storage.getById(STORE, id);
        if (!rec) {
            UIUtils.toast('입고 이력을 찾을 수 없습니다.', 'error');
            return null;
        }
        const next = { updatedAt: new Date().toISOString(), updatedBy: _currentActorLabel() };
        if (patch.useDate) {
            const useDate = String(patch.useDate).slice(0, 10);
            const time = String(rec.date || '').slice(11, 16)
                || (UIUtils.now ? UIUtils.now().slice(11, 16) : '');
            next.useDate = useDate;
            next.date = useDate + (time ? ' ' + time : '');
        }
        if (patch.quantity != null && patch.quantity !== '') {
            next.quantity = Math.max(0, Math.floor(Number(patch.quantity) || 0));
        }
        const qty = next.quantity != null ? next.quantity : (Number(rec.quantity) || 0);
        if (patch.lotNo != null) {
            const lotNo = String(patch.lotNo).trim() || '무표기';
            next.lotNo = lotNo;
            next.lots = [{ lotNo: lotNo, qty: qty }];
        } else if (next.quantity != null && Array.isArray(rec.lots) && rec.lots.length === 1) {
            next.lots = [{ lotNo: rec.lots[0].lotNo, qty: qty }];
        }
        if (patch.note != null) next.note = String(patch.note || '').trim();
        if (patch.color != null) next.color = String(patch.color || '').trim();
        await Storage.update(STORE, id, next);
        _refreshInboundViews();
        return Storage.getById(STORE, id);
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
        registerManualSiteInbound: registerManualSiteInbound,
        updateSiteInbound: updateSiteInbound,
        canAdminCorrectInbound: _canAdminCorrectInbound,
        _updateInboundLotTotal: _updateInboundLotTotal,
        openInboundMatchView: openInboundMatchView,
        refreshInboundMatchPanel: refreshInboundMatchPanel,
        getIssuedQtyForWork: getIssuedQtyForWork,
        getReturnedQtyForWork: getReturnedQtyForWork,
        debugIssuedQtyInfo: _debugIssuedQtyInfo,
        canConfirmInbound: _canConfirmInbound,
        groupStock: _groupStock,
        getLotsByInjPart: getLotsByInjPart,
        getLotsByCarPart: getLotsByCarPart,
        getReworkSiteBalance: getReworkSiteBalance,
        isReworkSiteInbound: isReworkSiteInbound,
        getReceivedLotNosByCarPart: getReceivedLotNosByCarPart,
        getExactLotLedger: getExactLotLedger,
        deductForWork: deductForWork,
        writeOffExpiredSiteLots: writeOffExpiredSiteLots,
        createSiteReturn: createSiteReturn,
        listPendingReturns: listPendingReturns,
        confirmSiteReturn: confirmSiteReturn,
        cancelSiteReturn: cancelSiteReturn,
        revertSiteReturn: revertSiteReturn,
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

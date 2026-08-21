/**
 * 도장 투입 자재 (도장-A / 도장-B 현장 투입 재고)
 *
 * 사출 창고 생산출고 → 이 스토어로 입고 → 도장 작업 실적에서 LOT 선택·차감
 */
var PaintingInputModule = (function () {
    const STORE = DB.STORES.PAINTING_INPUT_INVENTORY;
    var _inboundInFlight = {};

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

    /** 창고 출고 수량 — quantity와 LOT 합계가 어긋나면 더 큰 쪽(화면 출고수량)을 따른다. */
    function _outShipQty(outRec) {
        const declared = Number(outRec && (outRec.quantity != null ? outRec.quantity : outRec.qty)) || 0;
        let lotSum = 0;
        if (Array.isArray(outRec && outRec.lots)) {
            outRec.lots.forEach(function (l) { lotSum += Number(l && l.qty) || 0; });
        }
        return Math.max(declared, lotSum);
    }

    /** 제작품명(T1XX KNOB LOWER)과 사출명(KNOB LOWER)을 같은 품목으로 본다. */
    function _partNamesMatch(stored, want, carModel) {
        var x = String(stored || '').trim();
        var y = String(want || '').trim();
        if (!y) return true;
        if (!x) return false;
        if (x === y) return true;
        var sa = String(x).toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '').match(/(\d+)spot/);
        var sb = String(y).toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '').match(/(\d+)spot/);
        if (sa && sb && sa[1] !== sb[1]) return false;
        if (typeof ReworkWipModule !== 'undefined') {
            if (typeof ReworkWipModule.partsMatch === 'function') {
                try { return !!ReworkWipModule.partsMatch(x, y, carModel); } catch (e) { /* fall through */ }
            }
            if (typeof ReworkWipModule.toInjPartName === 'function') {
                try {
                    var ix = ReworkWipModule.toInjPartName(carModel, x);
                    var iy = ReworkWipModule.toInjPartName(carModel, y);
                    if (ix && iy && ix === iy) return true;
                } catch (e2) { /* fall through */ }
            }
        }
        var na = x.toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '');
        var nb = y.toLowerCase().replace(/[\s\[\]\(\)\{\}\-_\/·.]/g, '');
        if (na.length >= 3 && nb.length >= 3 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) return true;
        return false;
    }
    function _toInjPartName(carModel, partName) {
        if (typeof ReworkWipModule !== 'undefined' && typeof ReworkWipModule.toInjPartName === 'function') {
            try {
                var n = ReworkWipModule.toInjPartName(carModel, partName);
                if (n) return n;
            } catch (e) { /* ignore */ }
        }
        return String(partName || '').trim();
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
                ? ' <span style="font-size:0.62rem;font-weight:700;padding:1px 5px;border-radius:999px;background:rgba(37,99,235,0.12);color:#2563eb;" title="계획 종료시각으로부터 ' + AUTO_INBOUND_DELAY_HOURS + '시간 경과로 시스템이 자동 확정">자동</span>'
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
            if (injPartName && !_partNamesMatch(r.partName, injPartName, carModel || r.carModel)) return;
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
            var colored = lots.filter(function (l) {
                if (!l.color) return true;
                return _colorLooseMatch(l.color, planColor);
            });
            if (colored.length) return colored;
        }
        return lots;
    }

    function getLotsByCarPart(line, carModel, partName) {
        const want = _normLine(line);
        const records = _recordsForLine(want).filter(function (r) {
            if (carModel && String(r.carModel || '') !== String(carModel)) return false;
            if (partName && !_partNamesMatch(r.partName, partName, carModel || r.carModel)) return false;
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
        var xl = x.toLowerCase().replace(/\s+/g, '');
        var yl = y.toLowerCase().replace(/\s+/g, '');
        if (xl === yl) return true;
        // BK+CLEAR ↔ CLEAR 처럼 한쪽이 다른 쪽을 포함하면 같은 색으로 본다.
        if (xl.length >= 3 && yl.length >= 3 && (xl.indexOf(yl) >= 0 || yl.indexOf(xl) >= 0)) return true;
        if (typeof UIUtils !== 'undefined' && typeof UIUtils.normalizeColorAlias === 'function') {
            return UIUtils.normalizeColorAlias(x) === UIUtils.normalizeColorAlias(y);
        }
        return false;
    }

    /** 재사용 자재 → 도장현장으로 출고된 LOT 번호 집합.
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
            if (partName && !_partNamesMatch(r.partName, partName, carModel || r.carModel)) return;
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
        if (/리워크|재사용 자재/.test(String(r.source || ''))) return true;
        var lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
        return lots.some(function (l) { return lotSet[String((l && l.lotNo) || '').trim()]; });
    }

    /** 이 입고 기록이 재사용 자재에서 온 것인지 — 화면 배지 표시용(painting.js). */
    function isReworkSiteInbound(record) {
        if (!record) return false;
        if (record.isReworkInbound || record.refReworkOutId) return true;
        if (/리워크|재사용 자재/.test(String(record.source || ''))) return true;
        var lotSet = _reworkDispatchedLotSet(record.carModel, record.partName, record.color);
        return _isReworkInboundRecord(record, lotSet);
    }

    /** 재사용 자재 → 도장현장 경로로 실제 입고 확인(현장 입고 처리)된 뒤 아직 생산에
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
                    if (partName && !_partNamesMatch(r.partName, partName, carModel || r.carModel)) return false;
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

    /** 리워크 재공 → 도장현장 입고 후 아직 실적에 안 쓴 LOT 잔량.
     *  레이져→도장-B 품목도 리워크는 레이져를 거치지 않고 바로 도장 투입할 수 있어야 한다. */
    function getSiteReworkLots(line, carModel, injPartName, color) {
        if (!injPartName && !carModel) return [];
        var lines = line ? [_normLine(line)] : ['도장-A', '도장-B'];
        var lotSet = _reworkDispatchedLotSet(carModel, injPartName, color);
        function collect(useColor) {
            var records = [];
            lines.forEach(function (want) {
                (_recordsForLine(want) || []).forEach(function (r) {
                    if (!r) return;
                    if (carModel && String(r.carModel || '').trim() !== String(carModel).trim()) return;
                    if (injPartName && !_partNamesMatch(r.partName, injPartName, carModel || r.carModel)) return;
                    if (useColor && color) {
                        if (!r.color || !_colorLooseMatch(r.color, color)) return;
                    }
                    if (String(r.type || '') === '입고' && !_isReworkInboundRecord(r, lotSet)) return;
                    records.push(r);
                });
            });
            return records;
        }
        var records = collect(true);
        var hasReworkIn = records.some(function (r) { return String(r.type || '') === '입고'; });
        if (!hasReworkIn) return [];
        var bal = (typeof InvCalc !== 'undefined' && InvCalc.lotBalances)
            ? InvCalc.lotBalances(records)
            : { lots: [] };
        return (bal.lots || []).filter(function (l) {
            return (Number(l.qty) || 0) > 0;
        }).map(function (l) {
            return {
                lotNo: l.lotNo,
                partName: injPartName || '',
                carModel: carModel || '',
                color: color || '',
                balance: Math.max(0, Number(l.qty) || 0),
                lotSource: 'site_rework'
            };
        }).sort(function (a, b) { return String(a.lotNo).localeCompare(String(b.lotNo)); });
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
            if (partName && !_partNamesMatch(r.partName, partName, carModel || r.carModel)) return false;
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
    // sinceDay(선택)를 주면 그 날짜 이전 기록은 아예 무시한다 — LOT번호(YYMMDD)가 다른 시점의
    // 배치에서 재사용될 수 있어서, sinceDay 없이 전체 이력을 합치면 "오늘 막 들어온 배치"에
    // "그 LOT번호로 이미 오래전에 끝난 다른 배치"의 사용/반납량이 섞여 들어온다(자재 이력 화면에서
    // 오늘 입고 20,000 옆에 훨씬 큰 과거 사용량이 붙어 보이는 사고). 반납은 입고보다 먼저 있을 수
    // 없으므로 sinceDay 하한은 안전하다. LOT 확인 용도(_isLotConfirmedReceived 등 "입고된 적
    // 있는지"만 보는 호출)는 sinceDay를 주지 않아 기존처럼 전체 이력을 본다.
    function getExactLotLedger(line, carModel, partName, lotNo, sinceDay) {
        const want = _normLine(line);
        const targetLot = String(lotNo || '').trim();
        const since = String(sinceDay || '').slice(0, 10);
        let received = 0;
        let consumed = 0;
        _recordsForLine(want).forEach(function (r) {
            if (carModel && String(r.carModel || '') !== String(carModel)) return;
            if (partName && !_partNamesMatch(r.partName, partName, carModel || r.carModel)) return;
            if (since && String(r.date || '').slice(0, 10) < since) return;
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

    function notifyTodaySiteInbound(rows) {
        const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
        if (!list.length) return;
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        const groups = { '도장-A': [], '도장-B': [] };
        list.forEach(function (r) {
            if (!r) return;
            const oType = String(r.outgoingType || '');
            const src = String(r.source || '');
            const isProd = oType === '생산출고' || src === '사출 창고 생산출고' || src === 'dispatch_to_line';
            if (!isProd) return;
            const line = _normLine(r.paintLine || r.line);
            if (line !== '도장-A' && line !== '도장-B') return;
            groups[line].push(r);
        });
        ['도장-A', '도장-B'].forEach(function (line) {
            _sendTodaySiteInboundNotify(line, groups[line]);
        });
    }

    function _sendTodaySiteInboundNotify(line, rows) {
        if (!rows || !rows.length) return;
        try {
            const kind = (typeof AuthModule.siteInboundNotifyKindForLine === 'function')
                ? AuthModule.siteInboundNotifyKindForLine(line)
                : (line === '도장-B' ? 'site_inbound_b' : 'site_inbound_a');
            if (!kind) return;
            const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
                ? AuthModule.getIncomingInspNotifyRecipientIds(kind)
                : [];
            if (!recipients.length) return;
            const lines = rows.map(function (r) {
                const lotsTxt = (Array.isArray(r.lots) && r.lots.length)
                    ? r.lots.map(function (l) {
                        return (l.lotNo || '-') + ' ' + UIUtils.formatNumber(l.qty) + ' EA';
                    }).join(', ')
                    : ((r.lotNo || '-') + (r.quantity != null || r.qty != null
                        ? (' ' + UIUtils.formatNumber(r.quantity != null ? r.quantity : r.qty) + ' EA')
                        : ''));
                return '- ' + (r.carModel || '-') + ' / ' + (r.partName || '-') +
                    (r.color ? ' / ' + r.color : '') +
                    ' · ' + (lotsTxt || UIUtils.formatNumber(r.quantity || r.qty) + ' EA');
            });
            const actor = rows.map(function (r) { return r.outgoingBy || r.returnedBy || ''; })
                .filter(Boolean)[0] || '';
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: line + ' 금일 현장 사출 입고',
                body: [
                    '사출품이 ' + line + ' 현장으로 출고되었습니다. 현장에서 입고 처리해 주세요.',
                    '',
                    lines.join('\n'),
                    '',
                    actor ? ('출고자: ' + actor) : ''
                ].filter(Boolean).join('\n'),
                category: 'site_inbound_' + (line === '도장-B' ? 'b' : 'a'),
                priority: 'high'
            });
        } catch (e) {
            console.warn('[PaintingInputModule] 금일 현장 입고 통보 실패:', e);
        }
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
        const shipQty = _outShipQty(outRec);
        let lots;
        let qty;
        if (Array.isArray(opts.lots) && opts.lots.length) {
            lots = opts.lots.map(function (l) {
                return { lotNo: String((l && l.lotNo) || outRec.lotNo || '').trim() || '무표기', qty: Math.max(0, Number(l && l.qty) || 0) };
            }).filter(function (l) { return l.qty > 0; });
            qty = lots.reduce(function (s, l) { return s + l.qty; }, 0);
            // LOT별 확인 합이 출고수량보다 작으면, 단일 LOT은 출고수량으로 맞춘다.
            // (quantity=12,000 인데 lots[].qty만 11,500 인 손상 기록 보정)
            if (qty < shipQty && lots.length === 1 && opts.actualQty == null) {
                lots[0].qty = shipQty;
                qty = shipQty;
            }
        } else {
            qty = opts.actualQty != null ? Math.max(0, Number(opts.actualQty) || 0) : shipQty;
            if (qty < shipQty && opts.actualQty == null) qty = shipQty;
            lots = Array.isArray(outRec.lots) && outRec.lots.length
                ? outRec.lots.map(function (l) {
                    return { lotNo: String(l.lotNo || outRec.lotNo || '').trim() || '무표기', qty: Number(l.qty) || 0 };
                }).filter(function (l) { return l.qty > 0; })
                : [{ lotNo: String(outRec.lotNo || '').trim() || '무표기', qty: shipQty }];
            lots = _scaleLotsToQty(lots, qty);
        }
        if (qty <= 0) return null;
        const lockKey = outRec.id
            ? ((isRework ? 'site-in-rw-' : 'site-in-') + String(outRec.id))
            : '';
        if (outRec.id) {
            const exist = isRework ? _findReceiveByReworkOutId(outRec.id) : _findReceiveByOutId(outRec.id);
            if (exist) return exist;
            if (_inboundInFlight[lockKey]) return _inboundInFlight[lockKey];
        }

        const task = _commitReceiveFromWarehouseOut(outRec, opts, {
            isRework: isRework,
            line: line,
            qty: qty,
            lots: lots,
            shipQty: shipQty,
            lockKey: lockKey
        });
        if (lockKey) _inboundInFlight[lockKey] = task;
        try {
            return await task;
        } finally {
            if (lockKey) delete _inboundInFlight[lockKey];
        }
    }

    async function _commitReceiveFromWarehouseOut(outRec, opts, ctx) {
        opts = opts || {};
        if (outRec && outRec.id) {
            const exist = ctx.isRework
                ? _findReceiveByReworkOutId(outRec.id)
                : _findReceiveByOutId(outRec.id);
            if (exist) return exist;
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
        const payload = {
            date: stampDate,
            useDate: useDate || undefined,
            shipDate: shipStamp || undefined,
            type: '입고',
            line: ctx.line,
            paintLine: ctx.line,
            carModel: outRec.carModel || '',
            partName: _toInjPartName(outRec.carModel, outRec.partName) || outRec.partName || '',
            color: outRec.color || '',
            lots: ctx.lots,
            lotNo: (ctx.lots && ctx.lots[0]) ? ctx.lots[0].lotNo : (outRec.lotNo || ''),
            quantity: ctx.qty,
            shipQty: ctx.shipQty,
            unit: 'EA',
            source: ctx.isRework ? '재사용 자재 출고' : '사출 창고 생산출고',
            refOutId: ctx.isRework ? '' : (outRec.id || ''),
            refReworkOutId: ctx.isRework ? (outRec.id || '') : undefined,
            siteReceived: true,
            isAutoReceived: !!opts.isAutoReceived,
            isReworkInbound: !!ctx.isRework,
            receivedBy: actor || outRec.outgoingBy || '',
            receivedAt: UIUtils.now ? UIUtils.now() : new Date().toISOString().slice(0, 16).replace('T', ' '),
            note: outRec.note || outRec.memo || '',
            trace: outRec.trace || undefined
        };
        if (ctx.lockKey) payload.id = ctx.lockKey;
        if (payload.id && typeof Storage.put === 'function') {
            return Storage.put(STORE, payload);
        }
        return Storage.add(STORE, payload);
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
            source: '재사용 자재 출고'
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
            if (opts.partName && !_partNamesMatch(r.partName, opts.partName, opts.carModel || r.carModel)) return false;
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
                if (opts.partName && !_partNamesMatch(r.partName, opts.partName, opts.carModel || r.carModel)) return false;
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
            if (opts.partName && !_partNamesMatch(r.partName, opts.partName, opts.carModel || r.carModel)) return false;
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

    /** 이미 실물이 도착·확인된 입고의 "사용일"만 바꾸는 권한 — 창고 출고 없이 재고를
     *  새로 만드는 registerManualSiteInbound(관리자 전용)보다 낮은 문턱이다. 도장 실적을
     *  입력할 수 있는 사람이면 이 정도 보정은 할 수 있어야, 관리자가 없을 때도 지난
     *  계획의 밀린 실적을 입력할 수 있다. */
    function _canCorrectInboundUseDate() {
        if (_canAdminCorrectInbound()) return true;
        return typeof AuthModule !== 'undefined' && typeof AuthModule.canWritePage === 'function' &&
            (AuthModule.canWritePage('painting-work-a') ||
             AuthModule.canWritePage('painting-work-b') ||
             AuthModule.canWritePage('painting-work'));
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
        const lock = getManualInboundLock(out, want, UIUtils.today ? UIUtils.today() : '');
        if (lock.locked) {
            UIUtils.toast('자동입고 5분전 — 잠시 후 시스템이 입고 처리합니다.', 'warning');
            return null;
        }
        const shipQty = _outShipQty(out);
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
        if (outLots.length === 1 && outLots[0].qty < shipQty) outLots[0].qty = shipQty;
        if (outLots.length > 1) {
            const lotSum = outLots.reduce(function (s, l) { return s + l.qty; }, 0);
            if (lotSum < shipQty) outLots[0].qty += (shipQty - lotSum);
        }
        const hasMultiLot = outLots.length > 1;
        const srcHint = resolved.isRework
            ? '<div style="margin-top:6px;font-size:0.78rem;color:#7c3aed;font-weight:700;">재사용 자재 출고 — 현장 입고 확인 후 투입 가능</div>'
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
        const lock = getManualInboundLock(out, want, UIUtils.today ? UIUtils.today() : '');
        if (lock.locked) {
            UIUtils.toast('자동입고 5분전 — 잠시 후 시스템이 입고 처리합니다.', 'warning');
            UIUtils.closeModal();
            return;
        }
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

    // 자동 입고는 도장 작업 완료 시각(계획 종료시각) 그 시각이 아니라, 그로부터 일정 시간이
    // 지난 뒤에 처리한다 — 완료 직후엔 아직 실물이 현장에 도착하지 않았을 수 있기 때문.
    const AUTO_INBOUND_DELAY_HOURS = 3;
    const AUTO_INBOUND_MANUAL_LOCK_MINUTES = 5;

    /** 'HH:MM' 시각에 지정한 시간(hours)을 더한다. 자정을 넘기면 23:59로 고정(당일 안에서만 비교하므로) */
    function _addHoursToHm(hm, hours) {
        const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
        if (!m) return hm;
        const total = Math.max(0, Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(hours) * 60)));
        const p = function (n) { return String(n).padStart(2, '0'); };
        return p(Math.floor(total / 60)) + ':' + p(total % 60);
    }

    function _hmToMinutes(hm) {
        const m = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
        if (!m) return null;
        return Number(m[1]) * 60 + Number(m[2]);
    }

    /** 자동입고 예정 시각(계획 종료 + 3시간). 매칭 계획이 없으면 빈 문자열. */
    function getAutoInboundAt(record, line, date) {
        const endTime = getPlanEndTimeForShipment(record, line, date);
        if (!endTime) return '';
        return _addHoursToHm(endTime, AUTO_INBOUND_DELAY_HOURS);
    }

    /**
     * 자동입고 5분 전부터 수동 입고를 막는다.
     * 자동입고는 금일 출고만 대상이므로, 날짜가 다른 미입고(지난 건)는 막지 않는다.
     */
    function getManualInboundLock(record, line, date) {
        const today = String(date || (UIUtils.today ? UIUtils.today() : '')).slice(0, 10);
        const shipDay = String((record && record.date) || '').slice(0, 10);
        if (shipDay && today && shipDay !== today) {
            return { locked: false, autoAt: '', label: '' };
        }
        const autoAt = getAutoInboundAt(record, line, today);
        if (!autoAt) return { locked: false, autoAt: '', label: '' };
        const autoMin = _hmToMinutes(autoAt);
        const nowMin = _hmToMinutes(_nowHm());
        if (autoMin == null || nowMin == null) return { locked: false, autoAt: autoAt, label: '' };
        if (nowMin < autoMin - AUTO_INBOUND_MANUAL_LOCK_MINUTES) {
            return { locked: false, autoAt: autoAt, label: '' };
        }
        return {
            locked: true,
            autoAt: autoAt,
            label: '자동입고 5분전',
            title: '자동입고(' + autoAt + ') 5분 전부터 수동 입고를 막아 중복 저장을 방지합니다. 잠시 후 시스템이 입고 처리합니다.'
        };
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
    function findPlansForShipment(record, line, date, opts) {
        opts = opts || {};
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

        // 자재 분출 매칭은 다른 품목 계획(예: PARK 분출인데 KNOB LOWER 계획)으로 폴백하면 안 된다.
        if (opts.strictProduct) return [];

        // ③ 같은 차종·라인에 유효 계획이 1건뿐이면 그 계획으로 폴백
        //    (사출자재 마스터 미등록이어도 헤더 계획합계와 행 계획수량이 어긋나지 않게)
        const sameCar = plans.filter(function (p) {
            return !car || !p.carModel || String(p.carModel).trim() === car;
        });
        if (sameCar.length === 1) return sameCar;
        return [];
    }

    function _shiftIsoDate(ymd, days) {
        var s = String(ymd || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
        var d = new Date(s + 'T12:00:00');
        d.setDate(d.getDate() + (Number(days) || 0));
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1);
        var day = String(d.getDate());
        if (m.length < 2) m = '0' + m;
        if (day.length < 2) day = '0' + day;
        return y + '-' + m + '-' + day;
    }

    function _findMatchingPlansAround(record, line, centerDate, radiusDays) {
        radiusDays = radiusDays == null ? 14 : radiusDays;
        var hits = [];
        var seen = {};
        for (var d = -radiusDays; d <= radiusDays; d++) {
            if (d === 0) continue;
            var day = _shiftIsoDate(centerDate, d);
            if (!day) continue;
            (findPlansForShipment(record, line, day, { strictProduct: true }) || []).forEach(function (p) {
                if (!p || !p.id || seen[p.id]) return;
                seen[p.id] = true;
                hits.push(p);
            });
        }
        hits.sort(function (a, b) {
            return String(a.date || '').localeCompare(String(b.date || ''))
                || String(a.startTime || '').localeCompare(String(b.startTime || ''));
        });
        return hits;
    }

    function _suggestPaintDateForInbound(recv, line) {
        if (!recv) return String(UIUtils.today ? UIUtils.today() : '').slice(0, 10);
        var matched = String(recv.matchedPaintDate || '').slice(0, 10);
        if (matched) return matched;
        var inboundDay = _resolveActualInboundStamp(recv).slice(0, 10)
            || String(recv.useDate || recv.date || '').slice(0, 10);
        if (inboundDay && findPlansForShipment(recv, line, inboundDay, { strictProduct: true }).length) {
            return inboundDay;
        }
        var nearby = _findMatchingPlansAround(recv, line, inboundDay, 14);
        var past = nearby.filter(function (p) { return String(p.date || '').slice(0, 10) < inboundDay; });
        if (past.length) return String(past[past.length - 1].date).slice(0, 10);
        if (nearby.length) return String(nearby[0].date).slice(0, 10);
        return inboundDay || String(UIUtils.today ? UIUtils.today() : '').slice(0, 10);
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
        const shipQty = _outShipQty(out);
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
    let _qtyAlignDone = {};
    let _inboundDedupeDone = false;

    /** 같은 창고 출고(refOutId)로 현장 입고가 2건 이상이면 1건만 남긴다. */
    async function _dedupeSiteInboundByOutRef() {
        if (_inboundDedupeDone) return 0;
        _inboundDedupeDone = true;
        const rows = (Storage.getAll(STORE) || []).filter(function (r) {
            if (!r || String(r.type || '') !== '입고') return false;
            return !!(r.refOutId || r.refReworkOutId);
        });
        const groups = {};
        rows.forEach(function (r) {
            const key = r.refReworkOutId
                ? ('rw:' + String(r.refReworkOutId))
                : ('inj:' + String(r.refOutId));
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        let removed = 0;
        const keys = Object.keys(groups);
        for (let g = 0; g < keys.length; g++) {
            const list = groups[keys[g]];
            if (list.length < 2) continue;
            list.sort(function (a, b) {
                const am = a.isAutoReceived ? 1 : 0;
                const bm = b.isAutoReceived ? 1 : 0;
                if (am !== bm) return am - bm;
                return String(a.createdAt || a.receivedAt || a.date || '')
                    .localeCompare(String(b.createdAt || b.receivedAt || b.date || ''));
            });
            for (let i = 1; i < list.length; i++) {
                try {
                    await Storage.remove(STORE, list[i].id);
                    removed++;
                } catch (e) {
                    console.warn('[PaintingInput] 중복 입고 정리 실패:', e);
                }
            }
        }
        return removed;
    }

    /** 창고 출고수량보다 작게 저장된 미사용 현장입고를 출고수량에 맞춘다. */
    async function _alignInboundQtyToWarehouseOut(line) {
        const want = _normLine(line);
        if (_qtyAlignDone[want]) return 0;
        _qtyAlignDone[want] = true;
        const rows = _recordsForLine(want) || [];
        let fixed = 0;
        for (let i = 0; i < rows.length; i++) {
            const rec = rows[i];
            if (!rec || String(rec.type || '') !== '입고' || !rec.refOutId) continue;
            const out = Storage.getById(DB.STORES.INJECTION_INVENTORY, rec.refOutId);
            if (!out) continue;
            const shipQty = _outShipQty(out);
            const have = Number(rec.quantity) || 0;
            if (!(shipQty > have)) continue;
            const lots = Array.isArray(rec.lots) ? rec.lots : [];
            if (lots.length > 1) continue;
            const lotNo = String((lots[0] && lots[0].lotNo) || rec.lotNo || out.lotNo || '무표기').trim();
            const since = String(rec.shipDate || rec.date || '').slice(0, 10);
            const led = getExactLotLedger(want, rec.carModel, rec.partName, lotNo, since) || {};
            if (Number(led.consumed) > 0.001) continue;
            try {
                await Storage.update(STORE, rec.id, {
                    quantity: shipQty,
                    shipQty: shipQty,
                    lots: [{ lotNo: lotNo, qty: shipQty }],
                    lotNo: lotNo
                });
                fixed++;
            } catch (e) { /* ignore */ }
        }
        return fixed;
    }

    /** 생산계획 작업 완료 시각(endTime) 경과 시 미입고 건 자동 입고 */
    async function runAutoSiteInbound(line) {
        const want = _normLine(line);
        if (!_canConfirmInbound(want) || _autoInboundBusy) return { processed: 0 };
        _autoInboundBusy = true;
        let aligned = 0;
        let deduped = 0;
        try {
            try { deduped = await _dedupeSiteInboundByOutRef() || 0; } catch (eDup) { deduped = 0; }
            try { aligned = await _alignInboundQtyToWarehouseOut(want) || 0; } catch (eAlign) { aligned = 0; }
            const today = UIUtils.today ? UIUtils.today() : '';
            const nowHm = _nowHm();
            const pending = listTodayWarehouseShipments(want, today).filter(function (r) { return !r.received; });
            if (!pending.length) {
                if (aligned > 0 || deduped > 0) _refreshInboundViews();
                return { processed: 0 };
            }

            let processed = 0;
            for (let i = 0; i < pending.length; i++) {
                const r = pending[i];
                const endTime = getPlanEndTimeForShipment(r, want, today);
                if (!endTime) continue;
                const autoAt = _addHoursToHm(endTime, AUTO_INBOUND_DELAY_HOURS);
                if (nowHm < autoAt) continue;
                const rec = await autoReceiveFromWarehouseOut(r.id, want);
                if (rec) processed++;
            }
            if (processed > 0) {
                UIUtils.toast('작업 완료 ' + AUTO_INBOUND_DELAY_HOURS + '시간 경과 — 자동 입고 ' + processed + '건 처리', 'success');
                _refreshInboundViews();
            } else if (aligned > 0 || deduped > 0) {
                _refreshInboundViews();
            }
            return { processed: processed };
        } finally {
            _autoInboundBusy = false;
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
                ? '<span style="margin-left:4px;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(124,58,237,0.12);color:#7c3aed;">재사용 자재</span>'
                : '';
            const statusHtml = r.received
                ? '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(22,163,74,0.12);color:#16a34a;">입고완료</span>'
                    + (isAutoReceived
                        ? '<span style="margin-left:4px;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(37,99,235,0.12);color:#2563eb;" title="계획 종료시각으로부터 ' + AUTO_INBOUND_DELAY_HOURS + '시간 경과로 시스템이 자동 확정 — 실물 LOT별 수량 확인이 안 됐을 수 있습니다">자동입고</span>'
                        : '')
                    + reworkTag
                : '<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,88,12,0.12);color:#ea580c;">미입고</span>' + reworkTag;
            const autoScheduleLabel = (!r.received && endTime)
                ? (function () {
                    const autoAt = _addHoursToHm(endTime, AUTO_INBOUND_DELAY_HOURS);
                    const m = String(autoAt).match(/^(\d{1,2}):(\d{2})/);
                    if (!m) return String(autoAt) + '에 자동입고 처리예정';
                    return Number(m[1]) + '시' + m[2] + '분에 자동입고 처리예정';
                })()
                : '';
            const reworkReturnLots = (r.received && r.isReworkDispatch) ? _returnableLotsForReworkShipment(r, want) : [];
            const reworkReturnQty = reworkReturnLots.reduce(function (s, l) { return s + l.qty; }, 0);
            const reworkReturnBtn = (r.received && r.isReworkDispatch && reworkReturnQty > 0 && canWrite)
                ? `<button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;white-space:nowrap;color:#7c3aed;border-color:#c4b5fd;"
                        title="재사용 자재으로 반납 — 현장 잔량을 재공 재고로 되돌립니다"
                        onclick="PaintingInputModule.openReworkInboundReturnModal('${_esc(r.id)}','${_esc(want)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">undo</span> 반납
                   </button>`
                : '';
            const lock = (!r.received) ? getManualInboundLock(r, want, today) : { locked: false };
            const actionHtml = r.received
                ? `<div style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
                    <button type="button" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:0.72rem;white-space:nowrap;"
                        title="도장일·생산계획 매칭 확인"
                        onclick="PaintingInputModule.openInboundMatchView('${_esc((recv && recv.id) || r.id)}','${_esc(want)}')">보기</button>
                    ${reworkReturnBtn}
                    <span style="font-size:0.75rem;color:var(--text-muted);">${_esc((recv && recv.receivedBy) || '-')}${isAutoReceived ? ' (자동)' : ''}</span>
                   </div>`
                : (lock.locked
                    ? `<span style="font-size:0.78rem;font-weight:800;color:#b45309;white-space:nowrap;" title="${_esc(lock.title || '자동입고 5분전')}">자동입고 5분전</span>`
                    : (canWrite
                    ? `<div style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
                        <button type="button" class="btn btn-sm btn-primary" style="padding:4px 10px;font-size:0.78rem;white-space:nowrap;"
                            onclick="${confirmFn}('${_esc(r.id)}','${_esc(want)}')">
                            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">move_to_inbox</span> 입고 처리
                        </button>` +
                        (autoScheduleLabel
                            ? `<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;" title="계획 완료시각으로부터 ${AUTO_INBOUND_DELAY_HOURS}시간 경과 시 자동 입고 처리">${_esc(autoScheduleLabel)}</span>`
                            : '') +
                       `</div>`
                    : '<span style="font-size:0.75rem;color:var(--text-muted);">입력 권한 필요</span>'));
            const endHint = endTime && !r.received
                ? ' title="작업 완료 ' + _esc(endTime) + ' + ' + AUTO_INBOUND_DELAY_HOURS + '시간 이후 자동 입고"'
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

    /** 분출 수량을 어느 도장일에 붙일지. 명시적 매칭(과거 실적 등록)이 있으면 그날을 쓴다.
     *  창고 출고일(shipDate)만 보면 실적을 하루 늦게 입력한 리워크 분출이 과거 실적에 안 붙는다. */
    function _inboundIssuedDay(r) {
        var matched = String((r && r.matchedPaintDate) || '').slice(0, 10);
        if (matched) return matched;
        return _resolveActualInboundStamp(r).slice(0, 10);
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
                if (_inboundIssuedDay(r) !== day) return false;
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
                // 실제로 합산에 잡힌 개별 입고 레코드를 나열한다 — "현장입고사출"이 이 실적
                // 자신의 LOT 합계보다 훨씬 크게 나올 때(중복 레코드·다른 실적 몫 혼입 등), 그
                // 원인이 된 레코드를 화면에서 바로 짚어낼 수 있게 하기 위함이다.
                const injNames = {};
                if (opts.injPartName) injNames[String(opts.injPartName).trim()] = true;
                if (opts.partName) injNames[String(opts.partName).trim()] = true;
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
                } catch (e2) { /* ignore */ }
                const requirePartMatch = Object.keys(injNames).length > 0;
                const contributions = [];
                let sum = 0;
                sameDayCarLine.forEach(function (r) {
                    if (requirePartMatch) {
                        const rPart = String(r.partName || '').trim();
                        if (!rPart || !injNames[rPart]) return;
                    }
                    const rLots = Array.isArray(r.lots) && r.lots.length ? r.lots : [{ lotNo: r.lotNo, qty: r.quantity }];
                    rLots.forEach(function (l) {
                        const n = String((l && l.lotNo) || '').trim();
                        if (!n || workLots.indexOf(n) < 0) return;
                        const q = Number(l.qty) || 0;
                        sum += q;
                        contributions.push((r.partName || '(품명없음)') + ' · LOT ' + n + ' · ' + q + 'EA · id=' + String(r.id || '').slice(-6) + ' · ' + String(r.date || '').slice(0, 16));
                    });
                });
                return '이 실적의 LOT: ' + (workLots.join(', ') || '(없음)') +
                    ' | 사출명 필터: ' + (requirePartMatch ? Object.keys(injNames).join(', ') : '(없음 — 필터 미적용)') +
                    ' | 합산 근거 ' + contributions.length + '건 (합계 ' + sum + 'EA): ' +
                    (contributions.length ? contributions.join(' / ') : '없음 — 같은 날짜·차종·사출명 실적이 이 건 말고 더 있으면 "-"로 남깁니다.');
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

            // LOT번호(YYMMDD)는 이 작업일과 무관한 예전 배치에서도 재사용될 수 있다. 이 작업일보다
            // 앞선 반납은 이 작업이 투입한 물량과 무관한 과거 배치의 반납이므로(반납은 사용/작업보다
            // 먼저 있을 수 없다) 하한으로 제외한다 — 없으면 "이 실적은 반납한 적 없는데 LOT번호만
            // 같은 몇 주 전 반납량이 자재 반납 열에 그대로 붙어 보이는" 사고가 난다.
            if (String(r.date || '').slice(0, 10) < day) return;
            // LOT 정보가 있으면 LOT 번호로만 매칭(날짜 상한 무관, 반납은 다음날 등 처리될 수 있음).
            // LOT 정보가 없는 구 데이터일 때만 당일 일치를 폴백 기준으로 쓴다.
            if (!hasLots && String(r.date || '').slice(0, 10) !== day) return;
            if (opts.carModel && r.carModel && r.carModel !== opts.carModel) return;

            const rLots = Array.isArray(r.lots) && r.lots.length
                ? r.lots
                : [{ lotNo: r.lotNo, qty: Number(r.quantity) || 0 }];
            if (hasLots) {
                // LOT번호는 여러 제품이 같은 원료 배치를 나눠 쓰면 재사용될 수 있다 — partName까지
                // 맞아야 이 실적과 무관한 다른 제품의 같은 LOT번호 반납이 섞이지 않는다.
                if (injPart && String(r.partName || '').trim() && String(r.partName || '').trim() !== injPart) return;
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
            if (_inboundIssuedDay(r) !== day) return false;
            if (opts.carModel && r.carModel && r.carModel !== opts.carModel) return false;
            return true;
        });

        // 0순위: planId 매칭 — 이 작업실적이 속한 생산계획(opts.planId)과 정확히 같은
        // planId로 사출창고에서 출고된 입고 건만 골라낸다. refOutId로 원본 사출 출고
        // 이력까지 거슬러 올라가 그 출고 건의 planId를 확인한다. LOT 번호 문자열이 어긋나도
        // (선입선출 자동배분·비례배분·수기수정 등으로 흔함) 이 매칭은 영향받지 않고, 같은 날
        // 같은 차종·품명 실적이 여러 건이어도 정확히 이 실적 몫만 구분되는 가장 신뢰도 높은
        // 매칭 방법이다.
        if (opts.planId) {
            let planTotal = 0;
            let planMatched = false;
            dayRecords.forEach(function (r) {
                if (r.matchedPlanId && String(r.matchedPlanId) === String(opts.planId)) {
                    planMatched = true;
                    planTotal += Number(r.quantity) || 0;
                    return;
                }
                if (!r.refOutId || typeof DB === 'undefined' || !DB.STORES || !DB.STORES.INJECTION_INVENTORY) return;
                const outRec = Storage.getById(DB.STORES.INJECTION_INVENTORY, r.refOutId);
                if (outRec && outRec.planId && String(outRec.planId) === String(opts.planId)) {
                    planMatched = true;
                    planTotal += Number(r.quantity) || 0;
                }
            });
            if (planMatched) return planTotal;
        }

        // LOT번호(YYMMDD)는 하나의 원료 배치가 여러 제품(사출명)에 걸쳐 재사용될 수 있다
        // (예: 같은 사출 원료 LOT이 HIGH ROOM KNOB과 HIGH DOOR KNOB에 나눠 입고). 아래 injNames
        // 필터 없이 LOT번호만으로 dayRecords를 훑으면, 이 실적과 무관한 다른 제품의 같은 LOT번호
        // 입고분까지 합산되어 실제 이 실적이 받은 양보다 훨씬 큰 수치가 나온다(자재과잉/유실
        // 오탐의 원인). 아래 사출명(품명) 폴백과 동일한 기준으로 좁힌다.
        let total = 0;
        if (hasLots) {
            const requirePartMatch = Object.keys(injNames).length > 0;
            dayRecords.forEach(function (r) {
                if (requirePartMatch) {
                    const rPart = String(r.partName || '').trim();
                    if (!rPart || !injNames[rPart]) return;
                }
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
        const defaultDate = _suggestPaintDateForInbound(recv, want);
        const lotNo = _primaryLot(recv);
        const qty = Number(recv.quantity) || 0;
        const already = String(recv.matchedPaintDate || '').slice(0, 10);

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
            ${already ? '<div style="margin-top:-4px;margin-bottom:8px;font-size:0.78rem;color:#16a34a;font-weight:700;">이미 도장일 ' + _esc(already) + ' 실적에 등록되어 있습니다.</div>' : ''}
            <div id="piMatchPanel" style="margin-top:8px;"></div>
            <input type="hidden" id="piMatchRecvId" value="${_esc(recv.id || '')}">
            <input type="hidden" id="piMatchLine" value="${_esc(want)}">
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-primary" onclick="PaintingInputModule.saveInboundMatch()">이 도장일로 등록</button>`,
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

        const jumpOpt = planSel.options && planSel.selectedIndex >= 0 ? planSel.options[planSel.selectedIndex] : null;
        const jumpDate = jumpOpt ? String(jumpOpt.getAttribute('data-plan-date') || '').slice(0, 10) : '';
        if (jumpDate && jumpDate !== paintDate) dateEl.value = jumpDate;
        const useDate = String(dateEl.value || paintDate).slice(0, 10);

        const plans = findPlansForShipment(recv, want, useDate, { strictProduct: true })
            .slice()
            .sort(function (a, b) {
                return String(a.startTime || '').localeCompare(String(b.startTime || ''))
                    || String(a.partName || '').localeCompare(String(b.partName || ''));
            });
        const nearbyPlans = plans.length ? [] : _findMatchingPlansAround(recv, want, useDate, 14);

        let curPlanId = planSel.value || (recv && recv.matchedPlanId) || '';
        if (!curPlanId && plans.length === 1) curPlanId = plans[0].id;
        if (!curPlanId && nearbyPlans.length === 1) curPlanId = nearbyPlans[0].id;

        function planOptionHtml(p, withDate) {
            const day = String(p.date || '').slice(0, 10);
            const label = (withDate && day ? day.slice(5) + ' · ' : '')
                + (p.startTime || '') + '~' + (p.endTime || '')
                + ' · ' + (p.carModel || '') + ' / ' + (p.partName || '')
                + (p.color ? ' / ' + p.color : '')
                + ' · 계획 ' + _fmt(p.planQty) + ' EA';
            const sel = p.id === curPlanId ? ' selected' : '';
            return '<option value="' + _esc(p.id) + '" data-plan-date="' + _esc(day) + '"' + sel + '>' + _esc(label) + '</option>';
        }

        planSel.innerHTML = '<option value="">— 이 품목 계획 선택 (' + plans.length + '건) —</option>' +
            plans.map(function (p) { return planOptionHtml(p, false); }).join('') +
            (nearbyPlans.length
                ? '<optgroup label="인근 일자 같은 품목 계획">' +
                    nearbyPlans.map(function (p) { return planOptionHtml(p, true); }).join('') +
                  '</optgroup>'
                : '');

        const plan = curPlanId
            ? (plans.find(function (p) { return p.id === curPlanId; })
                || nearbyPlans.find(function (p) { return p.id === curPlanId; })
                || null)
            : null;
        const works = (Storage.getAll(DB.STORES.PAINTING_WORK) || []).filter(function (w) {
            if (!w || String(w.date || '').slice(0, 10) !== useDate) return false;
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
                date: useDate,
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
            date: useDate,
            lots: recv ? recv.lots : [],
            lotNo: recv ? recv.lotNo : '',
            injPartName: recv ? recv.partName : '',
            planId: plan ? plan.id : (recv ? recv.matchedPlanId : '')
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
                    date: useDate, lots: w.lots, lotNo: w.lotNo, injPartName: w.injPartName,
                    planId: w.planId || (plan ? plan.id : '')
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
            : '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted);">해당일 매칭 실적이 없습니다. 도장일·생산계획을 확인한 뒤 「이 도장일로 등록」을 누르세요.</td></tr>';

        const nearbyHint = (!plans.length && nearbyPlans.length)
            ? '<div style="margin-bottom:8px;padding:8px 10px;border-radius:6px;background:rgba(217,119,6,0.08);border:1px solid rgba(217,119,6,0.35);font-size:0.8rem;color:#92400e;">이 날짜에는 이 품목 계획이 없습니다. 인근 일자의 같은 품목 계획을 고르면 도장일이 바뀝니다.</div>'
            : '';
        const matchHint = (recv && recv.matchedPaintDate)
            ? '<div style="margin-bottom:8px;font-size:0.78rem;color:#16a34a;">현재 매칭 도장일 <strong>' + _esc(String(recv.matchedPaintDate).slice(0, 10)) + '</strong>' +
              (recv.matchedPlanId ? ' · 계획 연결됨' : '') + '</div>'
            : '';

        panel.innerHTML = `
            ${matchHint}${nearbyHint}
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

    async function saveInboundMatch() {
        const recvId = ((document.getElementById('piMatchRecvId') || {}).value || '').trim();
        const line = ((document.getElementById('piMatchLine') || {}).value || '').trim();
        const paintDate = String((document.getElementById('piMatchPaintDate') || {}).value || '').slice(0, 10);
        const planId = ((document.getElementById('piMatchPlanId') || {}).value || '').trim();
        if (!recvId) {
            UIUtils.toast('입고 기록을 찾을 수 없습니다.', 'error');
            return;
        }
        if (!paintDate) {
            UIUtils.toast('도장일을 선택하세요.', 'warning');
            return;
        }
        const rec = await updateSiteInbound(recvId, {
            useDate: paintDate,
            matchedPaintDate: paintDate,
            matchedPlanId: planId,
            keepInboundDate: true
        });
        if (!rec) return;
        UIUtils.toast('도장일 ' + paintDate + ' 실적에 매칭 등록했습니다.', 'success');
        refreshInboundMatchPanel();
    }

    // ──────────────────────────────────────────────
    // 도장현장 → 사출창고 자재 반납 ("재입고"가 아니라 "반납" — 도장현장에서 처리하는 즉시
    // 이 스토어(현장 재고)에서는 바로 빠지지만, 사출창고 재고로 정식 편입되는 건 사출창고
    // 물류담당자가 실물을 확인하고 「입고 처리」할 때뿐이다. 그 전까지는 "반납 대기" 상태.)
    // 리워크 입고 반납은 사출창고가 아니라 재사용 자재으로 즉시 되돌린다.
    // ──────────────────────────────────────────────

    /** 리워크 입고 건에서 아직 현장(투입·반납)으로 안 빠진 LOT 잔량 */
    function _returnableLotsForReworkShipment(r, line) {
        const want = _normLine(line || (r && (r.paintLine || r.line)));
        const recv = (r && r.receiveRec) || null;
        const srcLots = (recv && Array.isArray(recv.lots) && recv.lots.length)
            ? recv.lots
            : ((r && Array.isArray(r.lots) && r.lots.length)
                ? r.lots
                : [{ lotNo: (r && r.lotNo) || '', qty: (r && (r.quantity || r.qty)) || 0 }]);
        const carModel = String((r && r.carModel) || '').trim();
        const partName = String((r && r.partName) || '').trim();
        return srcLots.map(function (l) {
            const lotNo = String((l && l.lotNo) || '').trim();
            const inboundQty = Math.max(0, Number(l && l.qty) || 0);
            if (!lotNo || inboundQty <= 0) return null;
            const ledger = getExactLotLedger(want, carModel, partName, lotNo);
            const qty = Math.min(inboundQty, Math.max(0, Number(ledger.balance) || 0));
            return { lotNo: lotNo, inboundQty: inboundQty, balance: Number(ledger.balance) || 0, qty: qty };
        }).filter(function (l) { return l && l.qty > 0; });
    }

    function _findReworkShipmentForReturn(outId, line) {
        const want = _normLine(line);
        const todayHit = (listTodayWarehouseShipments(want) || []).find(function (r) {
            return String(r.id) === String(outId) && r.isReworkDispatch;
        });
        if (todayHit) return todayHit;
        if (!DB.STORES || !DB.STORES.REWORK_WIP) return null;
        const rec = Storage.getById(DB.STORES.REWORK_WIP, outId);
        if (!rec || String(rec.type || '') !== '출고' || String(rec.source || '') !== 'dispatch_to_line') return null;
        const shaped = _shapeReworkShipment(rec);
        const recv = _findReceiveByReworkOutId(outId);
        return Object.assign({}, shaped, { received: !!recv, receiveRec: recv || null });
    }

    /** 이 반납이 사출창고가 아니라 리워크 재공으로 돌아가야 하는지 */
    function _shouldReturnToReworkWip(opts) {
        opts = opts || {};
        if (opts.isReworkReturn) return true;
        try {
            if (typeof InjectionWarehouseModule !== 'undefined'
                && typeof InjectionWarehouseModule.isReworkSourcedPart === 'function'
                && InjectionWarehouseModule.isReworkSourcedPart(opts.partName)) return true;
        } catch (e) { /* ignore */ }
        const want = _normLine(opts.line);
        const lotSet = {};
        (opts.lots || []).forEach(function (l) {
            const n = String((l && l.lotNo) || '').trim();
            if (n) lotSet[n] = true;
        });
        return (_recordsForLine(want) || []).some(function (r) {
            if (String(r.type || '') !== '입고') return false;
            if (String(r.carModel || '').trim() !== String(opts.carModel || '').trim()) return false;
            if (String(r.partName || '').trim() !== String(opts.partName || '').trim()) return false;
            if (!isReworkSiteInbound(r)) return false;
            const lots = (Array.isArray(r.lots) && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            return lots.some(function (l) { return lotSet[String((l && l.lotNo) || '').trim()]; });
        });
    }

    let _pendingReworkInboundReturn = null;

    function openReworkInboundReturnModal(outId, line) {
        const want = _normLine(line);
        if (!_canConfirmInbound(want)) {
            UIUtils.toast('반납 권한이 없습니다.', 'warning');
            return;
        }
        const ship = _findReworkShipmentForReturn(outId, want);
        if (!ship || !ship.received) {
            UIUtils.toast('리워크 입고 기록을 찾을 수 없습니다.', 'warning');
            return;
        }
        const lots = _returnableLotsForReworkShipment(ship, want);
        const total = lots.reduce(function (s, l) { return s + l.qty; }, 0);
        if (!lots.length || total <= 0) {
            UIUtils.toast('반납할 현장 잔량이 없습니다. 이미 투입됐거나 반납된 수량입니다.', 'info');
            return;
        }
        _pendingReworkInboundReturn = { outId: ship.id, line: want, ship: ship, lots: lots };
        const rows = lots.map(function (l, i) {
            return `<tr>
                <td style="white-space:nowrap;padding:8px 10px;font-family:monospace;font-weight:700;">${_esc(l.lotNo)}</td>
                <td style="white-space:nowrap;padding:8px 10px;text-align:right;">${_fmt(l.inboundQty)}</td>
                <td style="white-space:nowrap;padding:8px 10px;text-align:right;font-weight:800;color:#7c3aed;">${_fmt(l.qty)}</td>
                <td style="white-space:nowrap;padding:8px 10px;text-align:right;">
                    <input type="number" class="form-input" id="rwInboundRetQty_${i}"
                        data-lot-no="${_esc(l.lotNo)}" min="1" max="${l.qty}" value="${l.qty}"
                        style="width:auto;min-width:5em;text-align:right;font-weight:700;">
                </td>
            </tr>`;
        }).join('');
        UIUtils.showModal('리워크 입고 반납',
            `<div style="padding:4px 0;">
                <div style="padding:10px 12px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.22);border-radius:8px;font-size:0.85rem;line-height:1.6;">
                    <div><strong>${_esc(ship.carModel || '-')} · ${_esc(ship.partName || '-')}</strong>
                        ${ship.color ? ' · ' + _esc(ship.color) : ''}
                        <span style="margin-left:6px;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(124,58,237,.12);color:#7c3aed;">재사용 자재</span>
                    </div>
                    <div style="color:var(--text-muted);margin-top:2px;">현장 잔량 <strong style="color:#7c3aed;">${_fmt(total)} EA</strong>를 재사용 자재으로 되돌립니다. 사출 창고 재고로는 들어가지 않습니다.</div>
                </div>
                <div class="data-table-wrapper" style="margin-top:12px;">
                    <table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">
                        <thead><tr>
                            <th style="white-space:nowrap;padding:8px 10px;">사출LOT</th>
                            <th style="white-space:nowrap;padding:8px 10px;text-align:right;">입고</th>
                            <th style="white-space:nowrap;padding:8px 10px;text-align:right;">잔량</th>
                            <th style="white-space:nowrap;padding:8px 10px;text-align:right;">반납 수량</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="form-group" style="margin-top:12px;">
                    <label class="form-label">사유 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="rwInboundRetReason" placeholder="예: 계획 축소 · 오입고 · 미사용 반납">
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" style="background:#7c3aed;border-color:#7c3aed;"
                onclick="PaintingInputModule.submitReworkInboundReturn()">반납 처리</button>`,
            '640px');
    }

    async function submitReworkInboundReturn() {
        const ctx = _pendingReworkInboundReturn;
        if (!ctx || !ctx.ship) {
            UIUtils.toast('반납 요청이 만료되었습니다. 다시 선택하세요.', 'error');
            return;
        }
        if (!_canConfirmInbound(ctx.line)) {
            UIUtils.toast('반납 권한이 없습니다.', 'warning');
            return;
        }
        const reason = String((document.getElementById('rwInboundRetReason') || {}).value || '').trim();
        if (!reason) {
            UIUtils.toast('반납 사유를 입력하세요.', 'warning');
            const el = document.getElementById('rwInboundRetReason');
            if (el) el.focus();
            return;
        }
        const lots = [];
        for (let i = 0; i < ctx.lots.length; i++) {
            const max = Number(ctx.lots[i].qty) || 0;
            const el = document.getElementById('rwInboundRetQty_' + i);
            const qty = Math.floor(Number(el && el.value) || 0);
            if (qty <= 0) continue;
            if (qty > max) {
                UIUtils.toast('LOT ' + ctx.lots[i].lotNo + ' 잔량(' + _fmt(max) + ' EA)을 초과합니다.', 'warning');
                if (el) el.focus();
                return;
            }
            lots.push({ lotNo: ctx.lots[i].lotNo, qty: qty });
        }
        if (!lots.length) {
            UIUtils.toast('반납 수량을 입력하세요.', 'warning');
            return;
        }
        const ship = ctx.ship;
        const recv = ship.receiveRec || {};
        if (typeof ReworkWipModule === 'undefined' || typeof ReworkWipModule.receiveSiteReturn !== 'function') {
            UIUtils.toast('재사용 자재 모듈을 사용할 수 없습니다.', 'error');
            return;
        }
        let returnRec = null;
        let wipRestored = false;
        try {
            returnRec = await createSiteReturn({
                line: ctx.line,
                carModel: ship.carModel || '',
                partName: ship.partName || '',
                color: ship.color || recv.color || '',
                lots: lots,
                reason: reason,
                returnedBy: _currentActorLabel(),
                isReworkReturn: true,
                refInboundId: recv.id || '',
                refReworkOutId: ship.id || recv.refReworkOutId || '',
                physicalVerified: true,
                verifiedAt: UIUtils.now ? UIUtils.now() : ''
            });
            if (returnRec && returnRec.id) {
                await confirmSiteReturn(returnRec.id, { confirmedBy: _currentActorLabel() });
            }
            await ReworkWipModule.receiveSiteReturn({
                carModel: ship.carModel || '',
                partName: ship.partName || '',
                color: ship.color || recv.color || '',
                lots: lots,
                quantity: lots.reduce(function (s, l) { return s + l.qty; }, 0),
                note: '리워크 입고 반납 · ' + reason,
                receivedBy: _currentActorLabel()
            });
            wipRestored = true;
            _pendingReworkInboundReturn = null;
            UIUtils.closeModal();
            const total = lots.reduce(function (s, l) { return s + l.qty; }, 0);
            UIUtils.toast(_fmt(total) + ' EA를 재사용 자재으로 반납했습니다.', 'success');
            _refreshInboundViews();
        } catch (e) {
            if (!wipRestored && returnRec && returnRec.id) {
                try {
                    const rec = Storage.getById(STORE, returnRec.id);
                    if (rec && rec.returnStatus === 'confirmed') await revertSiteReturn(returnRec.id);
                    await cancelSiteReturn(returnRec.id);
                } catch (e2) { /* ignore */ }
            }
            console.error('[PaintingInput] 리워크 입고 반납 실패:', e);
            UIUtils.toast('반납 실패: ' + (e && e.message ? e.message : e), 'error');
        }
    }

    function _notifySiteReturnPending(rec) {
        if (!rec) return;
        if (typeof AuthModule === 'undefined' || typeof AuthModule.sendInternalMessage !== 'function') return;
        try {
            const recipients = (typeof AuthModule.getIncomingInspNotifyRecipientIds === 'function')
                ? AuthModule.getIncomingInspNotifyRecipientIds('site_return')
                : [];
            if (!recipients.length) return;
            const lotsTxt = (Array.isArray(rec.lots) && rec.lots.length)
                ? rec.lots.map(function (l) {
                    return (l.lotNo || '-') + ' ' + UIUtils.formatNumber(l.qty) + ' EA';
                }).join(', ')
                : ((rec.lotNo || '-') + (rec.quantity != null ? (' ' + UIUtils.formatNumber(rec.quantity) + ' EA') : ''));
            AuthModule.sendInternalMessage({
                targetType: 'user',
                targetIds: recipients,
                title: '도장현장 반납 입고 확인 대기',
                body: [
                    '도장현장에서 사출 소재가 반납되어 사출창고 입고 확인이 필요합니다.',
                    '',
                    '반납일시: ' + (rec.date || '-'),
                    '라인: ' + (rec.line || rec.paintLine || '-'),
                    '차종: ' + (rec.carModel || '-'),
                    '사출명: ' + (rec.partName || '-'),
                    '컬러: ' + (rec.color || '-'),
                    'LOT: ' + (lotsTxt || '-'),
                    '합계수량: ' + UIUtils.formatNumber(rec.quantity) + ' EA',
                    rec.isReworkReturn ? '구분: 재사용 자재' : '',
                    '반납 사유: ' + (rec.returnReason || '-'),
                    '반납자: ' + (rec.returnedBy || '-')
                ].filter(Boolean).join('\n'),
                category: 'site_return_pending',
                priority: 'high'
            });
        } catch (e) {
            console.warn('[PaintingInputModule] 반납 입고 확인 통보 실패:', e);
        }
    }

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
        const isReworkReturn = _shouldReturnToReworkWip(Object.assign({}, opts, {
            line: line, carModel: carModel, partName: partName, lots: lots
        }));

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
            isReworkReturn: !!isReworkReturn,
            returnReason: opts.reason || '',
            returnStatus: 'pending',
            refWorkId: opts.workId || undefined,
            refInboundId: opts.refInboundId || undefined,
            refReworkOutId: opts.refReworkOutId || undefined,
            returnedBy: opts.returnedBy || '',
            // 실물 확인 여부 — 창고에서 「입고 처리」할 때 판단 근거가 된다
            physicalVerified: !!opts.physicalVerified,
            verifiedAt: opts.verifiedAt || ''
        }).then(function (rec) {
            _notifySiteReturnPending(rec);
            return rec;
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
        const rec = Storage.getById(STORE, id);
        if (!rec) {
            UIUtils.toast('입고 이력을 찾을 수 없습니다.', 'error');
            return null;
        }
        if (!_canCorrectInboundUseDate() && !_canConfirmInbound(rec.line || rec.paintLine)) {
            UIUtils.toast('도장 작업 입력 권한이 있어야 입고 이력을 수정할 수 있습니다.', 'warning');
            return null;
        }
        const next = { updatedAt: new Date().toISOString(), updatedBy: _currentActorLabel() };
        if (patch.matchedPaintDate !== undefined) {
            next.matchedPaintDate = String(patch.matchedPaintDate || '').slice(0, 10);
        }
        if (patch.matchedPlanId !== undefined) {
            next.matchedPlanId = String(patch.matchedPlanId || '').trim();
        }
        if (patch.useDate) {
            const useDate = String(patch.useDate).slice(0, 10);
            const time = String(rec.date || '').slice(11, 16)
                || (UIUtils.now ? UIUtils.now().slice(11, 16) : '');
            next.useDate = useDate;
            if (!patch.keepInboundDate) {
                next.date = useDate + (time ? ' ' + time : '');
            }
        }
        if (patch.quantity != null && patch.quantity !== '') {
            next.quantity = Math.max(0, Math.floor(Number(patch.quantity) || 0));
        }
        const qty = next.quantity != null ? next.quantity : (Number(rec.quantity) || 0);
        const curLotNo = String((rec.lots && rec.lots[0] && rec.lots[0].lotNo) || rec.lotNo || '').trim();
        if (patch.lotNo != null) {
            const lotNo = String(patch.lotNo).trim() || '무표기';
            next.lotNo = lotNo;
            next.lots = [{ lotNo: lotNo, qty: qty }];
        } else if ((patch.reassignLot || patch.useDate) && (!curLotNo || curLotNo === '무표기')) {
            // "무표기"(실제 LOT 번호 없음) 건은 같은 차종·사출명·컬러의 다른 "무표기" 건들과
            // 하나의 LOT 버킷으로 묶여 FIFO 잔량 계산이 서로 뒤섞인다. 사용일을 옮기면 이
            // 건이 (원래는 무관한) 다른 무표기 소진 기록보다 날짜상 앞서게 되어 그 소진에
            // 흡수당해 방금 옮긴 건까지 "잔량 0"으로 보이는 사고가 났다 — 실물은 그대로
            // 남아 있는데 화면에서 선택할 LOT이 없어져 실적 입력이 막힌다.
            // 진짜 LOT 번호가 없는 건이라면 이 건만의 고유 임시 LOT을 부여해 다른 무표기
            // 건과 절대 섞이지 않게 한다(rework-wip.js의 'RST' 접두어와 같은 패턴).
            const dayForLot = String(next.useDate || rec.useDate || rec.date || '').slice(0, 10).replace(/-/g, '').slice(2) || '000000';
            const uniqLot = 'DT' + dayForLot + Date.now().toString().slice(-5);
            next.lotNo = uniqLot;
            next.lots = [{ lotNo: uniqLot, qty: qty }];
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
        saveInboundMatch: saveInboundMatch,
        getIssuedQtyForWork: getIssuedQtyForWork,
        getReturnedQtyForWork: getReturnedQtyForWork,
        debugIssuedQtyInfo: _debugIssuedQtyInfo,
        canConfirmInbound: _canConfirmInbound,
        groupStock: _groupStock,
        getLotsByInjPart: getLotsByInjPart,
        getLotsByCarPart: getLotsByCarPart,
        getReworkSiteBalance: getReworkSiteBalance,
        getSiteReworkLots: getSiteReworkLots,
        isReworkSiteInbound: isReworkSiteInbound,
        getReceivedLotNosByCarPart: getReceivedLotNosByCarPart,
        getExactLotLedger: getExactLotLedger,
        partNamesMatch: _partNamesMatch,
        colorLooseMatch: _colorLooseMatch,
        deductForWork: deductForWork,
        writeOffExpiredSiteLots: writeOffExpiredSiteLots,
        createSiteReturn: createSiteReturn,
        openReworkInboundReturnModal: openReworkInboundReturnModal,
        submitReworkInboundReturn: submitReworkInboundReturn,
        notifyTodaySiteInbound: notifyTodaySiteInbound,
        listPendingReturns: listPendingReturns,
        confirmSiteReturn: confirmSiteReturn,
        cancelSiteReturn: cancelSiteReturn,
        revertSiteReturn: revertSiteReturn,
        receiveFromWarehouseOut: receiveFromWarehouseOut,
        autoReceiveFromWarehouseOut: autoReceiveFromWarehouseOut,
        runAutoSiteInbound: runAutoSiteInbound,
        dedupeDuplicateSiteInbounds: _dedupeSiteInboundByOutRef,
        findPlansForShipment: findPlansForShipment,
        getPlanQtyForShipment: getPlanQtyForShipment,
        getPlanEndTimeForShipment: getPlanEndTimeForShipment,
        getTodayLinePlanTotal: getTodayLinePlanTotal,
        moveShipmentLine: moveShipmentLine,
        canMoveShipmentLine: _canMoveShipmentLine,
        normLine: _normLine
    };
})();

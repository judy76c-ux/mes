/**
 * 재고 계산 공용 모듈 (InvCalc)
 *
 * 사출 창고(INJECTION_INVENTORY) 등 "입고/출고 원장"에서 재고를 계산하는 단일 진실 공급원.
 *
 * 왜 필요한가 — 과거에 같은 데이터를 두 가지 방식으로 계산해 화면 숫자가 서로 달랐다.
 *   (A) 상단 요약: quantity 를 그대로 더하고 빼는 순합계
 *   (B) LOT 목록 : 날짜순으로 재생하며 FIFO 로 차감(LOT 잔량이 0 밑으로 내려가지 않음)
 * (B)는 차감하지 못한 출고를 조용히 버렸기 때문에 (A)와 영구히 어긋났다.
 *
 * 이 모듈의 규칙:
 *   1) LOT 잔량 = 해당 LOT의 (입고 − 출고).  음수도 그대로 둔다(= 데이터 이상의 신호).
 *   2) 총 재고 = 모든 LOT 잔량의 합.  따라서 총 재고와 LOT 합계는 정의상 항상 일치한다.
 *   3) 수량의 진실은 lots[] 이다. lots[] 가 있으면 quantity 는 무시한다.
 *      (quantity 가 lots[] 합계와 다른 손상된 레코드가 실제로 존재한다)
 *   4) 날짜는 'YYYY-MM-DD' 와 'YYYY-MM-DD HH:MM' 이 섞여 저장된다.
 *      문자열 정렬 시 같은 날 'YYYY-MM-DD' 가 앞서므로, 항상 normDate()로 정규화해 비교한다.
 */
var InvCalc = (function () {

    function _num(v) {
        return Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
    }

    /** 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM' → { day, stamp } (stamp는 항상 분까지) */
    function normDate(value) {
        const s = String(value == null ? '' : value).trim();
        const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
        if (!m) return { day: '', stamp: '' };
        return { day: m[1], stamp: m[1] + ' ' + (m[2] || '00:00') };
    }

    /** 기록 1건 저장용 날짜 문자열 — 항상 'YYYY-MM-DD HH:MM' 으로 만든다. */
    function stampFor(dateLike) {
        const n = normDate(dateLike);
        if (!n.day) return '';
        // 시각이 없던 값이면 '지금 시각'을 붙여 같은 날 입고보다 뒤에 오게 한다.
        if (!/\d{2}:\d{2}/.test(String(dateLike || '').slice(10))) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            return n.day + ' ' + hh + ':' + mm;
        }
        return n.stamp;
    }

    /** 기록 1건이 담고 있는 LOT별 수량. lots[] 우선, 없으면 lotNo/quantity 단일 항목. */
    function entries(rec) {
        const arr = Array.isArray(rec && rec.lots)
            ? rec.lots.filter(l => l && _num(l.qty) > 0)
            : [];
        if (arr.length) {
            return arr.map(l => ({ lotNo: String(l.lotNo || '').trim() || '무표기', qty: _num(l.qty) }));
        }
        return [{ lotNo: String((rec && rec.lotNo) || '').trim() || '무표기', qty: _num(rec && rec.quantity) }];
    }

    /** 기록 1건의 총 수량(부호 없음). lots[] 가 진실. */
    function qtyOf(rec) {
        return entries(rec).reduce((s, e) => s + e.qty, 0);
    }

    /** 기록 1건의 부호 있는 수량 (출고는 음수). */
    function signedQtyOf(rec) {
        return (rec && rec.type === '출고' ? -1 : 1) * qtyOf(rec);
    }

    /** quantity 필드가 lots[] 합계와 어긋난 손상 레코드인가 */
    function isQtyCorrupted(rec) {
        if (!rec || !Array.isArray(rec.lots) || !rec.lots.length) return false;
        const declared = _num(rec.quantity);
        return declared > 0 && declared !== qtyOf(rec);
    }

    /** 어느 LOT에서도 차감하지 못한 출고를 담는 가상 LOT 이름 */
    const UNMATCHED = '(미차감 출고)';

    function _applyOutgoing(map, entriesList, unmatchedRef, deductionsRef) {
        entriesList.forEach(e => {
            let remaining = e.qty;

            if (map[e.lotNo] && map[e.lotNo].qty > 0) {
                const used = Math.min(map[e.lotNo].qty, remaining);
                if (deductionsRef && used > 0) deductionsRef.push({ lotNo: e.lotNo, qty: used });
                map[e.lotNo].qty -= used;
                remaining -= used;
            }
            if (remaining > 0) {
                Object.values(map)
                    .filter(l => l.qty > 0)
                    .sort((x, y) => (x.date || '').localeCompare(y.date || ''))
                    .some(l => {
                        const used = Math.min(l.qty, remaining);
                        if (deductionsRef && used > 0) deductionsRef.push({ lotNo: l.lotNo, qty: used });
                        l.qty -= used;
                        remaining -= used;
                        return remaining <= 0;
                    });
            }
            if (remaining > 0) {
                unmatchedRef.value += remaining;
                if (deductionsRef) deductionsRef.push({ lotNo: UNMATCHED, qty: remaining });
            }
        });
    }

    function _applyIncoming(map, rec, entriesList) {
        const nd = normDate(rec.date);
        entriesList.forEach(e => {
            if (!map[e.lotNo]) map[e.lotNo] = { lotNo: e.lotNo, qty: 0, date: '', supplier: '' };
            map[e.lotNo].qty += e.qty;
            if (!map[e.lotNo].date || nd.stamp > map[e.lotNo].date) {
                map[e.lotNo].date = nd.stamp;
                map[e.lotNo].supplier = rec.supplier || '';
            }
        });
    }

    function _totalFromMap(map, unmatched) {
        const total = Object.values(map).reduce((s, l) => s + l.qty, 0);
        return unmatched > 0 ? total - unmatched : total;
    }

    function _sortRecords(records) {
        return (records || []).slice().sort((a, b) => {
            const da = normDate(a.date), db = normDate(b.date);
            return da.day.localeCompare(db.day)
                || ((a.type === '출고' ? 1 : 0) - (b.type === '출고' ? 1 : 0))
                || da.stamp.localeCompare(db.stamp);
        });
    }

    /**
     * 원장을 시간순으로 재생하며 건별 거래 후 재고·차감 내역을 반환한다.
     * @returns {{ rec, stockBefore, stockAfter, unmatchedAfter, deductions }[]}
     */
    function replaySteps(records) {
        const map = {};
        const corrupted = [];
        const unmatchedRef = { value: 0 };
        const steps = [];

        _sortRecords(records).forEach(rec => {
            if (isQtyCorrupted(rec)) corrupted.push(rec);
            const stockBefore = _totalFromMap(map, unmatchedRef.value);
            const deductions = rec.type === '출고' ? [] : null;

            if (rec.type === '출고') {
                _applyOutgoing(map, entries(rec), unmatchedRef, deductions);
            } else {
                _applyIncoming(map, rec, entries(rec));
            }

            steps.push({
                rec,
                stockBefore,
                stockAfter: _totalFromMap(map, unmatchedRef.value),
                unmatchedAfter: unmatchedRef.value,
                deductions
            });
        });

        return steps;
    }

    /**
     * 원장 기록 목록 → LOT별 잔량 + 총 재고.
     *
     * 차감 규칙: ① 출고가 지정한 LOT에서 먼저 차감 → ② 부족하면 오래된 LOT부터(FIFO)
     *           → ③ 그래도 남으면 버리지 않고 UNMATCHED 가상 LOT에 음수로 쌓는다.
     * ③ 덕분에 "총 재고 === LOT 잔량 합계" 불변식이 어떤 데이터에서도 깨지지 않는다.
     * (과거에는 ③에서 조용히 버려서 상단 요약과 LOT 목록이 영구히 어긋났다)
     *
     * 반환: { total, lots:[{lotNo,qty,date,supplier}], unmatched, negatives:[...], corrupted:[...] }
     */
    function lotBalances(records) {
        const map = {};
        const corrupted = [];
        const unmatchedRef = { value: 0 };

        _sortRecords(records).forEach(rec => {
            if (isQtyCorrupted(rec)) corrupted.push(rec);

            if (rec.type === '출고') {
                _applyOutgoing(map, entries(rec), unmatchedRef, null);
            } else {
                _applyIncoming(map, rec, entries(rec));
            }
        });

        const unmatched = unmatchedRef.value;
        const lots = Object.values(map);
        if (unmatched > 0) lots.push({ lotNo: UNMATCHED, qty: -unmatched, date: '', supplier: '' });

        const total = _totalFromMap(map, unmatched);
        return { total, lots, unmatched, negatives: lots.filter(l => l.qty < 0), corrupted };
    }

    /** 원장 기록 목록 → 총 재고(순합계). lotBalances().total 과 항상 같다. */
    function totalStock(records) {
        return (records || []).reduce((s, rec) => s + signedQtyOf(rec), 0);
    }

    return { normDate, stampFor, entries, qtyOf, signedQtyOf, isQtyCorrupted, lotBalances, replaySteps, totalStock, UNMATCHED };
})();

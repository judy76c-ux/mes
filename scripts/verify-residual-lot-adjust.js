/**
 * 레이저 잔량 LOT 보정 로직 검증 (laser-wip.js 핵심 함수 동일 구현)
 * 실행: node scripts/verify-residual-lot-adjust.js
 */
'use strict';

function _normalizePaintLot(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw || raw === '-') return '-';
    const s = raw.replace(/-/g, '');
    if (/^\d{6}$/.test(s)) return s;
    if (/^\d{8}$/.test(s)) return s.slice(2, 8);
    if (s.length > 8) return s.slice(2, 8);
    return s || raw;
}

function _normalizeInjLot(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s || s === '-') return '-';
    return s.split(',').map(p => p.trim()).filter(Boolean).join(', ');
}

function _residualLotKey(paintLot, injLot) {
    return _normalizePaintLot(paintLot) + '|' + _normalizeInjLot(injLot);
}

function _workResidualLotKeys(w) {
    const paintLots = Array.isArray(w.paintLots) && w.paintLots.length ? w.paintLots : [];
    const paintLot = paintLots.length && paintLots[0] && paintLots[0].paintDate
        ? _normalizePaintLot(paintLots[0].paintDate)
        : _normalizePaintLot(w.paintDate || w.date || '');
    const injLots = paintLots.length
        ? paintLots.map(l => _normalizeInjLot(l && l.lotNo || '')).filter(v => v && v !== '-')
        : [_normalizeInjLot(w.paintLot || w.lotNo || '')].filter(v => v && v !== '-');
    const injStr = injLots.length ? injLots.join(', ') : '-';
    return [_residualLotKey(paintLot, injStr)];
}

function _calcResidualLotDetail(works, carModel, partName, color) {
    const laserAllWorks = works.filter(w =>
        (w.carModel || '') === carModel && (w.partName || '') === partName && (!color || (w.color || '') === color)
    );

    const lotMap = {};
    laserAllWorks.filter(w => !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut).forEach(w => {
        const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
        const packUnit = Number(w.packUnit) || 0;
        const resQty = Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
        if (resQty <= 0) return;
        _workResidualLotKeys(w).forEach(key => {
            const pipeIdx = key.indexOf('|');
            const paintLot = pipeIdx >= 0 ? key.slice(0, pipeIdx) : key;
            const injLot = pipeIdx >= 0 ? key.slice(pipeIdx + 1) : '-';
            if (!lotMap[key]) lotMap[key] = { paintLot, injLot, qty: 0 };
            lotMap[key].qty += resQty;
        });
    });

    let manualAdj = 0;
    laserAllWorks.filter(w => (w.isResidualManualIn || w.isResidualManualOut) && w.isResidualLotAdjust && w.residualLotAbsoluteQty == null).forEach(w => {
        if (w.isResidualAuditOnly) return;
        const qty = Number(w.quantity) || 0;
        const paintLot = _normalizePaintLot(w.residualPaintLot || w.paintDate || w.date || '-');
        const injLot = _normalizeInjLot(w.lotNo || '-');
        const key = _residualLotKey(paintLot, injLot);
        if (!lotMap[key]) lotMap[key] = { paintLot, injLot, qty: 0 };
        lotMap[key].qty += w.isResidualManualIn ? qty : -qty;
    });
    laserAllWorks.filter(w => (w.isResidualManualIn || w.isResidualManualOut) && !w.isResidualLotAdjust).forEach(w => {
        if (w.isResidualAuditOnly) return;
        const qty = Number(w.quantity) || 0;
        manualAdj += w.isResidualManualIn ? qty : -qty;
    });
    laserAllWorks.filter(w => w.isResidualLotAdjust && w.residualLotAbsoluteQty != null && !w.isResidualAuditOnly).sort((a, b) =>
        String(a.date || '').localeCompare(String(b.date || ''))
    ).forEach(w => {
        const paintLot = _normalizePaintLot(w.residualPaintLot || w.paintDate || w.date || '-');
        const injLot = _normalizeInjLot(w.lotNo || '-');
        const key = _residualLotKey(paintLot, injLot);
        if (!lotMap[key]) lotMap[key] = { paintLot, injLot, qty: 0 };
        lotMap[key].qty = Math.max(0, Number(w.residualLotAbsoluteQty) || 0);
    });

    const lots = Object.values(lotMap)
        .map(l => ({ paintLot: l.paintLot, injLot: l.injLot, qty: Math.round(l.qty) }))
        .filter(l => l.qty > 0);
    return { lots, manualAdj };
}

function _calcLaserResidualQty(works, carModel, partName, color) {
    let total = 0;
    works.filter(w => !w.isManualOut && !w.isResidualManualIn && !w.isResidualManualOut).forEach(w => {
        if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return;
        if (color && (w.color || '') !== color) return;
        const goodQty = Number(w.inspectionGoodQty) || Number(w.completedQty) || Number(w.quantity) || 0;
        const packUnit = Number(w.packUnit) || 0;
        total += Number(w.laserResidualQty) || (packUnit > 0 ? Math.max(0, goodQty - Math.floor(goodQty / packUnit) * packUnit) : 0);
    });
    works.filter(w => w.isResidualManualIn || w.isResidualManualOut).forEach(w => {
        if (w.isResidualAuditOnly) return;
        if ((w.carModel || '') !== carModel || (w.partName || '') !== partName) return;
        if (color && (w.color || '') !== color) return;
        const qty = Number(w.quantity) || 0;
        total += w.isResidualManualIn ? qty : -qty;
    });
    return Math.max(0, total);
}

function assert(cond, msg) {
    if (!cond) throw new Error('FAIL: ' + msg);
}

function test(name, fn) {
    try {
        fn();
        console.log('  OK  ' + name);
        return true;
    } catch (e) {
        console.error('  NG  ' + name + ' — ' + e.message);
        return false;
    }
}

let passed = 0;
let failed = 0;

function run(name, fn) {
    if (test(name, fn)) passed++; else failed++;
}

console.log('=== 레이저 잔량 LOT 보정 검증 ===\n');

run('도장 LOT 6자리(260611) 정규화 유지', () => {
    assert(_normalizePaintLot('260611') === '260611', 'expected 260611');
    assert(_normalizePaintLot('2026-06-11') === '260611', 'expected 260611 from ISO');
});

run('LOT 키: 보정 저장 키 ↔ 원본 작업 키 일치', () => {
    const work = {
        carModel: 'P702', partName: 'P702 Button-M', color: 'BK',
        laserResidualQty: 803, packUnit: 1100,
        paintLots: [{ paintDate: '2026-06-11', lotNo: '260318', qty: 5500 }]
    };
    const keys = _workResidualLotKeys(work);
    assert(keys[0] === '260611|260318', 'got ' + keys[0]);
    assert(_residualLotKey('260611', '260318') === keys[0], 'adjust key mismatch');
});

run('단일 원본 직접 수정 시 LOT·총잔량 반영', () => {
    const works = [{
        id: 'w1', carModel: 'P702', partName: 'P702 Button-M', color: 'BK',
        laserResidualQty: 700, packUnit: 1100,
        paintLots: [{ paintDate: '2026-06-11', lotNo: '260318', qty: 5500 }]
    }, {
        id: 'a1', carModel: 'P702', partName: 'P702 Button-M', color: 'BK',
        isResidualLotAdjust: true, isResidualAuditOnly: true,
        isResidualManualOut: true, quantity: 103,
        residualPaintLot: '260611', lotNo: '260318', date: '2026-07-10'
    }];
    const detail = _calcResidualLotDetail(works, 'P702', 'P702 Button-M', 'BK');
    assert(detail.lots.length === 1 && detail.lots[0].qty === 700, 'lot qty=' + (detail.lots[0] && detail.lots[0].qty));
    assert(_calcLaserResidualQty(works, 'P702', 'P702 Button-M', 'BK') === 700, 'total should be 700');
});

run('감사 전용 기록은 재고 이중 차감 없음', () => {
    const works = [{
        id: 'w1', carModel: 'P702', partName: 'P702 Button-M', color: 'BK',
        laserResidualQty: 700, packUnit: 1100,
        paintLots: [{ paintDate: '2026-06-11', lotNo: '260318', qty: 5500 }]
    }, {
        id: 'a1', carModel: 'P702', partName: 'P702 Button-M', color: 'BK',
        isResidualLotAdjust: true, isResidualAuditOnly: true,
        isResidualManualOut: true, quantity: 103,
        residualPaintLot: '260611', lotNo: '260318'
    }];
    assert(_calcLaserResidualQty(works, 'P702', 'P702 Button-M', 'BK') === 700, 'audit must not subtract again');
});

run('복수 원본: 절대 수량 보정 레코드 적용', () => {
    const works = [
        { id: 'w1', carModel: 'X', partName: 'Y', color: '', laserResidualQty: 400,
          paintLots: [{ paintDate: '260611', lotNo: '260318', qty: 100 }] },
        { id: 'w2', carModel: 'X', partName: 'Y', color: '', laserResidualQty: 403,
          paintLots: [{ paintDate: '260611', lotNo: '260318', qty: 100 }] },
        { id: 'adj', carModel: 'X', partName: 'Y', color: '',
          isResidualLotAdjust: true, isResidualManualOut: true, quantity: 103,
          residualLotAbsoluteQty: 700, residualPaintLot: '260611', lotNo: '260318', date: '2026-07-01' }
    ];
    const detail = _calcResidualLotDetail(works, 'X', 'Y', '');
    assert(detail.lots[0].qty === 700, 'absolute override=' + detail.lots[0].qty);
    assert(_calcLaserResidualQty(works, 'X', 'Y', '') === 700, 'total with manual diff');
});

run('이전 델타 보정 중립화 후 LOT=원본 직접 수정값', () => {
    const works = [
        { id: 'w1', carModel: 'X', partName: 'Y', color: '', laserResidualQty: 798,
          paintLots: [{ paintDate: '2026-06-11', lotNo: '260318', qty: 100 }] },
        { id: 'old1', carModel: 'X', partName: 'Y', color: '',
          isResidualLotAdjust: true, isResidualManualOut: true, quantity: 1, isResidualAuditOnly: true,
          residualPaintLot: '260611', lotNo: '260318' }
    ];
    const detail = _calcResidualLotDetail(works, 'X', 'Y', '');
    assert(detail.lots[0].qty === 798, 'lot=' + detail.lots[0].qty);
    assert(_calcLaserResidualQty(works, 'X', 'Y', '') === 798, 'total=' + _calcLaserResidualQty(works, 'X', 'Y', ''));
});

console.log('\n결과: ' + passed + ' 통과, ' + failed + ' 실패');
process.exit(failed > 0 ? 1 : 0);

/**
 * Trace — 완제품 계보(genealogy) 승계 유틸
 *
 * 목적: 하나의 완제품에 사출 LOT·사출 수입검사일·도료 LOT·도료 수입검사일·도장 LOT·
 *       레이저 LOT·출하검사일이 모두 남게 한다.
 *
 * 원칙: **조회하지 말고 승계한다.**
 *   기존 화면들은 후공정에서 `품명+LOT`으로 수입검사 테이블을 매번 뒤져 검사일을 표시했다.
 *   그 방식은 세 가지 문제가 있다.
 *     1) 상위 기록(수입검사·창고 입고)이 삭제·정리되면 이력이 통째로 끊긴다.
 *     2) LOT번호가 생산일자 기준이라 재사용되어, 다른 검사건이 잘못 매칭된다.
 *     3) 상위 기록을 수정하면 이미 출하된 제품의 이력까지 소급 변경된다(추적성 결격).
 *   따라서 각 공정은 자기 시점의 확정값을 trace 로 레코드에 박아 저장하고,
 *   다음 공정은 그것을 복사해 자기 단계만 덧붙인다.
 *
 * 조회(lookup)는 trace 가 없는 과거 데이터를 위한 **폴백**으로만 쓴다.
 */
var Trace = (function () {
    'use strict';

    function _s(v) { return String(v == null ? '' : v).trim(); }

    /** 얕은 복사 — 상위 trace 를 그대로 물려주되 참조 공유를 피한다 */
    function clone(trace) {
        if (!trace || typeof trace !== 'object') return {};
        try { return JSON.parse(JSON.stringify(trace)); }
        catch (e) { return {}; }
    }

    /**
     * 상위 trace 에 이번 공정 정보를 얹는다.
     * 이미 값이 있는 단계는 덮어쓰지 않는다(상위에서 확정된 값이 우선).
     */
    function merge(parentTrace, patch) {
        const out = clone(parentTrace);
        Object.keys(patch || {}).forEach(function (stage) {
            const incoming = patch[stage];
            if (!incoming) return;
            const cur = out[stage] && typeof out[stage] === 'object' ? out[stage] : {};
            const next = Object.assign({}, cur);
            Object.keys(incoming).forEach(function (k) {
                const v = incoming[k];
                if (v == null || v === '') return;              // 빈 값으로 기존 값을 지우지 않는다
                if (next[k] == null || next[k] === '') next[k] = v;
            });
            out[stage] = next;
        });
        out.updatedAt = new Date().toISOString();
        return out;
    }

    /**
     * 사출 수입검사일 조회 — trace 를 "처음 만들 때"만 쓰는 확정용 조회.
     * 창고 입고 기록의 inspDate(복사본)를 1순위로 본다. 그게 그 입고 건에 실제로 붙은
     * 검사일이라, 품명+LOT 재매칭보다 오매칭 위험이 낮기 때문이다.
     */
    function resolveInjInspection(partName, lotNo, invRecord) {
        const part = _s(partName);
        const lot = _s(lotNo);
        const res = { inspDate: '', inspId: '', supplier: '' };
        if (!part || !lot) return res;

        if (invRecord) {
            const rows = (invRecord.lots && invRecord.lots.length)
                ? invRecord.lots
                : (invRecord.lotNo ? [{ lotNo: invRecord.lotNo }] : []);
            const hit = rows.find(function (l) { return _s(l.lotNo) === lot; });
            res.inspDate = _s(hit && hit.inspDate) || _s(invRecord.inspDate);
            res.inspId = _s(invRecord.inspId);
            res.supplier = _s(invRecord.supplier);
            if (res.inspDate) return res;
        }

        // 폴백 — 검사 테이블에서 품명+LOT 로 찾는다 (구 데이터용)
        if (typeof Storage === 'undefined' || typeof DB === 'undefined') return res;
        const inspections = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const matched = inspections.filter(function (insp) {
            if (_s(insp.partName) !== part) return false;
            const lots = (insp.lots && insp.lots.length)
                ? insp.lots
                : (insp.lotNo ? [{ lotNo: insp.lotNo }] : []);
            return lots.some(function (l) { return _s(l.lotNo) === lot; });
        });
        if (!matched.length) return res;
        // 여러 건이면 가장 최근 검사건 — LOT 재사용 시 최신 생산분일 가능성이 높다
        matched.sort(function (a, b) { return _s(b.date).localeCompare(_s(a.date)); });
        res.inspDate = _s(matched[0].date);
        res.inspId = _s(matched[0].id);
        res.supplier = res.supplier || _s(matched[0].supplierName);
        return res;
    }

    /** 사출 단계 trace 생성 — 도장 입고 시점에 사출 계보를 확정한다 */
    function buildInjStage(opts) {
        opts = opts || {};
        const insp = resolveInjInspection(opts.partName, opts.lotNo, opts.invRecord);
        return {
            inj: {
                lot: _s(opts.lotNo),
                inspDate: insp.inspDate,
                inspId: insp.inspId,
                supplier: insp.supplier,
                carModel: _s(opts.carModel),
                partName: _s(opts.partName),
                color: _s(opts.color),
                capturedAt: new Date().toISOString()
            }
        };
    }

    /**
     * 도장 작업처럼 여러 사출 LOT을 한 번에 투입하는 단계용.
     * LOT 하나하나의 계보를 배열로 남긴다 — 완제품 1개에 사출 LOT이 여럿 섞일 수 있기 때문.
     * 상위 도장 입고 레코드에 이미 확정된 trace 가 있으면 그것을 그대로 승계한다(재조회 안 함).
     */
    function buildInjLotsStage(lots, opts) {
        opts = opts || {};
        const incoming = (typeof Storage !== 'undefined' && typeof DB !== 'undefined')
            ? (Storage.getAll(DB.STORES.PAINTING_INCOMING) || [])
            : [];
        const rows = [];
        (lots || []).forEach(function (l) {
            const lot = _s(l && l.lotNo);
            if (!lot) return;
            const part = _s(l && l.partName) || _s(opts.partName);
            if (rows.some(function (r) { return r.lot === lot && r.partName === part; })) return;

            // ① 도장 입고에서 확정된 계보 승계
            const src = incoming.find(function (r) {
                if (_s(r.lotNo) !== lot) return false;
                if (part && _s(r.partName) && _s(r.partName) !== part) return false;
                const t = of(r);
                return !!(t.inj && _s(t.inj.inspDate));
            });
            if (src) {
                const t = of(src).inj || {};
                rows.push({ lot: lot, partName: part, inspDate: _s(t.inspDate),
                            inspId: _s(t.inspId), supplier: _s(t.supplier) });
                return;
            }
            // ② 구 데이터 — 조회로 확정
            const r = resolveInjInspection(part, lot, null);
            rows.push({ lot: lot, partName: part, inspDate: r.inspDate,
                        inspId: r.inspId, supplier: r.supplier });
        });

        if (!rows.length) return {};
        const head = rows.find(function (r) { return !!r.inspDate; }) || rows[0];
        return {
            inj: {
                lot: head.lot,
                inspDate: head.inspDate,
                inspId: head.inspId,
                supplier: head.supplier,
                partName: head.partName,
                carModel: _s(opts.carModel),
                color: _s(opts.color),
                capturedAt: new Date().toISOString()
            },
            injLots: rows
        };
    }

    /**
     * 도료 1건의 수입검사 정보 — 도료 창고(PAINT_INVENTORY) 입고 기록에서 확정한다.
     * 우선순위: 입고 기록의 inspDate → sourceInspectionId 로 연결된 도료 수입검사 → ''.
     * (paint-inventory 의 _resolveInspDate 와 동일 규칙. 여기서는 "확정 저장용"으로만 쓴다)
     */
    function resolvePaintInspection(materialId, prodLot) {
        const res = { inspDate: '', inspId: '' };
        if (typeof Storage === 'undefined' || typeof DB === 'undefined') return res;
        const matId = _s(materialId);
        const lot = _s(prodLot);
        if (!matId) return res;

        const inbounds = (Storage.getAll(DB.STORES.PAINT_INVENTORY) || [])
            .filter(function (r) {
                if (!r || r.type === '출고' || _s(r.materialId) !== matId) return false;
                if (lot && _s(r.prodLot || r.lotNo) !== lot) return false;
                return !!(r.inspDate || r.sourceInspectionId);
            })
            .sort(function (a, b) {
                const sa = (typeof InvCalc !== 'undefined' && InvCalc.recordStamp) ? InvCalc.recordStamp(a) : _s(a.date);
                const sb = (typeof InvCalc !== 'undefined' && InvCalc.recordStamp) ? InvCalc.recordStamp(b) : _s(b.date);
                return String(sb).localeCompare(String(sa));
            });

        for (let i = 0; i < inbounds.length; i++) {
            const r = inbounds[i];
            if (_s(r.inspDate)) {
                res.inspDate = _s(r.inspDate);
                res.inspId = _s(r.sourceInspectionId);
                return res;
            }
            if (_s(r.sourceInspectionId)) {
                try {
                    const insp = Storage.getById(DB.STORES.PAINT_INCOMING_INSPECTIONS, _s(r.sourceInspectionId));
                    if (insp && insp.date) {
                        res.inspDate = _s(insp.date);
                        res.inspId = _s(insp.id);
                        return res;
                    }
                } catch (e) { /* ignore */ }
            }
        }
        return res;
    }

    /** 도료 단계 trace — 배합(도료사용등록) 확정 시 사용 도료별 LOT·수입검사일을 박아 넣는다 */
    function buildPaintStage(usages, opts) {
        opts = opts || {};
        const materials = [];
        (usages || []).forEach(function (u) {
            const lot = _s(u && (u.prodLot || u.lotNo));
            const matId = _s(u && u.materialId);
            if (!matId && !lot) return;
            if (materials.some(function (m) { return m.materialId === matId && m.prodLot === lot; })) return;
            const insp = resolvePaintInspection(matId, lot);
            materials.push({
                materialId: matId,
                name: _s(u && u.paintName),
                supplier: _s(u && u.supplier),
                role: _s(u && u.role),
                prodLot: lot,
                inspDate: insp.inspDate,
                inspId: insp.inspId
            });
        });
        if (!materials.length) return {};
        return {
            paint: {
                lot: _s(opts.productionLot),
                mixId: _s(opts.mixId),
                workId: _s(opts.workId),
                line: _s(opts.line),
                color: _s(opts.color),
                materials: materials,
                capturedAt: new Date().toISOString()
            }
        };
    }

    /** 도료 계보 요약 — "도료명(제조LOT, 검사일)" 문자열 배열 */
    function paintMaterialLabels(record) {
        const t = of(record);
        const mats = (t.paint && t.paint.materials) || [];
        return mats.map(function (m) {
            const parts = [];
            if (m.prodLot) parts.push(m.prodLot);
            if (m.inspDate) parts.push('검사 ' + String(m.inspDate).slice(0, 10));
            return m.name ? m.name + (parts.length ? '(' + parts.join(' · ') + ')' : '') : parts.join(' · ');
        }).filter(Boolean);
    }

    /**
     * 레코드에서 trace 를 꺼낸다. 없으면 빈 객체.
     * 화면은 이 값을 1순위로 쓰고, 비어 있을 때만 기존 조회 로직으로 폴백해야 한다.
     */
    function of(record) {
        return (record && record.trace && typeof record.trace === 'object') ? record.trace : {};
    }

    /** 사출 수입검사일 — trace 우선, 없으면 '' (호출부가 폴백 처리) */
    function injInspDate(record) {
        const t = of(record);
        return (t.inj && _s(t.inj.inspDate)) || '';
    }

    return {
        clone: clone,
        merge: merge,
        of: of,
        injInspDate: injInspDate,
        buildInjStage: buildInjStage,
        buildInjLotsStage: buildInjLotsStage,
        buildPaintStage: buildPaintStage,
        paintMaterialLabels: paintMaterialLabels,
        resolveInjInspection: resolveInjInspection,
        resolvePaintInspection: resolvePaintInspection
    };
})();

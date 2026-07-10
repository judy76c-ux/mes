/**
 * 재고 상세 모달 — 입출고 이력 섹션 공용 UI (사출 창고 패턴)
 */
var StockDetailUI = (function() {

    function _stockColor(val) {
        if (val == null) return 'var(--text-muted)';
        return val < 0 ? 'var(--accent-red)' : (val === 0 ? 'var(--text-muted)' : 'var(--accent-blue)');
    }

    function _formatDeductionSummary(deductions) {
        if (!deductions || !deductions.length) return '';
        return deductions.map(function(d) {
            if (d.lotNo === InvCalc.UNMATCHED) return '미차감 ' + UIUtils.formatNumber(d.qty);
            return d.lotNo + ' −' + UIUtils.formatNumber(d.qty);
        }).join(', ');
    }

    function _escAttr(s) {
        return String(s || '').replace(/"/g, '&quot;');
    }

    function renderInvStepRow(step, isCurrent, opts) {
        opts = opts || {};
        const d = step.rec;
        const isOut = d.type === '출고';
        const route = (opts.routeFn || function() { return { label: '-', color: '#6b7280', detail: '' }; })(d);
        const lotText = opts.lotFn
            ? opts.lotFn(d)
            : ((Array.isArray(d.lots) && d.lots.length)
                ? d.lots.map(function(l) { return l.lotNo; }).filter(Boolean).join(', ')
                : (d.lotNo || '무표기'));
        const qty = InvCalc.qtyOf(d);
        const who = opts.whoFn ? opts.whoFn(d) : (d.receivedBy || d.outgoingBy || d.issuedBy || '-');
        const dateStamp = InvCalc.normDate(d.date).stamp || (d.date || '-');
        const stockBefore = step.stockBefore;
        const stockAfter = step.stockAfter;
        const unmatchedAfter = step.unmatchedAfter;
        const dedTitle = step.deductions ? _formatDeductionSummary(step.deductions) : (d.deductionSummary || '');
        const beforeColor = _stockColor(stockBefore);
        const afterColor = _stockColor(stockAfter);
        const detail = _escAttr(route.detail);

        return `
            <tr${isCurrent ? ' style="background:rgba(37,99,235,.05);"' : ''}>
                <td style="white-space:nowrap;font-size:0.8rem;">${dateStamp}</td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;
                        background:${isOut ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'};
                        color:${isOut ? '#dc2626' : '#16a34a'};">${isOut ? '출고' : '입고'}</span>
                </td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:4px;
                        border:1px solid ${route.color}44;background:${route.color}12;color:${route.color};">${route.label}</span>
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;max-width:160px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${detail}">${route.detail || ''}</div>
                </td>
                <td style="font-size:0.8rem;">${lotText}</td>
                <td style="text-align:right;font-weight:600;color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};">
                    ${isOut ? '−' : '+'}${UIUtils.formatNumber(qty)}
                </td>
                <td style="text-align:right;font-weight:700;color:${beforeColor};white-space:nowrap;">
                    ${stockBefore != null ? UIUtils.formatNumber(stockBefore) : '-'}
                </td>
                <td style="text-align:right;white-space:nowrap;"${dedTitle ? ` title="${_escAttr(dedTitle)}"` : ''}>
                    <div style="font-weight:700;color:${afterColor};">${stockAfter != null ? UIUtils.formatNumber(stockAfter) : '-'}${isCurrent ? ' <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">현재</span>' : ''}</div>
                    ${unmatchedAfter > 0 ? `<div style="font-size:0.68rem;color:var(--accent-red);font-weight:700;">미차감 ${UIUtils.formatNumber(unmatchedAfter)}</div>` : ''}
                </td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${who || '-'}</td>
            </tr>`;
    }

    function _escHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, function(ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function renderSimpleStepRow(step, isCurrent) {
        const item = step.item;
        const isOut = !!item.isOut;
        const route = { label: item.routeLabel || '-', color: item.routeColor || '#6b7280', detail: item.routeDetail || '' };
        const lotText = _escHtml(item.lot || '-');
        const qty = Number(item.qty) || 0;
        const who = _escHtml(item.note || '-');
        const dateStamp = _escHtml(item.date || '-');
        const beforeColor = _stockColor(step.stockBefore);
        const afterColor = _stockColor(step.stockAfter);
        const detail = _escAttr(route.detail);

        return `
            <tr${isCurrent ? ' style="background:rgba(37,99,235,.05);"' : ''}>
                <td style="white-space:nowrap;font-size:0.8rem;">${dateStamp}</td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:999px;
                        background:${isOut ? 'rgba(220,38,38,.10)' : 'rgba(22,163,74,.10)'};
                        color:${isOut ? '#dc2626' : '#16a34a'};">${isOut ? '출고' : '입고'}</span>
                </td>
                <td style="white-space:nowrap;">
                    <span style="font-size:0.72rem;font-weight:700;padding:1px 7px;border-radius:4px;
                        border:1px solid ${route.color}44;background:${route.color}12;color:${route.color};">${_escHtml(route.label)}</span>
                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;max-width:160px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${detail}">${_escHtml(route.detail || '')}</div>
                </td>
                <td style="font-size:0.8rem;font-family:monospace;">${lotText}</td>
                <td style="text-align:right;font-weight:600;color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'};">
                    ${isOut ? '−' : '+'}${UIUtils.formatNumber(qty)}
                </td>
                <td style="text-align:right;font-weight:700;color:${beforeColor};white-space:nowrap;">
                    ${step.stockBefore != null ? UIUtils.formatNumber(step.stockBefore) : '-'}
                </td>
                <td style="text-align:right;white-space:nowrap;">
                    <div style="font-weight:700;color:${afterColor};">${step.stockAfter != null ? UIUtils.formatNumber(step.stockAfter) : '-'}${isCurrent ? ' <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">현재</span>' : ''}</div>
                </td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${who}</td>
            </tr>`;
    }

    function simpleReplaySteps(items, getSignedQty) {
        const sorted = (items || []).slice().sort(function(a, b) {
            return String(a.date || '').localeCompare(String(b.date || ''));
        });
        var running = 0;
        return sorted.map(function(item) {
            var delta = getSignedQty(item);
            var before = running;
            running += delta;
            return { item: item, stockBefore: before, stockAfter: running };
        });
    }

    function buildHistorySection(rowsHtml, totalCount) {
        const empty = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">입출고 이력이 없습니다.</td></tr>`;
        return `
            <div style="margin-top:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--text-muted);">history</span>
                <strong style="font-size:0.86rem;">입출고 이력</strong>
                <span style="font-size:0.75rem;color:var(--text-muted);">전체 ${totalCount}건 · 최신순 (위가 최근)</span>
                <span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">아래에서 위로 읽으면 재고 변화 흐름</span>
            </div>
            <div style="overflow:auto;margin-top:6px;max-height:380px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>일시</th>
                            <th>구분</th>
                            <th>경로</th>
                            <th>LOT번호</th>
                            <th style="text-align:right;">입출고 수량</th>
                            <th style="text-align:right;">기존 수량</th>
                            <th style="text-align:right;">현재 수량</th>
                            <th>담당</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || empty}
                    </tbody>
                </table>
            </div>`;
    }

    function buildInvHistorySection(records, opts) {
        const steps = InvCalc.replaySteps(records || []).slice().reverse();
        const rows = steps.map(function(step, idx) {
            return renderInvStepRow(step, idx === 0, opts);
        }).join('');
        return buildHistorySection(rows, (records || []).length);
    }

    function buildSimpleHistorySection(items, opts) {
        opts = opts || {};
        const getSigned = opts.getSignedQty || function(item) {
            return item.isOut ? -(Number(item.qty) || 0) : (Number(item.qty) || 0);
        };
        const steps = simpleReplaySteps(items, getSigned).slice().reverse();
        const rows = steps.map(function(step, idx) {
            return renderSimpleStepRow(step, idx === 0);
        }).join('');
        return buildHistorySection(rows, (items || []).length);
    }

    function lotBalancesFromRecords(records, opts) {
        opts = opts || {};
        const balance = InvCalc.lotBalances(records || []);
        const positiveOnly = opts.positiveOnly !== false;
        const lots = balance.lots
            .filter(function(l) {
                if (l.lotNo === InvCalc.UNMATCHED) return !positiveOnly;
                return positiveOnly ? l.qty > 0 : l.qty !== 0;
            })
            .sort(function(a, b) {
                return (b.date || '').localeCompare(a.date || '') || String(a.lotNo).localeCompare(String(b.lotNo));
            });
        return { balance: balance, lots: lots };
    }

    function buildLotTableSection(opts) {
        opts = opts || {};
        const title = opts.title || '현재 보관 LOT';
        const headers = opts.headers || ['입고일', 'LOT번호', '생산처', '현재 수량'];
        const colSpan = opts.colSpan || headers.length;
        const emptyText = opts.emptyText || '현재 보관중인 LOT가 없습니다.';
        const headHtml = headers.map(function(h) {
            const right = /수량/.test(h) ? ' style="text-align:right;"' : '';
            return '<th' + right + '>' + h + '</th>';
        }).join('');
        const body = opts.rowsHtml || ('<tr><td colspan="' + colSpan + '" style="text-align:center;padding:20px;color:var(--text-muted);">' + emptyText + '</td></tr>');
        return `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--text-muted);">inventory_2</span>
                <strong style="font-size:0.86rem;">${title}</strong>
            </div>
            <div style="overflow-x:auto;margin-bottom:4px;">
                <table class="data-table">
                    <thead><tr>${headHtml}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>`;
    }

    return {
        buildHistorySection,
        buildInvHistorySection,
        buildSimpleHistorySection,
        buildLotTableSection,
        lotBalancesFromRecords,
        renderInvStepRow,
        renderSimpleStepRow,
        simpleReplaySteps
    };
})();

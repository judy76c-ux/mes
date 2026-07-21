/**
 * 생산계획 사출재고 vs 창고(컬러별) 불일치 진단
 * 구버전: 입고만 컬러 필터, 출고는 품명 전체 차감
 * 수정후: 입·출고 모두 컬러 필터 (창고와 동일)
 *
 * Usage: node scripts/diagnose-inj-plan-stock.js [apiBase]
 */
const API = process.argv[2] || 'http://192.168.10.2:3000';

const COLOR_MAP = {
  '블랙': 'black', '검정': 'black', '검은색': 'black', '흑': 'black',
  '화이트': 'white', '흰색': 'white', '백색': 'white', '백': 'white',
  '그레이': 'gray', '회색': 'gray', '그레': 'gray',
  '실버': 'silver', '은색': 'silver', '은': 'silver',
  '레드': 'red', '빨강': 'red', '빨간색': 'red', '적색': 'red',
  '블루': 'blue', '파랑': 'blue', '파란색': 'blue', '청색': 'blue',
  '그린': 'green', '초록': 'green', '녹색': 'green',
  '옐로우': 'yellow', '노랑': 'yellow', '노란색': 'yellow', '황색': 'yellow',
  '골드': 'gold', '금색': 'gold', '금': 'gold',
  '오렌지': 'orange', '주황': 'orange', '주황색': 'orange',
  '퍼플': 'purple', '보라': 'purple', '보라색': 'purple',
  '브라운': 'brown', '갈색': 'brown',
  '베이지': 'beige', '크림': 'beige',
  bk: 'black', blk: 'black', wh: 'white', wht: 'white',
  si: 'silver', sil: 'silver', sl: 'silver',
  gy: 'gray', gry: 'gray', rd: 'red',
  bl: 'blue', blu: 'blue', gn: 'green', grn: 'green',
  yl: 'yellow', yel: 'yellow', gd: 'gold',
  or: 'orange', org: 'orange', vi: 'purple', vio: 'purple',
  br: 'brown', brn: 'brown'
};

function normColor(c) {
  const s = String(c || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  if (COLOR_MAP[s] !== undefined) return COLOR_MAP[s];
  const keys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (s.startsWith(k)) return COLOR_MAP[k];
  }
  return s;
}

function colorsMatch(a, b) {
  const na = normColor(a);
  const nb = normColor(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function qtyOf(rec) {
  if (Array.isArray(rec.lots) && rec.lots.length) {
    return rec.lots.reduce((s, l) => s + (Number(String(l && l.qty != null ? l.qty : 0).replace(/,/g, '')) || 0), 0);
  }
  return Number(String(rec.quantity != null ? rec.quantity : 0).replace(/,/g, '')) || 0;
}

function signedQty(rec) {
  const q = qtyOf(rec);
  return rec.type === '출고' ? -q : q;
}

function totalStock(records) {
  return records.reduce((s, r) => s + signedQty(r), 0);
}

async function fetchStore(name) {
  const res = await fetch(`${API}/api/docs/${name}`);
  if (!res.ok) throw new Error(`GET ${name} failed: ${res.status}`);
  return res.json();
}

function linkedProductNames(m, products) {
  const names = [];
  (m.productIds || []).forEach((pid) => {
    const p = products.find((x) => x.id === pid);
    if (p && p.partName) names.push(p.partName);
  });
  if (m.mfgProductName) names.push(m.mfgProductName);
  if (m.mfgProductName2) names.push(m.mfgProductName2);
  return [...new Set(names.filter(Boolean))];
}

(async () => {
  console.log(`API: ${API}`);
  const [inventory, materials, products] = await Promise.all([
    fetchStore('injection_inventory'),
    fetchStore('injection_materials'),
    fetchStore('products')
  ]);
  console.log(`inventory=${inventory.length}, materials=${materials.length}, products=${products.length}`);

  const mismatches = [];
  const zeroStockLinked = [];

  for (const m of materials) {
    const carModel = m.carModel || '';
    const partName = m.injPartName || '';
    const injColor = m.injColor || '';
    if (!partName || !injColor) continue;

    const targetColors = new Set(
      String(injColor).split(/[,，\/·|、]/).map((c) => normColor(c)).filter(Boolean)
    );
    if (!targetColors.size) continue;

    const base = (item) => {
      if (item.partName !== partName) return false;
      if (carModel && item.carModel && item.carModel !== carModel) return false;
      return true;
    };

    const legacy = inventory.filter((item) => {
      if (!base(item)) return false;
      if (item.type === '출고') return true;
      const iColor = normColor(item.color);
      return [...targetColors].some((c) => colorsMatch(iColor, c));
    });

    const fixed = inventory.filter((item) => {
      if (!base(item)) return false;
      const raw = String(item.color || '').trim();
      if (item.type === '출고' && !raw) return true;
      const iColor = normColor(raw);
      return [...targetColors].some((c) => colorsMatch(iColor, c));
    });

    const legacyTotal = totalStock(legacy);
    const fixedTotal = totalStock(fixed);
    const delta = fixedTotal - legacyTotal;
    const linked = linkedProductNames(m, products);

    if (Math.abs(delta) >= 1) {
      mismatches.push({
        carModel,
        partName,
        injColor,
        warehouseLike: Math.max(0, Math.round(fixedTotal)),
        planLegacy: Math.max(0, Math.round(legacyTotal)),
        delta: Math.round(delta),
        linked
      });
    }

    // 제품에 연결됐지만 해당 컬러 재고가 0이고, 같은 품명의 다른 컬러 재고는 있는 경우
    if (linked.length && Math.max(0, fixedTotal) <= 0) {
      const otherColorStock = inventory
        .filter((item) => base(item) && String(item.color || '').trim())
        .reduce((s, r) => s + signedQty(r), 0);
      if (otherColorStock > 0) {
        zeroStockLinked.push({
          carModel,
          partName,
          injColor,
          linked,
          otherColorStock: Math.round(otherColorStock)
        });
      }
    }
  }

  mismatches.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log('\n=== 출고 컬러 무시로 수량 어긋나던 차종·품명 ===');
  if (!mismatches.length) {
    console.log('(없음)');
  } else {
    console.log(`총 ${mismatches.length}건`);
    for (const r of mismatches) {
      console.log(
        `${r.carModel} | ${r.partName} | ${r.injColor} | 창고식 ${r.warehouseLike} / 구계획 ${r.planLegacy} (Δ${r.delta > 0 ? '+' : ''}${r.delta})` +
          (r.linked.length ? ` | 연결제품: ${r.linked.join(', ')}` : '')
      );
    }
  }

  console.log('\n=== 제품 연결됐으나 해당 사출컬러 재고 0 (다른 색 재고는 있음) ===');
  if (!zeroStockLinked.length) {
    console.log('(없음)');
  } else {
    console.log(`총 ${zeroStockLinked.length}건`);
    for (const r of zeroStockLinked.slice(0, 80)) {
      console.log(
        `${r.carModel} | ${r.partName} | 자재색 ${r.injColor} | 타색합 ${r.otherColorStock} | 제품: ${r.linked.join(', ')}`
      );
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

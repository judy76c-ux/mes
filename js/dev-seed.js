/**
 * 개발/테스트용 데이터 시드 스크립트
 * 브라우저 콘솔에서 DevSeed.run() 실행 또는
 * 설정 > 시스템 탭의 버튼으로 실행
 */

const DevSeed = (function() {

    const TODAY = new Date().toISOString().slice(0, 10);
    const TIME  = '09:00';

    // shelfLife 문자열 → 개월 수 파싱
    // 지원: "12개월", "1년", "12", "6개월", "6" 등
    function parseShelfLifeMonths(val) {
        if (!val) return 12; // 기본 12개월
        const s = String(val).trim();
        const yearMatch  = s.match(/(\d+)\s*년/);
        const monthMatch = s.match(/(\d+)\s*개월/);
        const numOnly    = s.match(/^(\d+)$/);
        if (yearMatch)  return parseInt(yearMatch[1])  * 12;
        if (monthMatch) return parseInt(monthMatch[1]);
        if (numOnly)    return parseInt(numOnly[1]);
        return 12;
    }

    // mfgDate(YYYY-MM-DD) + months → expDate(YYYY-MM-DD)
    function addMonths(dateStr, months) {
        const d = new Date(dateStr);
        d.setMonth(d.getMonth() + months);
        return d.toISOString().slice(0, 10);
    }

    // 간이 샘플링표 (입고수량 → sampleCode/size/Ac/Re)
    function getSampling(qty) {
        if (qty <= 150)  return { sampleCode: 'F', sampleSize: 20,  ac: 1,  re: 2  };
        if (qty <= 280)  return { sampleCode: 'G', sampleSize: 32,  ac: 2,  re: 3  };
        if (qty <= 500)  return { sampleCode: 'H', sampleSize: 50,  ac: 3,  re: 4  };
        if (qty <= 1200) return { sampleCode: 'J', sampleSize: 80,  ac: 5,  re: 6  };
        if (qty <= 3200) return { sampleCode: 'K', sampleSize: 125, ac: 7,  re: 8  };
        return                  { sampleCode: 'L', sampleSize: 200, ac: 10, re: 11 };
    }

    // ──────────────────────────────────────────────
    //  사출 수입검사 시드
    // ──────────────────────────────────────────────
    async function seedInjectionInspections() {
        const materials = Storage.getAll(DB.STORES.INJECTION_MATERIALS);
        if (!materials || materials.length === 0) {
            console.warn('[DevSeed] 사출 자재 데이터가 없습니다. 설정에서 자재를 먼저 등록하세요.');
            return 0;
        }

        let count = 0;
        for (const mat of materials) {
            const qty  = 500;
            const samp = getSampling(qty);
            const lotNo = '260101';
            await Storage.add(DB.STORES.INJECTION_INSPECTIONS, {
                date:          `${TODAY} ${TIME}`,
                inspector:     '테스트',
                carModel:      mat.carModel    || '',
                partName:      mat.injPartName || mat.partName || '',
                color:         mat.injColor    || mat.color   || '',
                incomingQty:   qty,
                lots:          [{ lotNo, qty, certReceived: true }],
                lotNo,
                sampleCode:    samp.sampleCode,
                acCriteria:    samp.ac,
                reCriteria:    samp.re,
                inspectionQty: samp.sampleSize,
                passQty:       qty,
                failQty:       0,
                defectDetails: {},
                supplierName:  mat.supplier || '',
                note:          '[DEV] 테스트 데이터'
            });
            count++;
        }
        console.log(`[DevSeed] 사출 수입검사 ${count}건 추가 완료`);
        return count;
    }

    // ──────────────────────────────────────────────
    //  도료 수입검사 시드
    // ──────────────────────────────────────────────
    async function seedPaintInspections() {
        const materials = Storage.getAll(DB.STORES.PAINT_MATERIALS);
        if (!materials || materials.length === 0) {
            console.warn('[DevSeed] 도료 데이터가 없습니다. 설정에서 도료를 먼저 등록하세요.');
            return 0;
        }

        let count = 0;
        for (const mat of materials) {
            const qty = 10;

            // 제조일자: 1개월 전
            const mfgD = new Date();
            mfgD.setMonth(mfgD.getMonth() - 1);
            const mfgDate = mfgD.toISOString().slice(0, 10);

            // 유통기한: 마스터의 shelfLife 사용 (없으면 12개월)
            const shelfLifeMonths = parseShelfLifeMonths(mat.shelfLife);
            const shelfLifeLabel  = mat.shelfLife || '12개월';

            // 유효기간 = 제조일 + 유통기한 개월 수
            const expDate = addMonths(mfgDate, shelfLifeMonths);

            // 제조 LOT = YYMMDD (제조일 기준)
            const prodLot = mfgDate.replace(/-/g, '').slice(2); // YYMMDD

            await Storage.add(DB.STORES.PAINT_INCOMING_INSPECTIONS, {
                date:             `${TODAY} ${TIME}`,
                inspector:        '테스트',
                supplier:         mat.supplier || '',
                paintName:        mat.name     || '',
                packUnit:         mat.packUnit ? String(mat.packUnit) + ' KG' : '',
                incomingQty:      qty,
                mfgDate,
                expDate,
                shelfLife:        shelfLifeLabel,
                lotNo:            'DEV-LOT-001',
                containerStatus:  '양호',
                containerNote:    '',
                expDateCheck:     '이상없음',
                expDateCheckNote: '',
                certCheck:        '접수',
                certNote:         '',
                lotCheck:         '확인',
                verdict:          '합격',
                note:             '[DEV] 테스트 데이터'
            });
            count++;
        }
        console.log(`[DevSeed] 도료 수입검사 ${count}건 추가 완료`);
        return count;
    }

    // ──────────────────────────────────────────────
    //  전체 실행
    // ──────────────────────────────────────────────
    async function run() {
        console.log('[DevSeed] 테스트 데이터 삽입 시작...');
        const injCount   = await seedInjectionInspections();
        const paintCount = await seedPaintInspections();
        console.log(`[DevSeed] 완료 — 사출 ${injCount}건 / 도료 ${paintCount}건`);
        UIUtils.toast(`테스트 데이터 삽입 완료 (사출 ${injCount}건, 도료 ${paintCount}건)`, 'success');
        if (typeof Router !== 'undefined' && Router.reload) Router.reload();
    }

    return { run, seedInjectionInspections, seedPaintInspections, parseShelfLifeMonths, addMonths };
})();

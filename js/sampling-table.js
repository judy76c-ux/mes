/**
 * KS Q ISO 2859-1 계수조정형 샘플링 검사 표준표
 * 적용 수준: 보통검사 G-II, AQL 0.65 (수입검사 기준)
 */
const SamplingTable = (function() {

    // LOT 크기 구간 → 시료코드 (보통검사 G-II)
    // [최소, 최대(포함), 코드]
    const LOT_TO_CODE = [
        [1,       8,        'A'],
        [9,       15,       'B'],
        [16,      25,       'C'],
        [26,      50,       'D'],
        [51,      90,       'E'],
        [91,      150,      'F'],
        [151,     280,      'G'],
        [281,     500,      'H'],
        [501,     1200,     'J'],
        [1201,    3200,     'K'],
        [3201,    10000,    'L'],
        [10001,   35000,    'M'],
        [35001,   150000,   'N'],
        [150001,  500000,   'P'],
        [500001,  Infinity, 'Q']
    ];

    // 시료코드 → 시료수(n)
    const CODE_TO_SAMPLE_SIZE = {
        A: 2,   B: 3,   C: 5,   D: 8,   E: 13,
        F: 20,  G: 32,  H: 50,  J: 80,  K: 125,
        L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000
    };

    // AQL 0.65 기준 합격판정수(Ac) / 불합격판정수(Re)
    const CODE_TO_AQL065 = {
        A: { ac: 0, re: 1 },
        B: { ac: 0, re: 1 },
        C: { ac: 0, re: 1 },
        D: { ac: 0, re: 1 },
        E: { ac: 0, re: 1 },
        F: { ac: 0, re: 1 },
        G: { ac: 1, re: 2 },
        H: { ac: 1, re: 2 },
        J: { ac: 1, re: 2 },
        K: { ac: 2, re: 3 },
        L: { ac: 3, re: 4 },
        M: { ac: 5, re: 6 },
        N: { ac: 7, re: 8 },
        P: { ac: 10, re: 11 },
        Q: { ac: 14, re: 15 },
        R: { ac: 21, re: 22 }
    };

    /**
     * LOT 수량으로 샘플링 정보 반환
     * @param {number} lotQty - 입고(LOT) 수량
     * @returns {{ sampleCode, sampleSize, ac, re, level, aql } | null}
     */
    function getSamplingInfo(lotQty) {
        const qty = Number(lotQty);
        if (!qty || qty <= 0) return null;

        const entry = LOT_TO_CODE.find(([min, max]) => qty >= min && qty <= max);
        if (!entry) return null;

        const code = entry[2];
        const sampleSize = CODE_TO_SAMPLE_SIZE[code];
        const { ac, re } = CODE_TO_AQL065[code];

        return {
            sampleCode: code,
            sampleSize: sampleSize,
            ac: ac,
            re: re,
            level: 'G-II',
            aql: '0.65'
        };
    }

    return { getSamplingInfo };

})();

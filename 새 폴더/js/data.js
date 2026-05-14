/**
 * 데이터 관리 모듈
 * 제품, 불량 항목, 불량 기록 관리
 */

const DataManager = (function() {
    // 제품 창고
    const ProductManager = {
        // 제품 목록 조회
        getAll() {
            return Storage.loadProducts();
        },

        // 제품 추가 (차종, 품명, 컬러)
        add(carModel, partName, color) {
            const products = this.getAll();

            // 표시명 생성
            const displayName = `${carModel} ${partName} ${color}`.trim();

            // 중복 체크 (차종+품명+컬러 조합)
            if (products.some(p => this.getDisplayName(p) === displayName)) {
                throw new Error('이미 존재하는 제품입니다.');
            }

            const product = {
                id: Date.now().toString(),
                carModel: carModel.trim(),
                partName: partName.trim(),
                color: color.trim(),
                displayName: displayName,
                createdAt: new Date().toISOString()
            };

            products.push(product);
            Storage.saveProducts(products);
            return product;
        },

        // 기존 제품의 표시명 가져오기 (호환성)
        getDisplayName(product) {
            if (product.displayName) return product.displayName;
            if (product.name) return product.name;
            return `${product.carModel || ''} ${product.partName || ''} ${product.color || ''}`.trim();
        },

        // 제품 삭제
        delete(id) {
            const products = this.getAll();
            const filtered = products.filter(p => p.id !== id);
            Storage.saveProducts(filtered);
        },

        // 제품 수정
        update(id, carModel, partName, color) {
            const products = this.getAll();
            const index = products.findIndex(p => p.id === id);

            if (index === -1) {
                throw new Error('제품을 찾을 수 없습니다.');
            }

            const displayName = `${carModel} ${partName} ${color}`.trim();

            // 중복 체크 (자신 제외)
            if (products.some(p => this.getDisplayName(p) === displayName && p.id !== id)) {
                throw new Error('이미 존재하는 제품입니다.');
            }

            products[index].carModel = carModel.trim();
            products[index].partName = partName.trim();
            products[index].color = color.trim();
            products[index].displayName = displayName;

            Storage.saveProducts(products);
            return products[index];
        },

        // ID로 조회
        getById(id) {
            const products = this.getAll();
            return products.find(p => p.id === id);
        },

        // 차종 목록 조회
        getCarModels() {
            const products = this.getAll();
            return [...new Set(products.map(p => p.carModel).filter(Boolean))];
        },

        // 차종별 품명 조회
        getPartNamesByCarModel(carModel) {
            const products = this.getAll();
            return [...new Set(
                products.filter(p => p.carModel === carModel).map(p => p.partName).filter(Boolean)
            )];
        },

        // 차종+품명별 컬러 조회
        getColorsByCarModelAndPart(carModel, partName) {
            const products = this.getAll();
            return products.filter(p => p.carModel === carModel && p.partName === partName);
        },

        // 그룹화된 제품 목록 조회
        getGrouped() {
            const products = this.getAll();
            const grouped = {};

            products.forEach(product => {
                const carModel = product.carModel || '미분류';
                const partName = product.partName || '미분류';

                if (!grouped[carModel]) {
                    grouped[carModel] = {};
                }
                if (!grouped[carModel][partName]) {
                    grouped[carModel][partName] = [];
                }
                grouped[carModel][partName].push(product);
            });

            return grouped;
        }
    };

    // 불량 항목 관리
    const DefectManager = {
        // 불량 항목 목록 조회
        getAll() {
            return Storage.loadDefects();
        },

        // 불량 항목 추가
        add(name) {
            const defects = this.getAll();

            // 중복 체크
            if (defects.some(d => d.name === name)) {
                throw new Error('이미 존재하는 불량 항목입니다.');
            }

            const defect = {
                id: Date.now().toString(),
                name: name.trim(),
                createdAt: new Date().toISOString()
            };

            defects.push(defect);
            Storage.saveDefects(defects);
            return defect;
        },

        // 불량 항목 삭제
        delete(id) {
            const defects = this.getAll();
            const filtered = defects.filter(d => d.id !== id);
            Storage.saveDefects(filtered);
        },

        // 불량 항목 수정
        update(id, newName) {
            const defects = this.getAll();
            const index = defects.findIndex(d => d.id === id);

            if (index === -1) {
                throw new Error('불량 항목을 찾을 수 없습니다.');
            }

            // 중복 체크 (자신 제외)
            if (defects.some(d => d.name === newName && d.id !== id)) {
                throw new Error('이미 존재하는 불량 항목명입니다.');
            }

            defects[index].name = newName.trim();
            Storage.saveDefects(defects);
            return defects[index];
        },

        // ID로 조회
        getById(id) {
            const defects = this.getAll();
            return defects.find(d => d.id === id);
        },

        // 이름으로 조회
        getByName(name) {
            const defects = this.getAll();
            return defects.find(d => d.name === name);
        }
    };

    // 불량 기록 관리
    const RecordManager = {
        // 전체 기록 조회
        getAll() {
            return Storage.loadRecords();
        },

        // 기간별 조회
        getByDateRange(startDate, endDate) {
            return Storage.getRecordsByDateRange(startDate, endDate);
        },

        // 일일 기록 조회
        getDaily(date) {
            return Storage.getDailyRecords(date);
        },

        // 제품별 조회
        getByProduct(productId) {
            const records = this.getAll();
            return records.filter(r => r.productId === productId);
        },

        // 불량 기록 추가 (단일)
        add(productId, productName, defectId, defectName, count = 1) {
            return Storage.addRecord({
                productId,
                productName,
                defectId,
                defectName,
                count
            });
        },

        // 여러 기록 일괄 추가
        addBatch(records) {
            const results = [];
            for (const record of records) {
                if (record.count > 0) {
                    results.push(this.add(
                        record.productId,
                        record.productName,
                        record.defectId,
                        record.defectName,
                        record.count
                    ));
                }
            }
            return results;
        },

        // 기록 삭제
        delete(id) {
            const records = this.getAll();
            const filtered = records.filter(r => r.id !== id);
            Storage.saveRecords(filtered);
        },

        // 기간별 기록 삭제
        deleteByDateRange(startDate, endDate) {
            const records = this.getAll();
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const filtered = records.filter(record => {
                const recordDate = new Date(record.timestamp);
                return !(recordDate >= start && recordDate <= end);
            });

            Storage.saveRecords(filtered);
        }
    };

    // 통계 계산
    const Statistics = {
        // 기간별 요약
        getSummary(startDate, endDate) {
            const records = RecordManager.getByDateRange(startDate, endDate);

            const summary = {
                totalRecords: records.length,
                totalDefects: records.reduce((sum, r) => sum + r.count, 0),
                byProduct: {},
                byDefect: {},
                dailyTrend: {}
            };

            records.forEach(record => {
                // 제품별 집계
                if (!summary.byProduct[record.productName]) {
                    summary.byProduct[record.productName] = 0;
                }
                summary.byProduct[record.productName] += record.count;

                // 불량 항목별 집계
                if (!summary.byDefect[record.defectName]) {
                    summary.byDefect[record.defectName] = 0;
                }
                summary.byDefect[record.defectName] += record.count;

                // 일별 추이
                const date = new Date(record.timestamp).toLocaleDateString('ko-KR');
                if (!summary.dailyTrend[date]) {
                    summary.dailyTrend[date] = 0;
                }
                summary.dailyTrend[date] += record.count;
            });

            return summary;
        },

        // 불량률 계산 (검사 수 대비)
        getDefectRate(totalInspected, totalDefects) {
            if (totalInspected === 0) return 0;
            return ((totalDefects / totalInspected) * 100).toFixed(2);
        },

        // Pareto 데이터 생성
        getParetoData(startDate, endDate) {
            const summary = this.getSummary(startDate, endDate);
            const defectData = Object.entries(summary.byDefect)
                .map(([name, count]) => ({
                    name,
                    count
                }))
                .sort((a, b) => b.count - a.count);

            const total = defectData.reduce((sum, d) => sum + d.count, 0);
            let cumulative = 0;

            return defectData.map(d => {
                cumulative += d.count;
                return {
                    name: d.name,
                    count: d.count,
                    cumulative: (cumulative / total) * 100
                };
            });
        },

        // 제품별 불량 분포
        getProductDistribution(startDate, endDate) {
            const summary = this.getSummary(startDate, endDate);
            return Object.entries(summary.byProduct)
                .map(([name, count]) => ({
                    name,
                    count
                }))
                .sort((a, b) => b.count - a.count);
        },

        // 일별 추이 데이터
        getDailyTrend(startDate, endDate) {
            const summary = this.getSummary(startDate, endDate);
            const sortedDates = Object.keys(summary.dailyTrend).sort((a, b) => {
                return new Date(a) - new Date(b);
            });

            return sortedDates.map(date => ({
                date,
                count: summary.dailyTrend[date]
            }));
        }
    };

    // 리포트 생성
    const ReportGenerator = {
        // 일일 리포트
        generateDaily(date) {
            const dateObj = new Date(date);
            const records = RecordManager.getDaily(date);
            return this.formatReport(records, '일일', dateObj);
        },

        // 주간 리포트
        generateWeekly(startDate) {
            const start = new Date(startDate);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23, 59, 59, 999);

            const records = RecordManager.getByDateRange(start, end);
            return this.formatReport(records, '주간', start, end);
        },

        // 월간 리포트
        generateMonthly(year, month) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            end.setHours(23, 59, 59, 999);

            const records = RecordManager.getByDateRange(start, end);
            return this.formatReport(records, '월간', start, end);
        },

        // 기간별 리포트
        generateCustom(startDate, endDate) {
            const records = RecordManager.getByDateRange(startDate, endDate);
            return this.formatReport(records, '기간별', new Date(startDate), new Date(endDate));
        },

        // 리포트 포맷팅
        formatReport(records, type, startDate, endDate) {
            const formattedRecords = records.map(r => ({
                date: new Date(r.timestamp).toLocaleDateString('ko-KR'),
                time: new Date(r.timestamp).toLocaleTimeString('ko-KR'),
                productName: r.productName,
                defectName: r.defectName,
                count: r.count
            }));

            // startDate, endDate가 문자열이면 Date로 변환
            const startDateObj = startDate instanceof Date ? startDate : new Date(startDate);
            const endDateObj = endDate ? (endDate instanceof Date ? endDate : new Date(endDate)) : null;

            const summary = Statistics.getSummary(startDateObj, endDateObj || startDateObj);

            return {
                type,
                startDate: startDateObj.toLocaleDateString('ko-KR'),
                endDate: endDateObj ? endDateObj.toLocaleDateString('ko-KR') : null,
                records: formattedRecords,
                summary,
                generatedAt: new Date().toLocaleString('ko-KR')
            };
        }
    };

    // 공개 API
    return {
        ProductManager,
        DefectManager,
        RecordManager,
        Statistics,
        ReportGenerator,
        exportToCSV: Storage.exportToCSV,
        exportAllData: Storage.exportAllData,
        importAllData: Storage.importAllData
    };
})();
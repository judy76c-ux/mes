/**
 * Legacy DataManager compatibility layer.
 *
 * The current MES app uses DB.STORES + Storage directly. Some older UI/chart
 * helpers still reference DataManager, so this file keeps those calls safe
 * without depending on removed legacy Storage APIs.
 */
const DataManager = (function() {
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;
    const DEFECTS_STORE = DB.STORES.DEFECT_TYPES;
    const LEGACY_RECORDS_KEY = 'mes_legacy_defect_records';

    function getLegacyRecords() {
        try {
            return JSON.parse(localStorage.getItem(LEGACY_RECORDS_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveLegacyRecords(records) {
        localStorage.setItem(LEGACY_RECORDS_KEY, JSON.stringify(records || []));
    }

    function getDisplayName(product) {
        if (!product) return '';
        if (product.displayName) return product.displayName;
        if (product.name) return product.name;
        return `${product.carModel || ''} ${product.partName || ''} ${product.color || ''}`.trim();
    }

    const ProductManager = {
        getAll() {
            return Storage.getAll(PRODUCTS_STORE);
        },

        async add(carModel, partName, color) {
            const displayName = `${carModel} ${partName} ${color}`.trim();
            if (this.getAll().some(p => getDisplayName(p) === displayName)) {
                throw new Error('이미 존재하는 제품입니다.');
            }

            return Storage.add(PRODUCTS_STORE, {
                carModel: carModel.trim(),
                partName: partName.trim(),
                color: color.trim(),
                displayName
            });
        },

        getDisplayName,

        async delete(id) {
            return Storage.remove(PRODUCTS_STORE, id);
        },

        async update(id, carModel, partName, color) {
            const displayName = `${carModel} ${partName} ${color}`.trim();
            if (this.getAll().some(p => getDisplayName(p) === displayName && p.id !== id)) {
                throw new Error('이미 존재하는 제품입니다.');
            }

            return Storage.update(PRODUCTS_STORE, id, {
                carModel: carModel.trim(),
                partName: partName.trim(),
                color: color.trim(),
                displayName
            });
        },

        getById(id) {
            return this.getAll().find(p => p.id === id);
        },

        getCarModels() {
            return [...new Set(this.getAll().map(p => p.carModel).filter(Boolean))];
        },

        getPartNamesByCarModel(carModel) {
            return [...new Set(
                this.getAll().filter(p => p.carModel === carModel).map(p => p.partName).filter(Boolean)
            )];
        },

        getColorsByCarModelAndPart(carModel, partName) {
            return this.getAll().filter(p => p.carModel === carModel && p.partName === partName);
        },

        getGrouped() {
            return this.getAll().reduce((grouped, product) => {
                const carModel = product.carModel || '미분류';
                const partName = product.partName || '미분류';
                if (!grouped[carModel]) grouped[carModel] = {};
                if (!grouped[carModel][partName]) grouped[carModel][partName] = [];
                grouped[carModel][partName].push(product);
                return grouped;
            }, {});
        }
    };

    const DefectManager = {
        getAll() {
            return Storage.getAll(DEFECTS_STORE);
        },

        async add(name) {
            if (this.getAll().some(d => d.name === name)) {
                throw new Error('이미 존재하는 불량 유형입니다.');
            }
            return Storage.add(DEFECTS_STORE, { name: name.trim() });
        },

        async delete(id) {
            return Storage.remove(DEFECTS_STORE, id);
        },

        async update(id, newName) {
            if (this.getAll().some(d => d.name === newName && d.id !== id)) {
                throw new Error('이미 존재하는 불량 유형명입니다.');
            }
            return Storage.update(DEFECTS_STORE, id, { name: newName.trim() });
        },

        getById(id) {
            return this.getAll().find(d => d.id === id);
        },

        getByName(name) {
            return this.getAll().find(d => d.name === name);
        }
    };

    const RecordManager = {
        getAll() {
            return getLegacyRecords();
        },

        getByDateRange(startDate, endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return this.getAll().filter(record => {
                const d = new Date(record.timestamp || record.date);
                return d >= start && d <= end;
            });
        },

        getDaily(date) {
            return this.getByDateRange(date, date);
        },

        getByProduct(productId) {
            return this.getAll().filter(r => r.productId === productId);
        },

        add(productId, productName, defectId, defectName, count = 1) {
            const record = {
                id: Storage.generateId(),
                productId,
                productName,
                defectId,
                defectName,
                count: Number(count) || 0,
                timestamp: new Date().toISOString()
            };
            const records = this.getAll();
            records.push(record);
            saveLegacyRecords(records);
            return record;
        },

        addBatch(records) {
            return records
                .filter(record => Number(record.count) > 0)
                .map(record => this.add(
                    record.productId,
                    record.productName,
                    record.defectId,
                    record.defectName,
                    record.count
                ));
        },

        delete(id) {
            saveLegacyRecords(this.getAll().filter(r => r.id !== id));
        },

        deleteByDateRange(startDate, endDate) {
            const ids = new Set(this.getByDateRange(startDate, endDate).map(r => r.id));
            saveLegacyRecords(this.getAll().filter(r => !ids.has(r.id)));
        }
    };

    const Statistics = {
        getSummary(startDate, endDate) {
            const records = RecordManager.getByDateRange(startDate, endDate);
            const summary = {
                totalRecords: records.length,
                totalDefects: records.reduce((sum, r) => sum + (Number(r.count) || 0), 0),
                byProduct: {},
                byDefect: {},
                dailyTrend: {}
            };

            records.forEach(record => {
                const productName = record.productName || '-';
                const defectName = record.defectName || '-';
                const date = new Date(record.timestamp || record.date).toLocaleDateString('ko-KR');
                summary.byProduct[productName] = (summary.byProduct[productName] || 0) + (Number(record.count) || 0);
                summary.byDefect[defectName] = (summary.byDefect[defectName] || 0) + (Number(record.count) || 0);
                summary.dailyTrend[date] = (summary.dailyTrend[date] || 0) + (Number(record.count) || 0);
            });

            return summary;
        },

        getDefectRate(totalInspected, totalDefects) {
            if (!totalInspected) return 0;
            return ((totalDefects / totalInspected) * 100).toFixed(2);
        },

        getParetoData(startDate, endDate) {
            const summary = this.getSummary(startDate, endDate);
            const rows = Object.entries(summary.byDefect)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
            const total = rows.reduce((sum, row) => sum + row.count, 0);
            let cumulative = 0;
            return rows.map(row => {
                cumulative += row.count;
                return { ...row, cumulative: total ? (cumulative / total) * 100 : 0 };
            });
        },

        getProductDistribution(startDate, endDate) {
            return Object.entries(this.getSummary(startDate, endDate).byProduct)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
        },

        getDailyTrend(startDate, endDate) {
            return Object.entries(this.getSummary(startDate, endDate).dailyTrend)
                .sort(([a], [b]) => new Date(a) - new Date(b))
                .map(([date, count]) => ({ date, count }));
        }
    };

    const ReportGenerator = {
        generateDaily(date) {
            return this.formatReport(RecordManager.getDaily(date), '일일', date);
        },

        generateWeekly(startDate) {
            const end = new Date(startDate);
            end.setDate(end.getDate() + 6);
            return this.formatReport(RecordManager.getByDateRange(startDate, end), '주간', startDate, end);
        },

        generateMonthly(year, month) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            return this.formatReport(RecordManager.getByDateRange(start, end), '월간', start, end);
        },

        generateCustom(startDate, endDate) {
            return this.formatReport(RecordManager.getByDateRange(startDate, endDate), '기간별', startDate, endDate);
        },

        formatReport(records, type, startDate, endDate) {
            const start = startDate instanceof Date ? startDate : new Date(startDate);
            const end = endDate ? (endDate instanceof Date ? endDate : new Date(endDate)) : start;
            return {
                type,
                startDate: start.toLocaleDateString('ko-KR'),
                endDate: endDate ? end.toLocaleDateString('ko-KR') : null,
                records: records.map(r => ({
                    date: new Date(r.timestamp || r.date).toLocaleDateString('ko-KR'),
                    time: new Date(r.timestamp || r.date).toLocaleTimeString('ko-KR'),
                    productName: r.productName,
                    defectName: r.defectName,
                    count: r.count
                })),
                summary: Statistics.getSummary(start, end),
                generatedAt: new Date().toLocaleString('ko-KR')
            };
        }
    };

    function exportToCSV(records, filename = 'legacy_defect_records') {
        const headers = ['일자', '시간', '제품', '불량유형', '수량'];
        const rows = (records || RecordManager.getAll()).map(r => [
            new Date(r.timestamp || r.date).toLocaleDateString('ko-KR'),
            new Date(r.timestamp || r.date).toLocaleTimeString('ko-KR'),
            r.productName || '',
            r.defectName || '',
            r.count || 0
        ]);
        Storage.exportToCSV(headers, rows, filename);
    }

    return {
        ProductManager,
        DefectManager,
        RecordManager,
        Statistics,
        ReportGenerator,
        exportToCSV,
        exportAllData: () => Storage.exportJSON({ legacyRecords: RecordManager.getAll() }, 'legacy_data'),
        importAllData: () => ({ success: false, error: 'Legacy import is no longer supported.' })
    };
})();

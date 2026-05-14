/**
 * 차트 모듈
 * Chart.js를 활용한 데이터 시각화
 */

const ChartManager = (function() {
    // 차트 인스턴스 저장
    let charts = {
        pareto: null,
        trend: null,
        product: null
    };

    // 기본 색상 팔레트
    const colors = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
        '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
        '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
    ];

    // Pareto Chart 생성
    function createParetoChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // 기존 차트 제거
        if (charts.pareto) {
            charts.pareto.destroy();
        }

        const labels = data.map(d => d.name);
        const counts = data.map(d => d.count);
        const cumulative = data.map(d => d.cumulative);

        charts.pareto = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '불량 수량',
                        data: counts,
                        backgroundColor: colors.slice(0, data.length),
                        yAxisID: 'y'
                    },
                    {
                        label: '누적 비율 (%)',
                        data: cumulative,
                        type: 'line',
                        borderColor: '#1e40af',
                        backgroundColor: 'transparent',
                        yAxisID: 'y1',
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: '불량 수량'
                        },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: '누적 비율 (%)'
                        },
                        min: 0,
                        max: 100,
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });

        return charts.pareto;
    }

    // 일별 추이 차트
    function createTrendChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // 기존 차트 제거
        if (charts.trend) {
            charts.trend.destroy();
        }

        const labels = data.map(d => d.date);
        const counts = data.map(d => d.count);

        charts.trend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '불량 수량',
                    data: counts,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: '불량 수량'
                        },
                        beginAtZero: true
                    },
                    x: {
                        title: {
                            display: true,
                            text: '날짜'
                        }
                    }
                }
            }
        });

        return charts.trend;
    }

    // 제품별 분포 차트 (도넛)
    function createProductChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // 기존 차트 제거
        if (charts.product) {
            charts.product.destroy();
        }

        const labels = data.map(d => d.name);
        const counts = data.map(d => d.count);

        charts.product = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: counts,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 15
                        }
                    }
                }
            }
        });

        return charts.product;
    }

    // 모든 차트 업데이트
    function updateAllCharts(startDate, endDate) {
        const paretoData = DataManager.Statistics.getParetoData(startDate, endDate);
        const trendData = DataManager.Statistics.getDailyTrend(startDate, endDate);
        const productData = DataManager.Statistics.getProductDistribution(startDate, endDate);

        if (paretoData.length > 0) {
            createParetoChart('paretoChart', paretoData);
        }

        if (trendData.length > 0) {
            createTrendChart('trendChart', trendData);
        }

        if (productData.length > 0) {
            createProductChart('productChart', productData);
        }
    }

    // 차트 초기화
    function clearCharts() {
        Object.values(charts).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        charts = { pareto: null, trend: null, product: null };
    }

    // 공개 API
    return {
        createParetoChart,
        createTrendChart,
        createProductChart,
        updateAllCharts,
        clearCharts
    };
})();

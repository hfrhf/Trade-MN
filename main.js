        // --- DATABASE SETUP ---
        const DB_NAME = 'SmallBusinessDB_v2_2'; // Changed DB name for new feature
        const DB_VERSION = 1;
        const PRODUCTS_STORE = 'products';
        const SALES_STORE = 'sales';
        let db;
        let profitChart;

        function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = (event) => reject("Database error: " + event.target.errorCode);
                request.onsuccess = (event) => {
                    db = event.target.result;
                    resolve(db);
                };
                request.onupgradeneeded = (event) => {
                    let db = event.target.result;
                    if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
                        db.createObjectStore(PRODUCTS_STORE, { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains(SALES_STORE)) {
                        db.createObjectStore(SALES_STORE, { keyPath: 'id', autoIncrement: true });
                    }
                };
            });
        }

        // --- UTILITY FUNCTIONS ---
        function showToast(message, type = 'success') {
            const toastEl = document.getElementById('app-toast');
            const toastBody = toastEl.querySelector('.toast-body');
            
            toastBody.textContent = message;
            toastEl.classList.remove('bg-primary', 'bg-danger', 'bg-warning');
            
            if (type === 'success') toastEl.classList.add('bg-primary');
            if (type === 'error') toastEl.classList.add('bg-danger');
            
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        }

        function formatCurrency(amount) {
            return new Intl.NumberFormat('ar-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2 }).format(amount);
        }

        // --- PRODUCT FUNCTIONS ---
        const productForm = document.getElementById('product-form');
        const addProductModal = new bootstrap.Modal(document.getElementById('addProductModal'));
        
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('product-image');
            const file = fileInput.files[0];
            const existingImageUrl = document.getElementById('existing-image-url').value;
            let imageDataURL = existingImageUrl || null;

            if (file) {
                try {
                    imageDataURL = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.onerror = err => reject(err);
                        reader.readAsDataURL(file);
                    });
                } catch (error) {
                    showToast('فشل في قراءة الصورة.', 'error');
                    return;
                }
            }

            const id = document.getElementById('product-id').value;
            const product = {
                name: document.getElementById('product-name').value,
                quantity: parseInt(document.getElementById('product-quantity').value),
                purchasePrice: parseFloat(document.getElementById('product-purchase-price').value),
                sellingPrice: parseFloat(document.getElementById('product-selling-price').value),
                notes: document.getElementById('product-notes').value,
                imageDataURL: imageDataURL,
            };

            const transaction = db.transaction([PRODUCTS_STORE], 'readwrite');
            const store = transaction.objectStore(PRODUCTS_STORE);
            if (id) {
                product.id = parseInt(id);
                store.put(product);
            } else {
                product.dateAdded = new Date().toISOString();
                store.add(product);
            }

            transaction.oncomplete = () => {
                showToast(id ? 'تم تعديل المنتج بنجاح.' : 'تمت إضافة المنتج بنجاح.');
                productForm.reset();
                addProductModal.hide();
                refreshAllData();
            };
            transaction.onerror = () => showToast('حدث خطأ أثناء حفظ المنتج.', 'error');
        });

        function openEditModal(product) {
            document.getElementById('addProductModalLabel').textContent = 'تعديل منتج';
            document.getElementById('product-id').value = product.id;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-quantity').value = product.quantity;
            document.getElementById('product-purchase-price').value = product.purchasePrice;
            document.getElementById('product-selling-price').value = product.sellingPrice;
            document.getElementById('product-notes').value = product.notes;
            
            const imagePreview = document.getElementById('image-preview');
            const existingImageUrlInput = document.getElementById('existing-image-url');
            if (product.imageDataURL) {
                imagePreview.src = product.imageDataURL;
                imagePreview.style.display = 'block';
                existingImageUrlInput.value = product.imageDataURL;
            } else {
                imagePreview.style.display = 'none';
                imagePreview.src = '#';
                existingImageUrlInput.value = '';
            }
            document.getElementById('product-image').value = ''; // Clear file input
            
            addProductModal.show();
        }

        document.getElementById('addProductModal').addEventListener('hidden.bs.modal', () => {
             document.getElementById('addProductModalLabel').textContent = 'إضافة منتج جديد';
             productForm.reset();
             document.getElementById('image-preview').style.display = 'none';
             document.getElementById('image-preview').src = '#';
             document.getElementById('existing-image-url').value = '';
        });

        function deleteProduct(id) {
            if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج؟ سيتم حذف سجل مبيعاته أيضًا.')) return;
            const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readwrite');
            transaction.objectStore(PRODUCTS_STORE).delete(id);
            const salesStore = transaction.objectStore(SALES_STORE);
            const salesRequest = salesStore.openCursor();
            salesRequest.onsuccess = e => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.productId === id) cursor.delete();
                    cursor.continue();
                }
            };
            transaction.oncomplete = () => {
                showToast('تم حذف المنتج بنجاح.');
                refreshAllData();
            };
        }

        // --- SALES FUNCTIONS ---
        const sellProductModal = new bootstrap.Modal(document.getElementById('sellProductModal'));
        const sellForm = document.getElementById('sell-form');
        let currentSellProduct = null;

        function openSellModal(product) {
            currentSellProduct = product;
            document.getElementById('sell-product-id').value = product.id;
            document.getElementById('sell-product-name').textContent = product.name;
            document.getElementById('sell-product-available-quantity').textContent = product.quantity;
            document.getElementById('sell-quantity').value = 1;
            document.getElementById('sell-quantity').max = product.quantity;
            document.getElementById('sell-actual-price').value = product.sellingPrice;
            sellProductModal.show();
        }

        sellForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const quantitySold = parseInt(document.getElementById('sell-quantity').value);
            const actualSalePrice = parseFloat(document.getElementById('sell-actual-price').value);
            
            if (quantitySold > currentSellProduct.quantity) {
                showToast('الكمية المباعة أكبر من الكمية المتاحة في المخزون.', 'error');
                return;
            }

            const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readwrite');
            const productsStore = transaction.objectStore(PRODUCTS_STORE);
            const salesStore = transaction.objectStore(SALES_STORE);

            currentSellProduct.quantity -= quantitySold;
            productsStore.put(currentSellProduct);

            const sale = {
                productId: currentSellProduct.id, productName: currentSellProduct.name, quantitySold: quantitySold,
                salePrice: actualSalePrice, purchasePrice: currentSellProduct.purchasePrice,
                saleDate: new Date().toISOString()
            };
            salesStore.add(sale);

            transaction.oncomplete = () => {
                showToast('تم تسجيل عملية البيع بنجاح.');
                sellProductModal.hide();
                sellForm.reset();
                refreshAllData();
            };
            transaction.onerror = () => showToast('فشل تسجيل عملية البيع.', 'error');
        });

        // --- DISPLAY & REFRESH FUNCTIONS ---
        async function refreshAllData() {
            const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readonly');
            const productsStore = transaction.objectStore(PRODUCTS_STORE);
            const salesStore = transaction.objectStore(SALES_STORE);

            const allProducts = await new Promise(r => productsStore.getAll().onsuccess = e => r(e.target.result));
            const allSales = await new Promise(r => salesStore.getAll().onsuccess = e => r(e.target.result));

            displayInventory(allProducts);
            displaySalesLog(allSales);
            updateDashboard(allProducts, allSales);
            refreshFinancialReports(allProducts, allSales);
        }

        function displayInventory(products) {
            const tbody = document.getElementById('inventory-table-body');
            tbody.innerHTML = '';
            if (products.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4">لم تتم إضافة أي منتجات بعد.</td></tr>';
                return;
            }
            products.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
                let statusBadge = '';
                let rowClass = '';
                if (p.quantity === 0) {
                    statusBadge = '<span class="status-badge status-out">نفد المخزون</span>';
                    rowClass = 'out-of-stock-row';
                } else if (p.quantity > 0 && p.quantity < 5) {
                    statusBadge = `<span class="status-badge status-low">${p.quantity} قطع متبقية</span>`;
                } else {
                    statusBadge = `${p.quantity} قطعة`;
                }

                const imageSrc = p.imageDataURL || `https://placehold.co/60x60/ecf0f1/7f8c8d?text=لا+صورة`;

                const row = `
                    <tr class="${rowClass}" id="product-row-${p.id}">
                        <td><img src="${imageSrc}" alt="${p.name}" class="product-image" onerror="this.onerror=null;this.src='https://placehold.co/60x60/ecf0f1/7f8c8d?text=خطأ';"></td>
                        <td><strong class="text-secondary product-name">${p.name}</strong></td>
                        <td>${statusBadge}</td>
                        <td>${formatCurrency(p.purchasePrice)}</td>
                        <td>${formatCurrency(p.sellingPrice)}</td>
                        <td>
                            <button class="btn btn-success btn-sm btn-action" title="بيع" data-product-id="${p.id}" ${p.quantity === 0 ? 'disabled' : ''}><i class="bi bi-cart-plus"></i></button>
                            <button class="btn btn-primary btn-sm btn-action" title="تعديل" data-product-id="${p.id}"><i class="bi bi-pencil-square"></i></button>
                            <button class="btn btn-danger btn-sm btn-action" title="حذف" data-product-id="${p.id}"><i class="bi bi-trash"></i></button>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
            
            tbody.querySelectorAll('.btn-success').forEach(btn => btn.addEventListener('click', (e) => openSellModal(products.find(p => p.id == e.currentTarget.dataset.productId))));
            tbody.querySelectorAll('.btn-primary').forEach(btn => btn.addEventListener('click', (e) => openEditModal(products.find(p => p.id == e.currentTarget.dataset.productId))));
            tbody.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', (e) => deleteProduct(parseInt(e.currentTarget.dataset.productId))));
        }

        function displaySalesLog(sales) {
            const tbody = document.getElementById('sales-log-body');
            tbody.innerHTML = '';
            if (sales.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">لا يوجد سجل مبيعات.</td></tr>';
                return;
            }
            sales.sort((a,b) => new Date(b.saleDate) - new Date(a.saleDate)).forEach(s => {
                const totalSalePrice = s.salePrice * s.quantitySold;
                const profit = (s.salePrice - s.purchasePrice) * s.quantitySold;
                const row = `
                    <tr>
                        <td><strong class="text-secondary">${s.productName}</strong></td>
                        <td>${s.quantitySold}</td>
                        <td>${formatCurrency(totalSalePrice)}</td>
                        <td class="text-success fw-bold">${formatCurrency(profit)}</td>
                        <td>${new Date(s.saleDate).toLocaleString('ar-EG', {dateStyle: 'medium', timeStyle: 'short'})}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        function updateDashboard(products, sales) {
            const totalProfit = sales.reduce((sum, s) => sum + (s.salePrice - s.purchasePrice) * s.quantitySold, 0);
            document.getElementById('total-profit').textContent = formatCurrency(totalProfit);

            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            const monthlyProfit = sales
                .filter(s => {
                    const saleDate = new Date(s.saleDate);
                    return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
                })
                .reduce((sum, s) => sum + (s.salePrice - s.purchasePrice) * s.quantitySold, 0);
            document.getElementById('monthly-profit').textContent = formatCurrency(monthlyProfit);
            
            document.getElementById('products-count').textContent = products.length;
            document.getElementById('low-stock-count').textContent = products.filter(p => p.quantity > 0 && p.quantity < 5).length;
            
            updateProfitChart(sales);
        }

        function updateProfitChart(sales) {
            const monthlyData = {};
            const monthLabels = [];
            
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
                const monthName = d.toLocaleString('ar-EG', { month: 'long', year: 'numeric' });
                monthlyData[monthKey] = 0;
                monthLabels.push(monthName);
            }

            sales.forEach(sale => {
                const saleDate = new Date(sale.saleDate);
                const monthKey = `${saleDate.getFullYear()}-${saleDate.getMonth()}`;
                if (monthKey in monthlyData) {
                    const profit = (sale.salePrice - sale.purchasePrice) * sale.quantitySold;
                    monthlyData[monthKey] += profit;
                }
            });

            const chartData = Object.values(monthlyData);
            
            const ctx = document.getElementById('profitChart').getContext('2d');
            if (profitChart) profitChart.destroy();
            
            profitChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: monthLabels,
                    datasets: [{
                        label: 'الربح الشهري',
                        data: chartData,
                        backgroundColor: 'rgba(26, 188, 156, 0.6)',
                        borderColor: 'rgba(26, 188, 156, 1)',
                        borderWidth: 1,
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { callback: value => formatCurrency(value) } } },
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `الربح: ${formatCurrency(context.raw)}` } } }
                }
            });
        }

        // --- FINANCIAL REPORTS ---
        function refreshFinancialReports(allProducts, allSales) {
            const yearSelect = document.getElementById('report-year-select');
            const monthSelect = document.getElementById('report-month-select');

            // Populate selectors if they are empty
            if (yearSelect.options.length === 0) {
                const years = [...new Set(allSales.map(s => new Date(s.saleDate).getFullYear()))];
                if(years.length === 0) years.push(new Date().getFullYear());
                years.sort((a,b) => b-a).forEach(year => {
                    const option = new Option(year, year);
                    yearSelect.add(option);
                });
                
                const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
                months.forEach((month, index) => {
                    const option = new Option(month, index);
                    monthSelect.add(option);
                });
                
                // Set to current month and year
                yearSelect.value = new Date().getFullYear();
                monthSelect.value = new Date().getMonth();
            }
            
            const selectedYear = parseInt(yearSelect.value);
            const selectedMonth = parseInt(monthSelect.value);

            const salesInMonth = allSales.filter(s => {
                const saleDate = new Date(s.saleDate);
                return saleDate.getFullYear() === selectedYear && saleDate.getMonth() === selectedMonth;
            });

            // Calculate summary
            const totalRevenue = salesInMonth.reduce((sum, s) => sum + (s.salePrice * s.quantitySold), 0);
            const totalCOGS = salesInMonth.reduce((sum, s) => sum + (s.purchasePrice * s.quantitySold), 0);
            const netProfit = totalRevenue - totalCOGS;
            const assetValue = allProducts.reduce((sum, p) => sum + (p.quantity * p.purchasePrice), 0);

            document.getElementById('report-total-revenue').textContent = formatCurrency(totalRevenue);
            document.getElementById('report-total-cogs').textContent = formatCurrency(totalCOGS);
            document.getElementById('report-net-profit').textContent = formatCurrency(netProfit);
            document.getElementById('report-asset-value').textContent = formatCurrency(assetValue);
            
            const netProfitEl = document.getElementById('report-net-profit');
            netProfitEl.classList.remove('text-success', 'text-danger', 'text-primary');
            if (netProfit > 0) netProfitEl.classList.add('text-success');
            else if (netProfit < 0) netProfitEl.classList.add('text-danger');
            else netProfitEl.classList.add('text-primary');


            // Group sales by product for details table
            const productDetails = {};
            salesInMonth.forEach(s => {
                if (!productDetails[s.productId]) {
                    productDetails[s.productId] = {
                        name: s.productName,
                        quantity: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0
                    };
                }
                productDetails[s.productId].quantity += s.quantitySold;
                productDetails[s.productId].revenue += s.salePrice * s.quantitySold;
                productDetails[s.productId].cost += s.purchasePrice * s.quantitySold;
                productDetails[s.productId].profit += (s.salePrice - s.purchasePrice) * s.quantitySold;
            });
            
            const detailsBody = document.getElementById('financial-details-body');
            detailsBody.innerHTML = '';
            if (Object.keys(productDetails).length === 0) {
                detailsBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">لا توجد مبيعات في هذا الشهر.</td></tr>';
            } else {
                for(const id in productDetails) {
                    const p = productDetails[id];
                    const profitClass = p.profit > 0 ? 'text-success' : (p.profit < 0 ? 'text-danger' : '');
                    const row = `
                        <tr>
                            <td><strong class="text-secondary">${p.name}</strong></td>
                            <td>${p.quantity}</td>
                            <td>${formatCurrency(p.revenue)}</td>
                            <td>${formatCurrency(p.cost)}</td>
                            <td class="fw-bold ${profitClass}">${formatCurrency(p.profit)}</td>
                        </tr>
                    `;
                    detailsBody.innerHTML += row;
                }
            }
        }

        // --- DATA MANAGEMENT ---
        async function exportData(format) {
            const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readonly');
            const products = await new Promise(r => transaction.objectStore(PRODUCTS_STORE).getAll().onsuccess = e => r(e.target.result));
            const sales = await new Promise(r => transaction.objectStore(SALES_STORE).getAll().onsuccess = e => r(e.target.result));
            const data = { products, sales };

            if (format === 'json') {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `business_backup_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } else if (format === 'excel') {
                const wb = XLSX.utils.book_new();
                const wsProducts = XLSX.utils.json_to_sheet(products.map(p => {
                    const {imageDataURL, ...rest} = p; // Exclude image data from Excel
                    return rest;
                }));
                const wsSales = XLSX.utils.json_to_sheet(sales);
                XLSX.utils.book_append_sheet(wb, wsProducts, "المنتجات");
                XLSX.utils.book_append_sheet(wb, wsSales, "المبيعات");
                XLSX.writeFile(wb, `business_backup_${new Date().toISOString().slice(0,10)}.xlsx`);
            }
            showToast(`تم تصدير البيانات بنجاح كملف ${format.toUpperCase()}.`);
        }

        function importData(event) {
            const file = event.target.files[0];
            if (!file) return;

            if (!confirm('هل أنت متأكد؟ سيؤدي الاستيراد إلى حذف جميع البيانات الحالية واستبدالها بالبيانات من الملف.')) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.products || !data.sales) throw new Error("Invalid file format");
                    
                    const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readwrite');
                    transaction.objectStore(PRODUCTS_STORE).clear();
                    transaction.objectStore(SALES_STORE).clear();
                    data.products.forEach(p => transaction.objectStore(PRODUCTS_STORE).add(p));
                    data.sales.forEach(s => transaction.objectStore(SALES_STORE).add(s));

                    transaction.oncomplete = () => {
                        showToast('تم استيراد البيانات بنجاح.');
                        refreshAllData();
                    };
                    transaction.onerror = () => showToast('فشل استيراد البيانات.', 'error');
                } catch (err) {
                    showToast('الملف غير صالح أو تالف.', 'error');
                }
            };
            reader.readAsText(file);
        }

        function deleteAllData() {
            if (!confirm('تحذير! هل أنت متأكد من رغبتك في حذف جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
            const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readwrite');
            transaction.objectStore(PRODUCTS_STORE).clear();
            transaction.objectStore(SALES_STORE).clear();
            transaction.oncomplete = () => {
                showToast('تم حذف جميع البيانات.');
                refreshAllData();
            };
        }

        // --- INITIALIZATION ---
        window.onload = async () => {
            try {
                await openDB();
                await refreshAllData();
                
                // Attach event listeners
                document.getElementById('export-json-btn').addEventListener('click', () => exportData('json'));
                document.getElementById('export-excel-btn').addEventListener('click', () => exportData('excel'));
                document.getElementById('import-file-input').addEventListener('change', importData);
                document.getElementById('delete-all-data-btn').addEventListener('click', deleteAllData);
                
                // Listeners for financial report selectors
                const reportSelectors = ['report-month-select', 'report-year-select'];
                reportSelectors.forEach(id => {
                    document.getElementById(id).addEventListener('change', () => {
                        // We don't need to re-fetch from DB, just re-calculate and display
                        const transaction = db.transaction([PRODUCTS_STORE, SALES_STORE], 'readonly');
                        Promise.all([
                            new Promise(r => transaction.objectStore(PRODUCTS_STORE).getAll().onsuccess = e => r(e.target.result)),
                            new Promise(r => transaction.objectStore(SALES_STORE).getAll().onsuccess = e => r(e.target.result))
                        ]).then(([products, sales]) => {
                            refreshFinancialReports(products, sales);
                        });
                    });
                });

            } catch (error) {
                console.error(error);
                alert('فشل فتح قاعدة البيانات. قد لا يعمل التطبيق بشكل صحيح.');
            }
        };
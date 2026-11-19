
// ==========================================
// PROFIT VS EXPENSE REPORT — SUPABASE
// ==========================================

// Only these categories count as effective Money Out.
const PE_EFFECTIVE_EXPENSES = [
    "business_expense",
    "house_expense",
    "loss"
];

// Only these categories are compared against sales profit.
const PE_PROFIT_EXPENSES = [
    "house_expense",
    "loss"
];

function peEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function peMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function peGetInvoiceAmount(sale) {
    return Number(
        sale.final_amount ??
        sale.finalAmount ??
        sale.totalAmount ??
        sale.amount ??
        0
    ) || 0;
}

function peToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function peFirstDayOfMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}-01`;
}

function peFormatDate(value) {
    if (!value) return "—";

    const date = new Date(value + "T00:00:00");

    if (Number.isNaN(date.getTime())) return peEscape(value);

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function peExpenseLabel(purpose) {
    const labels = {
        business_expense: "Business expense",
        house_expense: "House / Personal expense",
        loss: "Loss",
        other: "Other",
        sales: "Sales payment",
        advance_jama: "Advance Jama",
        udhar_clearance: "Udhar clearance",
        transfer: "Cash / Bank transfer"
    };

    return labels[purpose] || purpose || "Other";
}

// ==========================================
// LOAD AND CALCULATE REPORT FROM SUPABASE
// ==========================================

async function peCalculateReport(fromDate, toDate) {

    const [
        { data: salesData, error: salesError },
        { data: cashData, error: cashError }
    ] = await Promise.all([
        VasundharaDB.select("sales"),
        VasundharaDB.select("cash_bank_transactions")
    ]);

    if (salesError) throw salesError;
    if (cashError) throw cashError;

    const allSales = (salesData || []).map(sale => ({
        ...sale,
        invoiceNumber: sale.invoice_number || "",
        customerName: sale.customer_name || "",
        finalAmount: Number(sale.final_amount) || 0,
        profit: Number(sale.profit) || 0
    }));

    const allCashRecords = (cashData || []).map(record => ({
        ...record,
        amount: Number(record.amount) || 0,
        account: record.account,
        direction: record.direction,
        purpose: record.purpose,
        details: record.details || ""
    }));

    const matchingSales = allSales.filter(sale =>
        sale.date &&
        sale.date >= fromDate &&
        sale.date <= toDate
    );

    // Full invoice revenue, regardless of payment method.
    const totalRevenue = matchingSales.reduce(
        (sum, sale) => sum + peGetInvoiceAmount(sale),
        0
    );

    // Independent sum of manually entered invoice profits.
    const totalProfit = matchingSales.reduce(
        (sum, sale) => sum + (Number(sale.profit) || 0),
        0
    );

    // Only Business Expense, House Expense and Loss.
    const matchingExpenses = allCashRecords.filter(record =>
        record.date &&
        record.date >= fromDate &&
        record.date <= toDate &&
        record.direction === "out" &&
        PE_EFFECTIVE_EXPENSES.includes(record.purpose) &&
        Number(record.amount) > 0
    );

    const totalExpenses = matchingExpenses.reduce(
        (sum, record) => sum + (Number(record.amount) || 0),
        0
    );

    // House Expense + Loss only.
    const profitComparisonExpenses = matchingExpenses.filter(record =>
        PE_PROFIT_EXPENSES.includes(record.purpose)
    );

    const totalHouseAndLoss = profitComparisonExpenses.reduce(
        (sum, record) => sum + (Number(record.amount) || 0),
        0
    );

    const revenueDifference = totalRevenue - totalExpenses;

    const profitAfterHouseAndLoss = totalProfit - totalHouseAndLoss;

    return {
        sales: matchingSales,
        expenses: matchingExpenses,
        profitComparisonExpenses,
        totalRevenue,
        totalProfit,
        totalExpenses,
        totalHouseAndLoss,
        revenueDifference,
        profitAfterHouseAndLoss
    };
}

// ==========================================
// DISPLAY PROFIT VS EXPENSE PAGE
// ==========================================

async function renderProfitExpensePage(fromDate, toDate) {

    const from = fromDate || peFirstDayOfMonth();
    const to = toDate || peToday();

    const report = await peCalculateReport(from, to);

    const revenueLabel = report.revenueDifference >= 0
        ? "Revenue remaining after effective Money Out"
        : "Effective Money Out exceeds revenue";

    const revenueClass = report.revenueDifference >= 0
        ? "positive"
        : "negative";

    const profitLabel = report.profitAfterHouseAndLoss >= 0
        ? "Profit remaining after House Expense and Loss"
        : "House Expense and Loss exceed sales profit";

    const profitClass = report.profitAfterHouseAndLoss >= 0
        ? "positive"
        : "negative";

    // Effective outgoing transaction details.
    const expenseRows = report.expenses.length
        ? report.expenses
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(record => `
                <tr>
                    <td>${peFormatDate(record.date)}</td>
                    <td>${peEscape(record.account === "cash" ? "Cash" : "UPI / Bank")}</td>
                    <td>${peEscape(peExpenseLabel(record.purpose))}</td>
                    <td>${peEscape(record.details || "—")}</td>
                    <td>${peMoney(record.amount)}</td>
                </tr>
            `).join("")
        : `
            <tr>
                <td colspan="5" class="empty-note">
                    No effective outgoing expenses found in this date range.
                </td>
            </tr>
        `;

    // Sales invoice details.
    const salesRows = report.sales.length
        ? report.sales
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(sale => `
                <tr>
                    <td>${peFormatDate(sale.date)}</td>
                    <td>${peEscape(sale.invoiceNumber || "—")}</td>
                    <td>${peEscape(sale.customerName || "—")}</td>
                    <td>${peMoney(peGetInvoiceAmount(sale))}</td>
                    <td>${peMoney(sale.profit)}</td>
                </tr>
            `).join("")
        : `
            <tr>
                <td colspan="5" class="empty-note">
                    No sales found in this date range.
                </td>
            </tr>
        `;

    // Expense category breakdown.
    const categoryTotals = {};

    report.expenses.forEach(record => {
        const label = peExpenseLabel(record.purpose);

        categoryTotals[label] =
            (categoryTotals[label] || 0) + Number(record.amount || 0);
    });

    const categoryRows = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([label, amount]) => `
            <tr>
                <td>${peEscape(label)}</td>
                <td>${peMoney(amount)}</td>
            </tr>
        `).join("");

    return `
        <div class="panel">
            <div class="panel-head">
                <div>
                    <h3>Revenue vs Money Out</h3>
                    <div class="panel-sub">
                        Compare full invoice revenue with effective expenses.
                    </div>
                </div>

                <button type="button" class="muted-link" id="peExportBtn">
                    Export report CSV ↓
                </button>
            </div>

            <div class="form-row" style="margin-top:18px; align-items:end;">
                <label class="panel-sub">
                    From date
                    <input type="date" class="date-input"
                        id="peFromDate" value="${peEscape(from)}">
                </label>

                <label class="panel-sub">
                    To date
                    <input type="date" class="date-input"
                        id="peToDate" value="${peEscape(to)}">
                </label>

                <button type="button" class="small-button" id="peApplyBtn">
                    Apply date range
                </button>
            </div>
        </div>

        <div style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));
            gap:16px;
            align-items:start;
        ">

            <div class="panel">
                <h3>Revenue vs Effective Money Out</h3>
                <div class="panel-sub">
                    ${peFormatDate(from)} to ${peFormatDate(to)}
                </div>

                <div class="info-box" style="margin-top:16px">
                    <span>Total invoice revenue</span>
                    <b>${peMoney(report.totalRevenue)}</b>
                </div>

                <div class="info-box" style="margin-top:9px">
                    <span>Business Expense</span>
                    <b>${peMoney(
                        report.expenses
                            .filter(r => r.purpose === "business_expense")
                            .reduce((s, r) => s + Number(r.amount || 0), 0)
                    )}</b>
                </div>

                <div class="info-box" style="margin-top:9px">
                    <span>House Expense</span>
                    <b>${peMoney(
                        report.expenses
                            .filter(r => r.purpose === "house_expense")
                            .reduce((s, r) => s + Number(r.amount || 0), 0)
                    )}</b>
                </div>

                <div class="info-box" style="margin-top:9px">
                    <span>Loss</span>
                    <b>${peMoney(
                        report.expenses
                            .filter(r => r.purpose === "loss")
                            .reduce((s, r) => s + Number(r.amount || 0), 0)
                    )}</b>
                </div>

                <div class="info-box" style="margin-top:9px">
                    <span>Total effective Money Out</span>
                    <b>${peMoney(report.totalExpenses)}</b>
                </div>

                <div class="info-box" style="margin-top:9px">
                    <span>${revenueLabel}</span>
                    <b class="${revenueClass}">
                        ${report.revenueDifference < 0 ? "−" : ""}
                        ${peMoney(Math.abs(report.revenueDifference))}
                    </b>
                </div>

                <p class="panel-sub" style="margin-top:12px">
                    Only Business Expense, House Expense and Loss are
                    included. Other, advance refunds and internal transfers
                    are excluded.
                </p>
            </div>

            <div>
                <div class="panel">
                    <h3>Total Sales Profit</h3>
                    <div class="panel-sub">
                        Independent sum of profit entered on all invoices.
                    </div>

                    <div style="margin-top:24px">
                        <div class="stat-value">
                            ${peMoney(report.totalProfit)}
                        </div>
                        <div class="panel-sub" style="margin-top:8px">
                            From ${report.sales.length} invoice(s).
                        </div>
                    </div>
                </div>

                <div class="panel">
                    <h3>Profit vs House Expense and Loss</h3>
                    <div class="panel-sub">
                        Business expenses are not included in this comparison.
                    </div>

                    <div class="info-box" style="margin-top:16px">
                        <span>Total sales profit</span>
                        <b>${peMoney(report.totalProfit)}</b>
                    </div>

                    <div class="info-box" style="margin-top:9px">
                        <span>House Expense + Loss</span>
                        <b>${peMoney(report.totalHouseAndLoss)}</b>
                    </div>

                    <div class="info-box" style="margin-top:9px">
                        <span>${profitLabel}</span>
                        <b class="${profitClass}">
                            ${report.profitAfterHouseAndLoss < 0 ? "−" : ""}
                            ${peMoney(Math.abs(report.profitAfterHouseAndLoss))}
                        </b>
                    </div>
                </div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-head">
                <div>
                    <h3>Effective Money Out breakdown</h3>
                    <div class="panel-sub">
                        Only Business Expense, House Expense and Loss.
                    </div>
                </div>
            </div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Expense category</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryRows || `
                            <tr>
                                <td colspan="2" class="empty-note">
                                    No effective expenses recorded in this period.
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <div class="panel-head">
                <div>
                    <h3>Sales invoice details</h3>
                    <div class="panel-sub">
                        Full invoice amount and manually entered profit.
                    </div>
                </div>
            </div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Invoice</th>
                            <th>Customer</th>
                            <th>Invoice amount</th>
                            <th>Profit</th>
                        </tr>
                    </thead>
                    <tbody>${salesRows}</tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <div class="panel-head">
                <div>
                    <h3>Effective Money Out details</h3>
                    <div class="panel-sub">
                        Only the three included outgoing categories are shown.
                    </div>
                </div>
            </div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Account</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>${expenseRows}</tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <h3>How this report works</h3>
            <p class="panel-sub">
                Revenue includes the full final amount of every invoice,
                regardless of payment method.
            </p>
            <p class="panel-sub">
                Effective Money Out includes only Business Expense,
                House Expense and Loss. Other outgoing transactions,
                such as returning an advance to a customer, are excluded.
            </p>
            <p class="panel-sub">
                The separate profit comparison subtracts only House Expense
                and Loss from total invoice profit. Business expenses are
                excluded from that comparison.
            </p>
        </div>
    `;
}

// ==========================================
// APPLY DATE RANGE
// ==========================================

document.addEventListener("click", async function(event) {
    if (event.target.id !== "peApplyBtn") return;

    const from = document.getElementById("peFromDate").value;
    const to = document.getElementById("peToDate").value;

    if (!from || !to) {
        toast("Please select both dates.");
        return;
    }

    if (from > to) {
        toast("From date cannot be later than To date.");
        return;
    }

    const pageContent = document.getElementById("pageContent");

    try {
        pageContent.innerHTML = "<div class='panel'>Loading report...</div>";
        pageContent.innerHTML = await renderProfitExpensePage(from, to);
    } catch (error) {
        console.error("Profit vs Expense report error:", error);
        toast("Unable to load the report. Please try again.");
    }
});

// ==========================================
// EXPORT REPORT CSV
// ==========================================

document.addEventListener("click", async function(event) {
    if (event.target.id !== "peExportBtn") return;

    const from = document.getElementById("peFromDate").value;
    const to = document.getElementById("peToDate").value;

    if (!from || !to || from > to) {
        toast("Please select a valid date range first.");
        return;
    }

    try {
        const report = await peCalculateReport(from, to);

        const rows = [
            ["Report", "Revenue vs Effective Money Out"],
            ["From date", from],
            ["To date", to],
            [],
            ["Main comparison"],
            ["Total invoice revenue", report.totalRevenue],
            ["Total effective Money Out", report.totalExpenses],
            ["Revenue minus effective Money Out", report.revenueDifference],
            [],
            ["Separate sales profit comparison"],
            ["Total sales profit", report.totalProfit],
            ["House Expense + Loss", report.totalHouseAndLoss],
            ["Profit after House Expense + Loss", report.profitAfterHouseAndLoss],
            [],
            ["Sales invoice details"],
            ["Date", "Invoice", "Customer", "Invoice amount", "Profit"],
            ...report.sales.map(sale => [
                sale.date,
                sale.invoiceNumber || "",
                sale.customerName || "",
                peGetInvoiceAmount(sale),
                Number(sale.profit) || 0
            ]),
            [],
            ["Effective Money Out details"],
            ["Date", "Account", "Category", "Description", "Amount"],
            ...report.expenses.map(record => [
                record.date,
                record.account === "cash" ? "Cash" : "UPI / Bank",
                peExpenseLabel(record.purpose),
                record.details || "",
                Number(record.amount) || 0
            ])
        ];

        const csv = rows.map(row =>
            row.map(value =>
                `"${String(value ?? "").replace(/"/g, '""')}"`
            ).join(",")
        ).join("\n");

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `revenue-vs-money-out-${from}-to-${to}.csv`;
        link.click();

        URL.revokeObjectURL(url);

        toast("Report exported.");

    } catch (error) {
        console.error("Report export error:", error);
        toast("Unable to export the report. Please try again.");
    }
});
